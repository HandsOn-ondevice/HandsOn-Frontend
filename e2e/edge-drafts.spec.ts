import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const liveEdge = process.env.HANDSON_E2E_EDGE_DRAFTS === '1';
const expertToken = process.env.HANDSON_E2E_EXPERT_TOKEN ?? 'demo-expert-token';
const operatorToken = process.env.HANDSON_E2E_OPERATOR_TOKEN ?? 'demo-operator-token';
const viewport = { width: 412, height: 920 };
const draftsPath = '/api/v1/procedures/drafts';
const recordingPath = '/api/v1/recordings';
const transcriptionPath = '/api/v1/transcriptions';
const profilesPath = '/api/v1/work-profiles';

type WorkProfile = { id: string; name: string; environmentId: string };
type Draft = {
  id: string;
  environmentId: string;
  generator: string;
  revision: number;
  title: string;
  recordingId: string;
  confirmedText: string;
  steps: { id: string; title: string; description: string; needsReview: boolean }[];
  pendingItems: string[];
  execution: Record<string, unknown> | null;
};
type Procedure = { procedureId: string; version: string; steps: string[]; title: string };
type LostResponse<T> = { body: unknown; status: number; data: T };

test.skip(!liveEdge, '격리된 로컬 Edge 시뮬레이션 서버를 대상으로 실행합니다.');
test.use({
  viewport,
  isMobile: true,
  hasTouch: true,
  actionTimeout: 10_000,
  trace: 'off',
  video: 'off',
  screenshot: 'off',
});

function readEdgeResponse(page: Page, origin: string, method: string, path: string) {
  return page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.origin === origin && url.pathname === path && response.request().method() === method;
  });
}

async function loseNextResponse<T>(page: Page, url: string) {
  let lost: LostResponse<T> | undefined;
  await page.route(
    url,
    async (route) => {
      const response = await route.fetch();
      lost = {
        status: response.status(),
        body: route.request().postDataJSON(),
        data: (await response.json()) as T,
      };
      await route.abort('failed');
    },
    { times: 1 },
  );
  return () => lost;
}

async function enterRole(page: Page, origin: string, role: 'expert' | 'student') {
  await page.goto('/');
  await expect(page.getByText('Edge 서버 인증을 확인해 주세요.', { exact: true })).toBeVisible();
  try {
    await page
      .getByLabel('Edge 접속 토큰', { exact: true })
      .fill(role === 'expert' ? expertToken : operatorToken);
  } catch {
    throw new Error('작업 환경을 불러올 접속 토큰을 입력하지 못했습니다.');
  }
  const profiles = readEdgeResponse(page, origin, 'GET', profilesPath);
  await page.getByRole('button', { name: '다시 시도', exact: true }).click();
  const response = await profiles;
  expect(response.status()).toBe(200);
  const [profile] = (await response.json()) as WorkProfile[];
  expect(profile).toMatchObject({
    id: expect.any(String),
    name: expect.any(String),
    environmentId: expect.any(String),
  });

  await page
    .getByRole('radio', {
      name: role === 'expert' ? '숙련 연구생, 절차 생성·승인' : '신규 연구생, 승인된 절차 실행',
      exact: true,
    })
    .click();
  await page.getByRole('button', { name: /^연구실: / }).click();
  await page.getByRole('radio', { name: profile.name, exact: true }).click();
  await page.getByRole('button', { name: '설정하고 계속', exact: true }).click();
  return profile;
}

async function editFirstStep(page: Page, description: string) {
  await page.getByRole('button', { name: '1단계 작업 설명 검토', exact: true }).click();
  await page.getByRole('button', { name: '작업 설명 검토 편집', exact: true }).click();
  await page.getByRole('textbox', { name: '단계 내용', exact: true }).fill(description);
  await page.getByRole('button', { name: '편집 적용', exact: true }).click();
}

