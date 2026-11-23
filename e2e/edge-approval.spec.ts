import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import fixture from './fixtures/edge-approval.json';

const viewport = { width: 412, height: 920 };
const proceduresPath = '/api/v1/procedures';
const draftsPath = `${proceduresPath}/drafts`;
const sessionsPath = '/api/v1/sessions';
const healthPath = '/api/v1/system/health';
const transcriptionPath = '/api/v1/transcriptions';
const criteria = { distanceMinCm: 15, distanceMaxCm: 25, lightMinRaw: 1500 };
const holdRule = '조도값이 1500 ADC 미만이면 작업을 보류합니다.';
const resumeRule =
  '거리 15~25 cm와 조도 1500 ADC 이상을 재확인한 뒤 작업자가 명시적으로 재개합니다.';
const changedSteps = [
  {
    id: 'device-connection',
    title: '장치 연결',
    text: 'Orange Pi 전원을 켜고 초음파 센서와 조도 센서의 연결 상태를 확인합니다.',
  },
  { id: 'hold', title: '보류', text: holdRule },
  { id: 'resume', title: '재개', text: resumeRule },
];

type Profile = { id: string; environmentId: string };
type Procedure = { procedureId: string; version: string; title: string };
type Draft = {
  id: string;
  status: string;
  revision: number;
  steps: typeof fixture.steps;
  pendingItems: string[];
  execution: (typeof criteria & { conditions: { label: string; repetitions: number }[] }) | null;
};

test.use({
  viewport,
  isMobile: true,
  hasTouch: true,
  trace: 'off',
  video: 'off',
  screenshot: 'off',
});

function button(page: Page, name: string) {
  return page.getByRole('button', { name, exact: true });
}

function edgeResponse(page: Page, origin: string, method: string, path: string) {
  return page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.origin === origin && url.pathname === path && response.request().method() === method;
  });
}

async function enterRole(page: Page, origin: string, role: 'expert' | 'student', token: string) {
  await page.goto('/');
  await page
    .getByRole('radio', {
      name: role === 'expert' ? '숙련 연구생, 절차 생성·승인' : '신규 연구생, 승인된 절차 실행',
      exact: true,
    })
    .click();
  await page.getByLabel('Edge 접속 토큰', { exact: true }).fill(token);
  const profiles = edgeResponse(page, origin, 'GET', '/api/v1/work-profiles');
  const environments = edgeResponse(page, origin, 'GET', '/api/v1/environments');
  await button(page, '작업 환경 불러오기').click();
  const profileResponse = await profiles;
  const environmentResponse = await environments;
  expect(profileResponse.status()).toBe(200);
  expect(environmentResponse.status()).toBe(200);
  const [profile] = (await profileResponse.json()) as Profile[];
  const labs = (await environmentResponse.json()) as { id: string; name: string }[];
  const lab = labs.find(({ id }) => id === profile.environmentId);
  if (!lab) throw new Error('격리 Edge에 작업 프로필과 연결된 환경이 없습니다.');
  await page.getByRole('button', { name: /^연구실: / }).click();
  await page.getByRole('radio', { name: lab.name, exact: true }).click();
  await button(page, '설정하고 계속').click();
  await expect(page).toHaveURL(role === 'expert' ? '/expert' : '/student');
  return profile;
}

async function capture(page: Page, info: TestInfo, name: string) {
  const path = info.outputPath(`${name}.png`);
  await page.screenshot({ path, animations: 'disabled' });
  await info.attach(name, { path, contentType: 'image/png' });
}

