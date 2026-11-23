import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import fixture from './fixtures/edge-approval.json';
import {
  capture,
  descriptions,
  edgeResponse,
  generateDemoDraft,
  holdRule,
  releaseDemoDraft,
  resumeRule,
  saveDemoDraft,
} from './helpers/edge-demo-approval';
import { button } from './helpers/edge-session';

const viewport = { width: 412, height: 920 };
const proceduresPath = '/api/v1/procedures';
const draftsPath = `${proceduresPath}/drafts`;
const sessionsPath = '/api/v1/sessions';
const healthPath = '/api/v1/system/health';

type Profile = { id: string; environmentId: string };
type Procedure = { procedureId: string; version: string; title: string };

test.use({
  viewport,
  isMobile: true,
  hasTouch: true,
  trace: 'off',
  video: 'off',
  screenshot: 'off',
});

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
  const draft = await generateDemoDraft(
    expert,
    origin,
    request,
    expertToken,
    info,
    profile.environmentId,
    true,
  );
  const draftUrl = `/expert/drafts/${draft.id}`;
  const draftPath = `${proceduresPath}/${draft.id}/draft`;
  const approvalPath = `${proceduresPath}/${draft.id}/approve`;

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

    const saved = await saveDemoDraft(expert, origin, draft, 3);
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
    for (const text of Object.values(descriptions))
      await expect(expert.getByText(text, { exact: true })).toBeVisible();
    await button(expert, '7단계 완료').scrollIntoViewIfNeeded();
    await capture(expert, info, '05-reopened-rules');
    await button(expert, '기준값 검토').click();
    await expect(
      expert.getByRole('textbox', { name: '거리 최솟값 (cm)', exact: true }),
    ).toHaveValue('15');
    await expect(
      expert.getByRole('textbox', { name: '거리 최댓값 (cm)', exact: true }),
    ).toHaveValue('25');
    await expect(
      expert.getByRole('textbox', { name: '조도 최솟값 (원시값)', exact: true }),
    ).toHaveValue('1500');
    await capture(expert, info, '06-reopened-criteria');
    await button(expert, '뒤로가기').click();

    const approved = await releaseDemoDraft(expert, origin, saved);
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
      steps: saved.steps.map(({ description }) => description),
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