test('모바일에서 확정 전사문으로 초안을 한 번 생성하고 저장한 리비전을 승인한다', async ({
  page,
  context,
  request,
}, testInfo) => {
  test.setTimeout(120_000);
  const edgeUrl = process.env.EXPO_PUBLIC_HANDSON_EDGE_BASE_URL?.trim();
  if (!edgeUrl) throw new Error('EXPO_PUBLIC_HANDSON_EDGE_BASE_URL을 설정해 주세요.');
  const { origin, hostname } = new URL(edgeUrl);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(hostname)) {
    throw new Error('초안과 승인 상태를 변경하는 검사는 격리된 로컬 Edge에서만 실행합니다.');
  }

  const title = `거리 확인 검증 ${randomUUID().slice(0, 8)}`;
  const originalText = '모의 거리 센서의 측정 대상을 정면에 둡니다.';
  const confirmedText = '모의 거리 센서의 측정 대상을 정면에 둔 뒤 센서 상태를 확인합니다.';
  const savedStep = '측정 대상을 센서 정면에 두고 모의 거리값을 확인합니다.';
  const remoteStep = '측정 대상을 센서 정면에 두고 모의 거리값과 갱신 시각을 확인합니다.';
  const approvalReason = '모의 센서로 편집한 단계와 실행 기준의 반영을 확인했습니다.';
  const expertHeaders = { Authorization: `Bearer ${expertToken}` };

  const profile = await enterRole(page, origin, 'expert');
  await page.getByRole('button', { name: '새 절차 음성으로 만들기', exact: true }).click();
  await page.getByRole('textbox', { name: '절차 이름', exact: true }).fill(title);
  const uploaded = readEdgeResponse(page, origin, 'POST', recordingPath);
  await page.route(`${origin}${transcriptionPath}`, async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    const { recordingId } = route.request().postDataJSON() as { recordingId: string };
    const seeded = await request.post(`${origin}/api/v1/simulation/transcripts`, {
      headers: expertHeaders,
      data: { requestId: randomUUID(), recordingId, text: originalText },
    });
    expect(seeded.status()).toBe(200);
    await route.continue();
  });
  const transcribed = readEdgeResponse(page, origin, 'POST', transcriptionPath);
  await page
    .getByLabel('준비된 오디오 파일', { exact: true })
    .setInputFiles(join(testInfo.config.rootDir, 'fixtures', 'edge-transcription.m4a'));
  await expect(page).toHaveURL(/\/transcription\?recordingId=recording-/);
  const transcriptionToken = page.getByLabel('숙련자 토큰', { exact: true });
  const needsTranscriptionToken = await Promise.race([
    transcriptionToken.waitFor({ state: 'visible' }).then(() => true),
    uploaded.then(() => false),
  ]);
  if (needsTranscriptionToken) {
    try {
      await transcriptionToken.fill(expertToken);
    } catch {
      throw new Error('전사 화면에 숙련자 토큰을 입력하지 못했습니다.');
    }
    await page.getByRole('button', { name: '연결하고 진행', exact: true }).click();
  }
  const uploadResponse = await uploaded;
  expect(uploadResponse.status()).toBe(201);
  const { recordingId } = (await uploadResponse.json()) as { recordingId: string };
  const transcriptionResponse = await transcribed;
  expect(transcriptionResponse.status()).toBe(201);
  const transcription = await transcriptionResponse.json();
  expect(transcription).toMatchObject({
    recordingId,
    text: originalText,
    provider: 'explicit-transcript-fixture',
  });
  const transcript = page.getByRole('textbox', { name: '변환 텍스트', exact: true });
  await expect(transcript).toHaveValue(originalText);
  await transcript.fill(confirmedText);

  const readLostCreate = await loseNextResponse<Draft>(page, `${origin}${draftsPath}`);
  const create = page.getByRole('button', { name: 'AI 절차 초안 생성', exact: true });
  await expect(create).toBeInViewport();
  await create.click();
  await expect(page.getByText(/초안을 생성하지 못/)).toBeVisible();
  await expect(transcript).not.toBeEditable();
  const lostCreate = readLostCreate();
  expect(lostCreate).toMatchObject({
    status: 201,
    body: {
      requestId: expect.any(String),
      title,
      confirmedText,
      recordingId,
      environmentId: profile.environmentId,
    },
    data: { title, confirmedText, recordingId, revision: 0, generator: 'simulation-template-v1' },
  });

  const created = readEdgeResponse(page, origin, 'POST', draftsPath);
  await page.getByRole('button', { name: /다시 시도/ }).click();
  const createdResponse = await created;
  expect(createdResponse.status()).toBe(201);
  expect(createdResponse.headers()['x-idempotent-replay']).toBe('true');
  expect(createdResponse.request().postDataJSON()).toEqual(lostCreate?.body);
  const draft = (await createdResponse.json()) as Draft;
  expect(draft.id).toBe(lostCreate?.data.id);
  const draftUrl = `/expert/drafts/${draft.id}`;
  const draftPath = `/api/v1/procedures/${draft.id}/draft`;
  await expect(page).toHaveURL(draftUrl);
  await expect(page.getByText('리비전 0', { exact: true })).toBeVisible();

  await editFirstStep(page, savedStep);
  await page.getByRole('button', { name: '기준값 검토', exact: true }).click();
  await page.getByRole('textbox', { name: '거리 최솟값 (cm)', exact: true }).fill('17');
  await page.getByRole('textbox', { name: '거리 최댓값 (cm)', exact: true }).fill('28');
  await page.getByRole('textbox', { name: '조건 1 이름', exact: true }).fill('거리 확인 조건');
  await page.getByRole('textbox', { name: '조건 1 반복 (회)', exact: true }).fill('4');
  await page.getByTestId('edge-draft-step-review-transcript').click();
  await page.getByTestId('edge-draft-pending-0').click();
  await page.getByTestId('edge-draft-pending-1').click();
  await page.getByRole('button', { name: '기준 적용', exact: true }).click();

  const saved = readEdgeResponse(page, origin, 'PATCH', draftPath);
  const save = page.getByRole('button', { name: '임시 저장', exact: true });
  await expect(save).toBeInViewport();
  await save.click();
  const savedResponse = await saved;
  expect(savedResponse.status()).toBe(200);
  const savedDraft = (await savedResponse.json()) as Draft;
  const expectedExecution = {
    distanceMinCm: 17,
    distanceMaxCm: 28,
    conditions: [{ id: expect.any(String), label: '거리 확인 조건', repetitions: 4 }],
  };
  expect(savedResponse.request().postDataJSON()).toMatchObject({
    expectedRevision: 0,
    steps: [{ id: draft.steps[0].id, description: savedStep, needsReview: false }],
    pendingItems: [],
    execution: expectedExecution,
  });
  expect(savedDraft).toMatchObject({
    id: draft.id,
    revision: 1,
    steps: [{ id: draft.steps[0].id, description: savedStep, needsReview: false }],
    pendingItems: [],
    execution: expectedExecution,
  });
  await expect(page.getByText('초안을 저장했습니다', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '초안으로 돌아가기', exact: true }).click();
  await page.getByRole('button', { name: '뒤로가기', exact: true }).click();
  await expect(page).toHaveURL(/\/transcription\?recordingId=recording-/);
  await page.getByRole('button', { name: '뒤로가기', exact: true }).click();
  await expect(page).toHaveURL('/expert/procedures/new');
  await page.getByRole('button', { name: '뒤로가기', exact: true }).click();
  await expect(page).toHaveURL('/expert');
  const reopened = readEdgeResponse(page, origin, 'GET', draftPath);
  await page
    .getByRole('button', { name: new RegExp(title) })
    .first()
    .click();
  const reopenedResponse = await reopened;
  expect(reopenedResponse.status()).toBe(200);
  expect(await reopenedResponse.json()).toEqual(savedDraft);
  await expect(page).toHaveURL(draftUrl);
  await expect(page.getByText('리비전 1', { exact: true })).toBeVisible();
  await expect(page.getByText(savedStep, { exact: true })).toBeVisible();

  const remoteWrite = await request.patch(`${origin}${draftPath}`, {
    headers: expertHeaders,
    data: {
      requestId: randomUUID(),
      expectedRevision: 1,
      steps: savedDraft.steps.map((step) => ({ ...step, description: remoteStep })),
      pendingItems: savedDraft.pendingItems,
      execution: savedDraft.execution,
    },
  });
  expect(remoteWrite.status()).toBe(200);
  const remoteDraft = (await remoteWrite.json()) as Draft;
  expect(remoteDraft.revision).toBe(2);

  await editFirstStep(page, '이전 리비전 편집');
  const staleSave = readEdgeResponse(page, origin, 'PATCH', draftPath);
  await save.click();
  const staleResponse = await staleSave;
  expect(staleResponse.request().postDataJSON()).toMatchObject({ expectedRevision: 1 });
  expect(staleResponse.status()).toBe(409);
  expect(await staleResponse.json()).toMatchObject({ error: { code: 'REVISION_CONFLICT' } });
  const refreshed = readEdgeResponse(page, origin, 'GET', draftPath);
  await page.getByRole('button', { name: '최신 초안 불러오기', exact: true }).click();
  const refreshedResponse = await refreshed;
  expect(refreshedResponse.status()).toBe(200);
  expect(await refreshedResponse.json()).toEqual(remoteDraft);
  await expect(page.getByText('리비전 2', { exact: true })).toBeVisible();
  await expect(page.getByText(remoteStep, { exact: true })).toBeVisible();

  const approvalPath = `/api/v1/procedures/${draft.id}/approve`;
  await page.getByRole('button', { name: '최종 승인 검토', exact: true }).click();
  const equipmentConfirmed = page.getByTestId('release-equipment-confirmed');
  const reviewConfirmed = page.getByTestId('release-review-confirmed');
  await equipmentConfirmed.click();
  await reviewConfirmed.click();
  const reason = page.getByRole('textbox', { name: '승인 사유', exact: true });
  const approve = page.getByTestId('release-approve');
  await expect(approve).toBeDisabled();
  await reason.fill(approvalReason);

  const remoteWriteBeforeApproval = await request.patch(`${origin}${draftPath}`, {
    headers: expertHeaders,
    data: {
      requestId: randomUUID(),
      expectedRevision: 2,
      steps: remoteDraft.steps,
      pendingItems: remoteDraft.pendingItems,
      execution: remoteDraft.execution,
    },
  });
  expect(remoteWriteBeforeApproval.status()).toBe(200);
  const latestDraft = (await remoteWriteBeforeApproval.json()) as Draft;
  expect(latestDraft.revision).toBe(3);

  const staleApproval = readEdgeResponse(page, origin, 'POST', approvalPath);
  const approvalRefresh = readEdgeResponse(page, origin, 'GET', draftPath);
  await approve.click();
  const staleApprovalResponse = await staleApproval;
  expect(staleApprovalResponse.status()).toBe(409);
  expect(staleApprovalResponse.request().postDataJSON()).toMatchObject({ expectedRevision: 2 });
  expect(await staleApprovalResponse.json()).toMatchObject({
    error: { code: 'REVISION_CONFLICT' },
  });
  expect(await (await approvalRefresh).json()).toEqual(latestDraft);
  await expect(page.getByText(/최신 초안을 다시 검토/)).toBeVisible();
  await expect(approve).toBeDisabled();
  await expect(reason).toHaveValue(approvalReason);
  await equipmentConfirmed.click();
  await reviewConfirmed.click();

  const readLostApproval = await loseNextResponse<Procedure>(page, `${origin}${approvalPath}`);
  await expect(approve).toBeInViewport();
  await approve.click();
  await expect(page.getByRole('alert')).toContainText('승인·배포 요청에 실패했어요.');
  await expect(reason).not.toBeEditable();
  const lostApproval = readLostApproval();
  expect(lostApproval).toMatchObject({
    status: 201,
    data: { procedureId: draft.id, version: '1.0.0', title, steps: [remoteStep] },
  });

  const approved = readEdgeResponse(page, origin, 'POST', approvalPath);
  await approve.click();
  const approvalResponse = await approved;
  expect(approvalResponse.status()).toBe(201);
  expect(approvalResponse.headers()['x-idempotent-replay']).toBe('true');
  expect(approvalResponse.request().postDataJSON()).toEqual(lostApproval?.body);
  expect(approvalResponse.request().postDataJSON()).toMatchObject({
    expectedRevision: 3,
    reason: approvalReason,
    requestId: expect.any(String),
  });
  const release = (await approvalResponse.json()) as Procedure;
  expect(release).toEqual(lostApproval?.data);
  await expect(page.getByText(`${release.version} 승인·배포 완료`, { exact: true })).toBeVisible();

  const student = await context.newPage();
  const studentProfile = await enterRole(student, origin, 'student');
  expect(studentProfile.id).toBe(profile.id);
  const openProcedures = student.getByRole('button', { name: '전체 보기', exact: true });
  await expect(openProcedures).toBeVisible();
  const proceduresPath = '/api/v1/procedures';
  const listed = readEdgeResponse(student, origin, 'GET', proceduresPath);
  await openProcedures.click();
  const listResponse = await listed;
  expect(listResponse.status()).toBe(200);
  expect(new URL(listResponse.url()).searchParams.get('environmentId')).toBe(profile.environmentId);
  expect(await listResponse.json()).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ procedureId: draft.id, version: release.version }),
    ]),
  );
  await student.getByRole('button', { name: new RegExp(title) }).click();
  const procedurePath = `${proceduresPath}/${draft.id}`;
  const detailed = readEdgeResponse(student, origin, 'GET', procedurePath);
  await student.getByRole('button', { name: '선택한 절차 확인', exact: true }).click();
  const detailResponse = await detailed;
  expect(detailResponse.status()).toBe(200);
  expect(new URL(detailResponse.url()).searchParams.get('version')).toBe(release.version);
  expect(await detailResponse.json()).toMatchObject({
    procedureId: draft.id,
    version: release.version,
    steps: [remoteStep],
    execution: expectedExecution,
  });
  await expect(student.getByText(remoteStep, { exact: true })).toBeVisible();
  await expect(student.getByText(`승인 버전 ${release.version}`, { exact: false })).toBeVisible();
  expect(await student.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    viewport.width,
  );

  const allDrafts = await request.get(`${origin}${draftsPath}`, { headers: expertHeaders });
  expect(allDrafts.status()).toBe(200);
  expect(((await allDrafts.json()) as Draft[]).filter((entry) => entry.title === title)).toEqual([
    latestDraft,
  ]);

  await testInfo.attach('edge-drafts-evidence', {
    contentType: 'application/json',
    body: JSON.stringify(
      {
        viewport,
        profileId: profile.id,
        environmentId: profile.environmentId,
        recordingId,
        transcriptionId: transcription.id,
        procedureId: draft.id,
        approvedVersion: release.version,
        requests: [
          ['POST', recordingPath, 201],
          ['POST', transcriptionPath, 201],
          ['POST', draftsPath, 201, 'response lost in browser'],
          ['POST', draftsPath, 201, 'idempotent replay, same procedure ID'],
          ['PATCH', draftPath, 200, 'revision 0 to 1'],
          ['GET', draftPath, 200, 'reopened from expert home at revision 1'],
          ['PATCH', draftPath, 200, 'another client saved revision 2'],
          ['PATCH', draftPath, 409, 'REVISION_CONFLICT'],
          ['GET', draftPath, 200, 'latest revision 2'],
          ['PATCH', draftPath, 200, 'another client saved revision 3'],
          ['POST', approvalPath, 409, 'REVISION_CONFLICT'],
          ['GET', draftPath, 200, 'latest revision 3'],
          ['POST', approvalPath, 201, 'approved revision 3, response lost in browser'],
          ['POST', approvalPath, 201, 'idempotent replay, same procedure ID and version'],
          ['GET', `${proceduresPath}?environmentId=${profile.environmentId}`, 200],
          ['GET', `${procedurePath}?version=${release.version}`, 200],
        ],
      },
      null,
      2,
    ),
  });
});