test('US-01~03 숙련자가 승인한 절차 버전을 독립 연구생 브라우저에서 준비한다', async ({
  page: expert,
  browser,
  request,
}, info) => {
  test.setTimeout(120_000);
  const edge = new URL(process.env.EXPO_PUBLIC_HANDSON_EDGE_BASE_URL ?? '');
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(edge.hostname)) {
    throw new Error('이 검사는 별도 저장소를 사용하는 로컬 Edge에서만 실행합니다.');
  }
  const { origin } = edge;
  const expertToken = process.env.HANDSON_E2E_EXPERT_TOKEN ?? 'demo-expert-token';
  const operatorToken = process.env.HANDSON_E2E_OPERATOR_TOKEN ?? 'demo-operator-token';
  const expertHeaders = { Authorization: `Bearer ${expertToken}` };
  const operatorHeaders = { Authorization: `Bearer ${operatorToken}` };
  const health = await request.get(`${origin}${healthPath}`);
  expect(health.status()).toBe(200);
  expect(await health.json()).toMatchObject({
    executionMode: 'simulation',
    dataOrigin: 'simulation',
    components: { led: 'off' },
  });
  const existingDrafts = await request.get(`${origin}${draftsPath}`, { headers: expertHeaders });
  expect(existingDrafts.status()).toBe(200);
  expect(
    await existingDrafts.json(),
    '재실행 전 격리 Edge를 다시 시작해 데이터를 비워 주세요.',
  ).not.toContainEqual(expect.objectContaining({ title: fixture.title }));

  const profile = await enterRole(expert, origin, 'expert', expertToken);
  await button(expert, '새 절차 음성으로 만들기').click();
  await expert.getByRole('textbox', { name: '절차 이름', exact: true }).fill(fixture.title);
  await expert.route(`${origin}${transcriptionPath}`, async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    const { recordingId } = route.request().postDataJSON() as { recordingId: string };
    const seeded = await request.post(`${origin}/api/v1/simulation/transcripts`, {
      headers: expertHeaders,
      data: { requestId: randomUUID(), recordingId, text: fixture.transcript },
    });
    expect(seeded.status()).toBe(200);
    await route.continue();
  });
  const transcribed = edgeResponse(expert, origin, 'POST', transcriptionPath);
  await expert
    .getByLabel('준비된 오디오 파일', { exact: true })
    .setInputFiles(join(info.config.rootDir, 'fixtures', 'edge-transcription.m4a'));
  const transcriptionResponse = await transcribed;
  expect(transcriptionResponse.status()).toBe(201);
  const transcription = await transcriptionResponse.json();
  expect(transcription).toMatchObject({
    provider: 'explicit-transcript-fixture',
    text: fixture.transcript,
  });
  await expect(expert.getByRole('textbox', { name: '변환 텍스트', exact: true })).toHaveValue(
    fixture.transcript,
  );
  await capture(expert, info, '01-transcript');

  const creating = edgeResponse(expert, origin, 'POST', draftsPath);
  await button(expert, 'AI 절차 초안 생성').click();
  const createdResponse = await creating;
  expect(createdResponse.status()).toBe(201);
  expect(createdResponse.request().postDataJSON()).toMatchObject({
    title: fixture.title,
    recordingId: transcription.recordingId,
    confirmedText: fixture.transcript,
    environmentId: profile.environmentId,
  });
  const draft = (await createdResponse.json()) as Draft;
  expect(draft).toMatchObject({
    status: 'draft',
    revision: 0,
    execution: null,
    generator: fixture.generator,
    steps: fixture.steps,
  });
  const draftUrl = `/expert/drafts/${draft.id}`;
  const draftPath = `${proceduresPath}/${draft.id}/draft`;
  const approvalPath = `${proceduresPath}/${draft.id}/approve`;
  await expect(expert).toHaveURL(draftUrl);
  await expect(expert.getByText('임시 저장됨 · 승인 전', { exact: true })).toBeVisible();
  const stepButtons = expert.getByRole('button', { name: /^\d+단계 / });
  await expect(stepButtons).toHaveCount(fixture.steps.length);
  for (const [index, { title }] of fixture.steps.entries()) {
    await expect(stepButtons.nth(index)).toHaveAccessibleName(`${index + 1}단계 ${title}`);
  }
  await capture(expert, info, '02-unapproved-draft');

  await expect(button(expert, '임시 저장')).toBeDisabled();
  await button(expert, '최종 승인 검토').click();
  const approve = expert.getByTestId('release-approve');
  const reason = expert.getByRole('textbox', { name: '승인 사유', exact: true });
  await expect(expert.getByText(/실행 기준을 입력해 주세요/)).toBeVisible();
  await expert.getByTestId('release-equipment-confirmed').check();
  await expert.getByTestId('release-review-confirmed').check();
  await reason.fill('환경 대응 기준과 단계별 작업 지시를 확인했습니다.');
  await expect(approve).toBeDisabled();
  const rejected = await request.post(`${origin}${approvalPath}`, {
    headers: expertHeaders,
    data: { requestId: randomUUID(), expectedRevision: 0, reason: '미완성 초안 승인 차단 검증' },
  });
  expect(rejected.status()).toBe(422);
  expect(await rejected.json()).toMatchObject({ error: { code: 'REVIEW_REQUIRED' } });
  await capture(expert, info, '03-approval-blocked');
  await button(expert, '편집으로 돌아가기').click();

  const studentContext = await browser.newContext({
    baseURL: info.project.use.baseURL,
    viewport,
    isMobile: true,
    hasTouch: true,
  });
  try {
    const student = await studentContext.newPage();
    const studentProfile = await enterRole(student, origin, 'student', operatorToken);
    expect(studentProfile).toMatchObject({ id: profile.id, environmentId: profile.environmentId });
    const openStudentList = async () => {
      const listing = edgeResponse(student, origin, 'GET', proceduresPath);
      await student.getByRole('tab', { name: '실험', exact: true }).click();
      const response = await listing;
      expect(response.status()).toBe(200);
      expect(new URL(response.url()).searchParams.get('environmentId')).toBe(profile.environmentId);
      await expect(student.getByText(/^승인된 절차 \d+개$/)).toBeVisible();
      return (await response.json()) as Procedure[];
    };
    const studentCard = student.getByRole('button', { name: new RegExp(fixture.title) });
    expect(await openStudentList()).not.toContainEqual(
      expect.objectContaining({ procedureId: draft.id }),
    );
    await expect(studentCard).toHaveCount(0);
    await expect(button(student, '선택한 절차 확인')).toBeDisabled();
    await capture(student, info, '04-student-before-approval');

    const before = await request.get(`${origin}${sessionsPath}`, { headers: operatorHeaders });
    expect(before.status()).toBe(200);
    const previousSessions = (await before.json()) as { sessionId: string }[];
    const requestId = randomUUID();
    const blockedStart = await request.post(`${origin}${sessionsPath}`, {
      headers: { ...operatorHeaders, 'Idempotency-Key': requestId },
      data: {
        requestId,
        procedureId: draft.id,
        procedureVersion: 'draft',
        workProfileId: profile.id,
        operatorId: 'operator-01',
      },
    });
    expect(blockedStart.status()).toBe(404);
    expect(await blockedStart.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });

    for (const { id, title, text } of changedSteps) {
      const index = fixture.steps.findIndex((step) => step.id === id);
      await button(expert, `${index + 1}단계 ${title}`).click();
      await button(expert, `${title} 편집`).click();
      const stepName = expert.getByRole('textbox', { name: '단계 이름', exact: true });
      const content = expert.getByRole('textbox', { name: '단계 내용', exact: true });
      await expect(stepName).toHaveValue(title);
      await content.fill(text);
      await button(expert, '편집 적용').click();
      await expect(content).toBeHidden();
      await expect(expert.getByText(text, { exact: true })).toBeVisible();
    }
    await button(expert, '기준값 검토').click();
    const min = expert.getByRole('textbox', { name: '거리 최솟값 (cm)', exact: true });
    const max = expert.getByRole('textbox', { name: '거리 최댓값 (cm)', exact: true });
    const light = expert.getByRole('textbox', { name: '조도 최솟값 (원시값)', exact: true });
    await min.fill(String(criteria.distanceMinCm));
    await max.fill(String(criteria.distanceMaxCm));
    await light.fill(String(criteria.lightMinRaw));
    await expert.getByRole('textbox', { name: '조건 1 이름', exact: true }).fill('거리·조도 정상');
    for (const { id } of fixture.steps) await expert.getByTestId(`edge-draft-step-${id}`).check();
    for (const [index] of draft.pendingItems.entries()) {
      await expert.getByTestId(`edge-draft-pending-${index}`).check();
    }
    await button(expert, '기준 적용').click();
    const saving = edgeResponse(expert, origin, 'PATCH', draftPath);
    await button(expert, '임시 저장').click();
    const savedResponse = await saving;
    expect(savedResponse.status()).toBe(200);
    const expectedSteps = fixture.steps.map((step) => ({
      ...step,
      description: changedSteps.find(({ id }) => id === step.id)?.text ?? step.description,
      needsReview: false,
    }));
    expect(savedResponse.request().postDataJSON()).toMatchObject({
      expectedRevision: 0,
      steps: expectedSteps,
      pendingItems: [],
      execution: criteria,
    });
    const saved = (await savedResponse.json()) as Draft;
    expect(saved).toMatchObject({
      id: draft.id,
      revision: 1,
      steps: expectedSteps,
      pendingItems: [],
      execution: criteria,
    });
    await expect(expert.getByText('초안을 저장했습니다', { exact: true })).toBeVisible();
    await button(expert, '초안으로 돌아가기').click();
    for (const path of [/\/transcription\?recordingId=/, '/expert/procedures/new', '/expert']) {
      await button(expert, '뒤로가기').click();
      await expect(expert).toHaveURL(path);
    }
    const reopening = edgeResponse(expert, origin, 'GET', draftPath);
    await expert
      .getByRole('button', { name: new RegExp(fixture.title) })
      .first()
      .click();
    const reopened = await reopening;
    expect(reopened.status()).toBe(200);
    expect(await reopened.json()).toEqual(saved);
    await expect(expert).toHaveURL(draftUrl);
    await expect(expert.getByText('리비전 1', { exact: true })).toBeVisible();
    for (const { text } of changedSteps)
      await expect(expert.getByText(text, { exact: true })).toBeVisible();
    await button(expert, '7단계 완료').scrollIntoViewIfNeeded();
    await capture(expert, info, '05-reopened-rules');
    await button(expert, '기준값 검토').click();
    await expect(min).toHaveValue('15');
    await expect(max).toHaveValue('25');
    await expect(light).toHaveValue('1500');
    await capture(expert, info, '06-reopened-criteria');
    await button(expert, '뒤로가기').click();

    await button(expert, '최종 승인 검토').click();
    await reason.fill('거리 15~25 cm와 조도 1500 ADC, 보류·재개 안내를 검토했습니다.');
    await expert.getByTestId('release-equipment-confirmed').check();
    await expect(approve).toBeDisabled();
    await expert.getByTestId('release-review-confirmed').check();
    await expect(approve).toBeEnabled();
    const approving = edgeResponse(expert, origin, 'POST', approvalPath);
    await approve.click();
    const approvedResponse = await approving;
    expect(approvedResponse.status()).toBe(201);
    const approved = (await approvedResponse.json()) as Procedure;
    expect(approved).toMatchObject({
      procedureId: draft.id,
      title: fixture.title,
      approval: 'approved',
      draftRevision: saved.revision,
      execution: saved.execution,
    });
    expect(approved.version).not.toBe('draft');
    await expect(
      expert.getByText(`${approved.version} 승인·배포 완료`, { exact: true }),
    ).toBeVisible();
    await expect(expert.getByText(`${fixture.title}\n절차 ID`, { exact: false })).toBeVisible();
    await capture(expert, info, '07-expert-approved');

    await button(student, '뒤로가기').click();
    await expect(student).toHaveURL('/student');
    expect(await openStudentList()).toContainEqual(
      expect.objectContaining({
        procedureId: draft.id,
        version: approved.version,
        title: fixture.title,
      }),
    );
    await studentCard.click();
    const detailing = edgeResponse(student, origin, 'GET', `${proceduresPath}/${draft.id}`);
    await button(student, '선택한 절차 확인').click();
    const detailed = await detailing;
    expect(detailed.status()).toBe(200);
    expect(new URL(detailed.url()).searchParams.get('version')).toBe(approved.version);
    expect(await detailed.json()).toMatchObject({
      procedureId: draft.id,
      version: approved.version,
      execution: saved.execution,
      steps: expectedSteps.map(({ description }) => description),
    });
    await expect(
      student.getByText(`승인 버전 ${approved.version}`, { exact: false }),
    ).toBeVisible();
    const prepare = button(student, '이 버전으로 준비 시작');
    await expect(prepare).toBeEnabled();
    await capture(student, info, '08-student-approved-version');

    const starting = edgeResponse(student, origin, 'POST', sessionsPath);
    await prepare.click();
    const started = await starting;
    expect(started.status()).toBe(201);
    expect(started.request().postDataJSON()).toMatchObject({
      procedureId: draft.id,
      procedureVersion: approved.version,
      workProfileId: profile.id,
    });
    const createdSession = await started.json();
    const { sessionId } = createdSession as { sessionId: string };
    expect(sessionId).toMatch(/^session-/);
    expect(previousSessions.map(({ sessionId }) => sessionId)).not.toContain(sessionId);
    const sessionUrl = `/researcher-workflow/${sessionId}/preparation`;
    await expect(student).toHaveURL(sessionUrl);
    await expect(student.getByText(`세션 ${sessionId}`, { exact: true })).toBeVisible();
    const pinned = { procedureId: draft.id, version: approved.version, execution: saved.execution };
    const session = await request.get(`${origin}${sessionsPath}/${sessionId}`, {
      headers: operatorHeaders,
    });
    expect(session.status()).toBe(200);
    expect(createdSession).toMatchObject({ sessionId, phase: 'preparing', procedure: pinned });
    expect(await session.json()).toMatchObject({
      sessionId,
      phase: 'preparing',
      procedure: pinned,
    });
    const latestSensors = await request.get(`${origin}/api/v1/sensors/latest`, {
      headers: operatorHeaders,
    });
    expect(latestSensors.status()).toBe(200);
    const { sensors } = (await latestSensors.json()) as {
      sensors: { readings: { metricId: string; unit: string }[] }[];
    };
    const readings = sensors.flatMap(({ readings }) => readings);
    expect(readings).toContainEqual(expect.objectContaining({ metricId: 'distance', unit: 'cm' }));
    expect(readings).toContainEqual(expect.objectContaining({ metricId: 'lightRaw', unit: 'adc' }));
    const currentHealth = await request.get(`${origin}${healthPath}`);
    expect(currentHealth.status()).toBe(200);
    const { components } = await currentHealth.json();
    expect(components).toMatchObject({ led: 'off' });
    await capture(student, info, '09-student-preparation');
    await info.attach('edge-approval-evidence', {
      contentType: 'application/json',
      body: JSON.stringify(
        {
          environmentId: profile.environmentId,
          procedureId: draft.id,
          version: approved.version,
          draftRevision: saved.revision,
          sessionId,
          phase: 'preparing',
          execution: saved.execution,
          holdRule,
          resumeRule,
          metricUnits: { distance: 'cm', lightRaw: 'adc' },
          simulationLed: components.led,
        },
        null,
        2,
      ),
    });
  } finally {
    await studentContext.close();
  }
});
