import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { expect, test, type APIRequestContext, type Page, type TestInfo } from '@playwright/test';
import fixture from '../fixtures/edge-approval.json';
import { button } from './edge-session';

const procedures = '/api/v1/procedures';
const drafts = `${procedures}/drafts`;
const transcriptions = '/api/v1/transcriptions';
const criteria = { distanceMinCm: 15, distanceMaxCm: 25, lightMinRaw: 1500 };
export const holdRule = '조도값이 1500 ADC 미만이면 작업을 보류합니다.';
export const resumeRule =
  '거리 15~25 cm와 조도 1500 ADC 이상을 재확인한 뒤 작업자가 명시적으로 재개합니다.';
export const descriptions: Record<string, string> = {
  'device-connection': 'Orange Pi 전원을 켜고 초음파 센서와 조도 센서의 연결 상태를 확인합니다.',
  hold: holdRule,
  resume: resumeRule,
};

type Execution = typeof criteria & {
  conditions: { label: string; repetitions: number; id: string }[];
};
type Draft = {
  id: string;
  revision: number;
  steps: typeof fixture.steps;
  pendingItems: string[];
  execution: Execution | null;
};
type ApprovedProcedure = {
  procedureId: string;
  version: string;
  title: string;
  workProfileId: string;
  execution: Execution;
};

export function edgeResponse(page: Page, origin: string, method: string, path: string) {
  return page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.origin === origin && url.pathname === path && response.request().method() === method;
  });
}

export async function capture(page: Page, info: TestInfo, name: string) {
  const path = info.outputPath(`${name}.png`);
  await page.screenshot({ path, animations: 'disabled' });
  await info.attach(name, { path, contentType: 'image/png' });
}

export async function generateDemoDraft(
  expert: Page,
  origin: string,
  request: APIRequestContext,
  expertToken: string,
  info: TestInfo,
  environmentId: string,
  captureStages = false,
) {
  await expect(expert).toHaveURL('/expert');
  await button(expert, '새 절차 음성으로 만들기').click();
  await expert.getByRole('textbox', { name: '절차 이름', exact: true }).fill(fixture.title);

  const transcriptionUrl = `${origin}${transcriptions}`;
  await expert.route(transcriptionUrl, async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    const { recordingId } = route.request().postDataJSON() as { recordingId: string };
    const seeded = await request.post(`${origin}/api/v1/simulation/transcripts`, {
      headers: { Authorization: `Bearer ${expertToken}` },
      data: { requestId: randomUUID(), recordingId, text: fixture.transcript },
    });
    expect(seeded.status()).toBe(200);
    await route.continue();
  });
  const transcribing = edgeResponse(expert, origin, 'POST', transcriptions);
  await expert
    .getByLabel('준비된 오디오 파일', { exact: true })
    .setInputFiles(join(info.config.rootDir, 'fixtures', 'edge-transcription.m4a'));
  const transcript = await transcribing;
  expect(transcript.status()).toBe(201);
  const { recordingId, text, provider } = await transcript.json();
  expect({ text, provider }).toEqual({
    text: fixture.transcript,
    provider: 'explicit-transcript-fixture',
  });
  await expert.unroute(transcriptionUrl);
  await expect(expert.getByRole('textbox', { name: '변환 텍스트', exact: true })).toHaveValue(text);

  if (captureStages) await capture(expert, info, '01-transcript');

  const creating = edgeResponse(expert, origin, 'POST', drafts);
  await button(expert, 'AI 절차 초안 생성').click();
  const created = await creating;
  expect(created.status()).toBe(201);
  expect(created.request().postDataJSON()).toMatchObject({
    title: fixture.title,
    recordingId,
    confirmedText: text,
    environmentId,
  });
  const payload = (await created.json()) as Draft;
  expect(payload).toMatchObject({
    status: 'draft',
    revision: 0,
    execution: null,
    generator: fixture.generator,
    steps: fixture.steps,
  });
  await expect(expert).toHaveURL(`/expert/drafts/${payload.id}`);
  await expect(expert.getByText('임시 저장됨 · 승인 전', { exact: true })).toBeVisible();
  const stepButtons = expert.getByRole('button', { name: /^\d+단계 / });
  await expect(stepButtons).toHaveCount(fixture.steps.length);
  for (const [index, { title }] of fixture.steps.entries()) {
    await expect(stepButtons.nth(index)).toHaveAccessibleName(`${index + 1}단계 ${title}`);
  }
  if (captureStages) await capture(expert, info, '02-unapproved-draft');
  return payload;
}

export async function saveDemoDraft(
  expert: Page,
  origin: string,
  draft: Draft,
  repetitions: number,
) {
  for (const [index, step] of fixture.steps.entries()) {
    const description = descriptions[step.id];
    if (!description) continue;
    await button(expert, `${index + 1}단계 ${step.title}`).click();
    await button(expert, `${step.title} 편집`).click();
    const name = expert.getByRole('textbox', { name: '단계 이름', exact: true });
    const content = expert.getByRole('textbox', { name: '단계 내용', exact: true });
    await expect(name).toHaveValue(step.title);
    await content.fill(description);
    await button(expert, '편집 적용').click();
    await expect(content).toBeHidden();
    await expect(expert.getByText(description, { exact: true })).toBeVisible();
  }

  await button(expert, '기준값 검토').click();
  await expert
    .getByRole('textbox', { name: '거리 최솟값 (cm)', exact: true })
    .fill(String(criteria.distanceMinCm));
  await expert
    .getByRole('textbox', { name: '거리 최댓값 (cm)', exact: true })
    .fill(String(criteria.distanceMaxCm));
  await expert
    .getByRole('textbox', { name: '조도 최솟값 (원시값)', exact: true })
    .fill(String(criteria.lightMinRaw));
  const condition = { label: '거리·조도 정상', repetitions };
  await expert.getByRole('textbox', { name: '조건 1 이름', exact: true }).fill(condition.label);
  await expert
    .getByRole('textbox', { name: '조건 1 반복 (회)', exact: true })
    .fill(String(condition.repetitions));
  for (const { id } of fixture.steps) await expert.getByTestId(`edge-draft-step-${id}`).check();
  for (const [index] of draft.pendingItems.entries()) {
    await expert.getByTestId(`edge-draft-pending-${index}`).check();
  }
  await button(expert, '기준 적용').click();
  const saving = edgeResponse(expert, origin, 'PATCH', `${procedures}/${draft.id}/draft`);
  await button(expert, '임시 저장').click();
  const updated = await saving;
  expect(updated.status()).toBe(200);
  const execution = { ...criteria, conditions: [expect.objectContaining(condition)] };
  const expectedChanges = {
    pendingItems: [],
    steps: fixture.steps.map((step) => ({
      ...step,
      description: descriptions[step.id] ?? step.description,
      needsReview: false,
    })),
    execution,
  };
  expect(updated.request().postDataJSON()).toMatchObject({
    expectedRevision: draft.revision,
    ...expectedChanges,
  });
  const payload = (await updated.json()) as Draft;
  expect(payload).toMatchObject({ id: draft.id, revision: draft.revision + 1, ...expectedChanges });
  await expect(expert.getByText('초안을 저장했습니다', { exact: true })).toBeVisible();
  await button(expert, '초안으로 돌아가기').click();
  return payload;
}

export async function releaseDemoDraft(expert: Page, origin: string, saved: Draft) {
  const approve = expert.getByTestId('release-approve');
  const reason = expert.getByRole('textbox', { name: '승인 사유', exact: true });
  const equipment = expert.getByTestId('release-equipment-confirmed');
  const review = expert.getByTestId('release-review-confirmed');
  const approvalReason = '거리 15~25 cm와 조도 1500 ADC, 보류·재개 안내를 검토했습니다.';
  await button(expert, '최종 승인 검토').click();
  await reason.fill(approvalReason);
  await equipment.check();
  await expect(approve).toBeDisabled();
  await review.check();
  const approving = edgeResponse(expert, origin, 'POST', `${procedures}/${saved.id}/approve`);
  await approve.click();
  const released = await approving;
  expect(released.status()).toBe(201);
  expect(released.request().postDataJSON()).toMatchObject({
    expectedRevision: saved.revision,
    reason: approvalReason,
  });
  const approved = (await released.json()) as ApprovedProcedure;
  expect(approved).toMatchObject({
    procedureId: saved.id,
    title: fixture.title,
    approval: 'approved',
    draftRevision: saved.revision,
    execution: saved.execution,
  });
  expect(approved.version).not.toBe('draft');
  await expect(
    expert.getByText(`${approved.version} 승인·배포 완료`, { exact: true }),
  ).toBeVisible();
  await expect(
    expert.getByText(`${fixture.title}\n절차 ID · ${approved.procedureId}`, { exact: false }),
  ).toBeVisible();
  return approved;
}

export async function approveDemoProcedure(
  expert: Page,
  origin: string,
  request: APIRequestContext,
  expertToken: string,
  info: TestInfo,
) {
  const draft = await test.step('시연 전사문으로 7단계 초안 만들기', () =>
    generateDemoDraft(expert, origin, request, expertToken, info, 'kit-lab'));
  const saved = await test.step('실행 기준과 단계 안내 저장', () =>
    saveDemoDraft(expert, origin, draft, 2));
  return test.step('절차 승인·배포 확인', async () => {
    const approved = await releaseDemoDraft(expert, origin, saved);
    await capture(expert, info, '01-expert-approval');
    await button(expert, '숙련자 홈으로').click();
    await expect(expert).toHaveURL('/expert');
    return approved;
  });
}
