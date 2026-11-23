import { randomUUID } from 'node:crypto';
import {
  expect,
  test,
  type APIRequestContext,
  type APIResponse,
  type Locator,
  type Page,
  type Response,
} from '@playwright/test';

const viewport = { width: 412, height: 920 };
const sessionsPath = '/api/v1/sessions';
const environmentId = 'kit-lab';
const homePath = (role: 'student' | 'expert') => `/api/v1/home/${role}`;
const resultPath = (id: string) => `/api/v1/results/${id}`;
const checkLabels = {
  powerOff: 'USB 전원 장치 OFF 확인',
  cables: '센서 케이블 분리와 정리',
  storage: 'LED 모듈·지그 원위치',
};

type Command = { type: string; [field: string]: string | boolean };
type CommandRequest = { requestId: string; expectedRevision: number; command: Command };
type Attempt = {
  attemptId: string;
  status: string;
  cursor: { conditionId: string };
  report: {
    diagnostics: { sensors: { readings: { metricId: string; value: number; unit: string }[] }[] };
  };
};
type Session = {
  sessionId: string;
  workflowVersion: string;
  revision: number;
  phase: string;
  pendingJob: unknown;
  procedure: {
    procedureId: string;
    version: string;
    title: string;
    preparation: { id: string; owner: 'system' | 'operator' }[];
    execution: { conditions: { id: string; label: string; repetitions: number }[] };
  };
  execution: { cursor: { cursorId: string } | null; attempts: Attempt[] };
  cleanup: {
    attempts: {
      attemptId: string;
      status: string;
      response: { state: string; dataOrigin: string };
    }[];
    checks: { id: string; checked: boolean; evidenceId: string | null }[];
  };
  submission: { status: string; resultId: string; sessionId: string; submittedAt: string };
  resultId: string;
  events: { type: string; resultId?: string }[];
};
type Result = {
  id: string;
  session: Session;
  completedCycles: number;
  totalCycles: number;
  publicationStatus: string;
  dataOrigin: string;
};
type ExpertEntry = {
  id: string;
  procedureId: string;
  studentName: string;
  deviceName: string;
  summary: string;
};
type ExpertHome = { results: ExpertEntry[] };
type StudentHome = {
  ongoingSession: { id: string; completedCycles: number } | null;
  approvedProcedures: { id: string; title: string; version: string }[];
  recentResults: { id: string; sessionId: string }[];
};
type SubmitAttempt = {
  request: CommandRequest;
  key: string | null;
  replay: string | undefined;
  status: number;
  dropped: boolean;
  session: Session;
};

test.use({
  viewport,
  isMobile: true,
  hasTouch: true,
  actionTimeout: 10_000,
  trace: 'off',
  screenshot: 'off',
  video: 'off',
});

async function readJson<T>(response: APIResponse | Response, status = 200): Promise<T> {
  expect(response.status(), new URL(response.url()).pathname).toBe(status);
  return (await response.json()) as T;
}

function isolatedEdge(request: APIRequestContext) {
  const origin = new URL(process.env.EXPO_PUBLIC_HANDSON_EDGE_BASE_URL ?? '');
  const operator = process.env.HANDSON_E2E_OPERATOR_TOKEN;
  const expert = process.env.HANDSON_E2E_EXPERT_TOKEN;
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname) || !operator || !expert) {
    throw new Error('Use a dedicated loopback Edge with a disposable DB and both role tokens.');
  }
  const token = { student: operator, expert };
  return {
    origin: origin.origin,
    token,
    async read<T>(path: string, role: keyof typeof token = 'student', status = 200) {
      const response = await request.get(`${origin.origin}${path}`, {
        headers: { Authorization: `Bearer ${token[role]}` },
      });
      return readJson<T>(response, status);
    },
    async command(session: Session, command: Command) {
      const requestId = randomUUID();
      const response = await request.post(
        `${origin.origin}${sessionsPath}/${session.sessionId}/commands`,
        {
          headers: { Authorization: `Bearer ${operator}`, 'Idempotency-Key': requestId },
          data: { requestId, expectedRevision: session.revision, command },
        },
      );
      return readJson<Session>(response);
    },
  };
}

type Edge = ReturnType<typeof isolatedEdge>;

function requestMatches(response: Response, edge: Edge, method: string, path: string) {
  const url = new URL(response.url());
  return (
    url.origin === edge.origin &&
    url.pathname + url.search === path &&
    response.request().method() === method
  );
}

function button(page: Page, name: string) {
  return page.getByRole('button', { name, exact: true });
}

async function click(page: Page, locator: Locator) {
  await locator.scrollIntoViewIfNeeded();
  await expect(locator).toBeInViewport({ ratio: 1 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    viewport.width,
  );
  await locator.click();
}

async function enterHome(page: Page, edge: Edge, role: keyof Edge['token']) {
  await page.goto('/');
  await page
    .getByRole('radio', {
      name: role === 'student' ? '신규 연구생, 승인된 절차 실행' : '숙련 연구생, 절차 생성·승인',
    })
    .click();
  try {
    await page.getByLabel('Edge 접속 토큰', { exact: true }).fill(edge.token[role]);
  } catch {
    throw new Error('Could not fill the disposable local Edge token field.');
  }
  await button(page, '작업 환경 불러오기').click();
  await page.getByRole('button', { name: /^연구실: / }).click();
  await page.getByRole('radio', { name: '지급 키트 실습실', exact: true }).click();
  const response = page.waitForResponse((item) =>
    requestMatches(item, edge, 'GET', `${homePath(role)}?environmentId=${environmentId}`),
  );
  await button(page, '설정하고 계속').click();
  await expect(
    page.getByRole('heading', { name: role === 'student' ? '연구생 홈' : '숙련자 홈' }),
  ).toBeVisible();
  return response;
}

async function seedEarlierRounds(edge: Edge, created: Session) {
  let session = created;
  const path = `${sessionsPath}/${created.sessionId}`;
  async function send(command: Command) {
    session = await edge.command(session, command);
  }
  async function waitForJob() {
    await expect
      .poll(async () => {
        session = await edge.read<Session>(path);
        return session.pendingJob;
      })
      .toBeNull();
  }

  for (const { id } of created.procedure.preparation.filter(({ owner }) => owner === 'operator')) {
    await send({ type: 'setPreparationCheck', checkId: id, checked: true });
  }
  await send({ type: 'completePreparation' });
  await send({ type: 'startDeviceCheck' });
  await waitForJob();
  expect(session.phase).toBe('readyToExecute');
  await send({ type: 'startExecution' });

  const total = created.procedure.execution.conditions.reduce(
    (sum, item) => sum + item.repetitions,
    0,
  );
  for (let index = 0; index < total - 1; index += 1) {
    const cursorId = session.execution.cursor?.cursorId;
    if (!cursorId) throw new Error('Missing cursor for a seeded Edge round.');
    await send({ type: 'requestExecutionSample', cursorId });
    await waitForJob();
    const attempt = session.execution.attempts.at(-1);
    expect(attempt?.status).toBe('ready');
    if (!attempt) throw new Error('Edge did not report the seeded measurement.');
    await send({ type: 'completeExecutionStep', cursorId, sampleAttemptId: attempt.attemptId });
  }
  return { session, total };
}

test('마지막 회차부터 정리·제출 응답 유실 후 재시도와 숙련자 결과 공개까지 Edge에서 확인한다', async ({
  page,
  browser,
  request,
}, testInfo) => {
  test.setTimeout(120_000);
  const edge = isolatedEdge(request);
  const health = await edge.read<{ executionMode: string; hardwareVerified: boolean }>(
    '/api/v1/system/health',
  );
  expect(health).toMatchObject({ executionMode: 'simulation', hardwareVerified: false });
  const expertHomePath = `${homePath('expert')}?environmentId=${environmentId}`;
  const studentHomePath = `${homePath('student')}?environmentId=${environmentId}`;

  const initialHome = await readJson<StudentHome>(await enterHome(page, edge, 'student'));
  const procedure = initialHome.approvedProcedures.find(
    ({ id, version }) => id === 'kit-distance' && version === '1.1.0',
  );
  if (!procedure) throw new Error('The pinned Edge procedure is missing from the student home.');
  await page
    .getByRole('button', {
      name: `${procedure.title}, ${procedure.version}, 승인 절차 선택`,
      exact: true,
    })
    .click();
  const createResponse = page.waitForResponse((item) =>
    requestMatches(item, edge, 'POST', sessionsPath),
  );
  await click(page, button(page, '이 버전으로 준비 시작'));
  const createdResponse = await createResponse;
  const created = await readJson<Session>(createdResponse, 201);
  const createInput = createdResponse.request().postDataJSON();
  expect(createInput).toMatchObject({
    workflowVersion: '2.0',
    procedureId: procedure.id,
    procedureVersion: procedure.version,
    workProfileId: 'kit-distance-v1',
  });
  expect(await createdResponse.request().headerValue('idempotency-key')).toBe(
    createInput.requestId,
  );
  const sessionId = created.sessionId;
  const sessionPath = `${sessionsPath}/${sessionId}`;
  const commandsPath = `${sessionPath}/commands`;
  const routePath = `/researcher-workflow/${sessionId}`;
  await expect(page).toHaveURL(`${routePath}/preparation`);

  const { session, total } = await seedEarlierRounds(edge, created);
  const cursorId = session.execution.cursor?.cursorId;
  if (!cursorId) throw new Error('Missing cursor for the last Edge round.');

  const home = await readJson<StudentHome>(await enterHome(page, edge, 'student'));
  expect(home.ongoingSession).toMatchObject({ id: sessionId, completedCycles: total - 1 });
  await click(page, button(page, '이어서 진행'));
  await expect(page).toHaveURL(`${routePath}/execution`);
  await expect(page.getByText(`회차 ID ${cursorId}`, { exact: true })).toBeVisible();

  function nextCommand(type: string) {
    return page.waitForResponse(
      (response) =>
        requestMatches(response, edge, 'POST', commandsPath) &&
        (response.request().postDataJSON() as CommandRequest).command.type === type,
    );
  }
  const sampleResponse = nextCommand('requestExecutionSample');
  await click(page, button(page, '측정 요청'));
  const sample = await sampleResponse;
  await readJson<Session>(sample);
  expect(sample.request().postDataJSON()).toMatchObject({
    command: { type: 'requestExecutionSample', cursorId },
  });
  await expect(button(page, '회차 완료')).toBeEnabled();
  const completeResponse = nextCommand('completeExecutionStep');
  await click(page, button(page, '회차 완료'));
  const complete = await completeResponse;
  const measured = await readJson<Session>(complete);
  expect(measured).toMatchObject({
    sessionId,
    phase: 'awaitingCleanup',
    execution: { cursor: null },
  });
  const lastAttempt = measured.execution.attempts.at(-1);
  expect(lastAttempt?.status).toBe('valid');
  expect(complete.request().postDataJSON()).toMatchObject({
    command: { type: 'completeExecutionStep', cursorId, sampleAttemptId: lastAttempt?.attemptId },
  });
  expect(measured.execution.attempts.filter(({ status }) => status === 'valid')).toHaveLength(
    total,
  );
  const outputStop = measured.cleanup.attempts.at(-1);
  expect(outputStop).toMatchObject({
    status: 'passed',
    response: { state: 'off', dataOrigin: 'simulation' },
  });
  await expect(page).toHaveURL(`${routePath}/review`);
  await expect(page.getByRole('heading', { name: '최종 측정 검토', exact: true })).toBeVisible();
  await expect(page.getByText(`유효 측정 ${total} / ${total}`, { exact: true })).toBeVisible();
  expect(
    (await edge.read<ExpertHome>(expertHomePath, 'expert')).results.some(
      ({ id }) => id === sessionId,
    ),
  ).toBe(false);
  await edge.read(resultPath(sessionId), 'expert', 404);
  const preview = await edge.read<Result>(resultPath(sessionId));
  expect(preview).toMatchObject({
    id: sessionId,
    publicationStatus: 'preview',
    completedCycles: total,
    totalCycles: total,
  });

  await click(page, button(page, '장치 정리로 이동'));
  await expect(page).toHaveURL(`${routePath}/cleanup`);
  await expect(page.getByRole('heading', { name: '종료와 장치 정리', exact: true })).toBeVisible();
  await expect(page.getByText('LED 출력 종료 응답을 받았어요', { exact: true })).toBeVisible();
  const resultButton = button(page, '결과 요약 보기');
  await expect(resultButton).toHaveCount(0);
  const cleanupRequests: CommandRequest[] = [];
  for (const [id, label] of Object.entries(checkLabels)) {
    const check = page.getByRole('checkbox', { name: label, exact: true });
    const checked = nextCommand('setCleanupCheck');
    await click(page, check);
    const response = await checked;
    const body = response.request().postDataJSON() as CommandRequest;
    expect(body.command).toEqual({ type: 'setCleanupCheck', checkId: id, checked: true });
    expect(await response.request().headerValue('idempotency-key')).toBe(body.requestId);
    const state = await readJson<Session>(response);
    expect(state.cleanup.checks.find(({ id: checkId }) => checkId === id)).toMatchObject({
      checked: true,
      evidenceId: expect.any(String),
    });
    await expect(check).toBeChecked();
    cleanupRequests.push(body);
  }
  const ready = await edge.read<Session>(sessionPath);
  expect(ready).toMatchObject({ phase: 'readyToSubmit', submission: { status: 'not_submitted' } });
  const savedPreview = page.waitForResponse((item) =>
    requestMatches(item, edge, 'GET', resultPath(sessionId)),
  );
  await click(page, resultButton);
  await expect(page).toHaveURL(`${routePath}/results`);
  await expect(page.getByRole('heading', { name: '결과 요약', exact: true })).toBeVisible();
  expect(await readJson<Result>(await savedPreview)).toMatchObject({
    id: sessionId,
    publicationStatus: 'preview',
    completedCycles: total,
  });
  const [previewCondition] = preview.session.procedure.execution.conditions;
  const previewEvidence = page.waitForResponse((response) =>
    requestMatches(response, edge, 'GET', resultPath(sessionId)),
  );
  await click(
    page,
    page.getByRole('button', { name: `${previewCondition.label} 조건,`, exact: false }),
  );
  await expect(page).toHaveURL(
    `${routePath}/measurement-details?conditionId=${previewCondition.id}`,
  );
  expect(await readJson<Result>(await previewEvidence)).toMatchObject({
    id: sessionId,
    publicationStatus: 'preview',
  });
  await expect(
    page.getByRole('heading', { name: `${previewCondition.label} 조건 상세` }),
  ).toBeVisible();
  await expect(
    page.getByText(`유효 ${previewCondition.repetitions}건 · 무효 0건`, { exact: true }),
  ).toBeVisible();
  await click(page, button(page, '전체 결과로 돌아가기'));
  await expect(page).toHaveURL(`${routePath}/results`);

  const attempts: SubmitAttempt[] = [];
  await page.route(`${edge.origin}${commandsPath}`, async (route) => {
    const req = route.request();
    if (req.method() !== 'POST') return route.continue();
    const body = req.postDataJSON() as CommandRequest;
    if (body.command.type !== 'submitResult') return route.continue();
    const serverResponse = await route.fetch({ maxRedirects: 0 });
    if (!serverResponse.ok()) return route.fulfill({ response: serverResponse });
    const dropped = attempts.length === 0;
    attempts.push({
      request: body,
      key: await req.headerValue('idempotency-key'),
      status: serverResponse.status(),
      replay: serverResponse.headers()['x-idempotent-replay'],
      dropped,
      session: (await serverResponse.json()) as Session,
    });
    // Drop delivery only after the real server has accepted and persisted the submission.
    if (dropped) await route.abort('failed');
    else await route.fulfill({ response: serverResponse });
  });

  await click(page, button(page, '결과 제출'));
  const retry = button(page, '다시 시도');
  await expect(retry).toBeEnabled();
  await expect(page.getByText('Edge 요청을 완료하지 못했어요', { exact: true })).toBeVisible();
  expect(attempts).toHaveLength(1);
  await expect(page.getByText('결과를 제출했습니다', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Edge 접속 토큰', { exact: true })).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath('01-submit-response-lost.png'),
    animations: 'disabled',
  });
  const committed = await edge.read<Session>(sessionPath);
  expect(committed).toMatchObject({
    phase: 'completed',
    submission: { status: 'submitted', sessionId },
  });
  const resultId = committed.submission.resultId;

  await click(page, retry);
  await expect(page.getByText('결과를 제출했습니다', { exact: true })).toBeVisible();
  await expect(page.getByText(`결과 ID · ${resultId}`, { exact: true })).toBeVisible();
  expect(attempts.map(({ status, replay, dropped }) => [status, replay, dropped])).toEqual([
    [200, 'false', true],
    [200, 'true', false],
  ]);
  const [initial, replay] = attempts;
  expect(initial.request).toMatchObject({
    expectedRevision: ready.revision,
    command: { type: 'submitResult' },
  });
  expect(initial.key).toBe(initial.request.requestId);
  expect(replay.key).toBe(initial.key);
  expect(replay.request).toEqual(initial.request);
  expect(replay.session).toMatchObject({
    sessionId,
    resultId,
    submission: {
      status: 'submitted',
      sessionId,
      resultId,
      submittedAt: committed.submission.submittedAt,
    },
  });
  expect(replay.session).toEqual(initial.session);
  const final = await edge.read<Session>(sessionPath);
  expect(final.events.filter(({ type }) => type === 'resultSubmitted')).toEqual([
    expect.objectContaining({ resultId }),
  ]);
  expect(
    (await edge.read<StudentHome>(studentHomePath)).recentResults.filter(
      (item) => item.sessionId === sessionId,
    ),
  ).toEqual([expect.objectContaining({ id: resultId })]);
  await page.screenshot({
    path: testInfo.outputPath('02-submission-receipt.png'),
    animations: 'disabled',
  });
  const studentResult = page.waitForResponse((response) =>
    requestMatches(response, edge, 'GET', resultPath(resultId)),
  );
  await click(page, button(page, '제출한 결과 보기'));
  await expect(page).toHaveURL(`/results/${resultId}?sessionId=${sessionId}`);
  expect(await readJson<Result>(await studentResult)).toMatchObject({
    id: resultId,
    publicationStatus: 'submitted',
  });
  await expect(page.getByText('제출한 결과', { exact: true })).toBeVisible();

  const expert = await browser.newPage({
    baseURL: testInfo.project.use.baseURL,
    viewport,
    isMobile: true,
    hasTouch: true,
  });
  try {
    const expertHome = await readJson<ExpertHome>(await enterHome(expert, edge, 'expert'));
    const entries = expertHome.results.filter(({ id }) => id === resultId);
    expect(entries).toHaveLength(1);
    const [item] = entries;
    const expertResult = expert.waitForResponse((response) =>
      requestMatches(response, edge, 'GET', resultPath(resultId)),
    );
    await click(
      expert,
      button(expert, `${item.studentName} · ${item.deviceName}, 검토 대기, ${item.summary}`),
    );
    await expect(expert).toHaveURL(`/expert/results/${resultId}?procedureId=${item.procedureId}`);
    const published = await readJson<Result>(await expertResult);
    expect(published).toMatchObject({
      id: resultId,
      publicationStatus: 'submitted',
      dataOrigin: 'simulation',
      session: { sessionId },
      completedCycles: total,
      totalCycles: total,
    });
    const [condition] = published.session.procedure.execution.conditions;
    const validReadings = published.session.execution.attempts
      .filter(({ status, cursor }) => status === 'valid' && cursor.conditionId === condition.id)
      .map(({ report }) =>
        report.diagnostics.sensors
          .flatMap(({ readings }) => readings)
          .find(({ metricId }) => metricId === 'distance'),
      );
    expect(validReadings).toHaveLength(condition.repetitions);
    const evidence = expert.waitForResponse((response) =>
      requestMatches(response, edge, 'GET', resultPath(resultId)),
    );
    await click(
      expert,
      expert.getByRole('button', { name: `${condition.label} 조건,`, exact: false }),
    );
    expect((await readJson<Result>(await evidence)).id).toBe(resultId);
    await expect(
      expert.getByRole('heading', { name: `${condition.label} 조건 상세` }),
    ).toBeVisible();
    for (const [index, reading] of validReadings.entries()) {
      if (!reading)
        throw new Error('Missing distance reading in the published measurement evidence.');
      await expect(
        expert.getByText(`${index + 1}회차 · 유효 · ${reading.value} ${reading.unit}`, {
          exact: true,
        }),
      ).toBeVisible();
    }
    await expert.screenshot({
      path: testInfo.outputPath('03-expert-result-evidence.png'),
      animations: 'disabled',
    });
  } finally {
    await expert.close();
  }

  await testInfo.attach('edge-submission-evidence', {
    contentType: 'application/json',
    body: JSON.stringify(
      {
        viewport,
        sessionId,
        cursorId,
        resultId,
        total,
        stopAttemptId: outputStop?.attemptId,
        cleanup: cleanupRequests.map(({ command }) => command),
        submitted: attempts.map(({ request: body, key, status, replay, dropped }) => ({
          request: body,
          key,
          status,
          replay,
          dropped,
        })),
        submittedAt: final.submission.submittedAt,
        serverSubmissionEvents: final.events.filter(({ type }) => type === 'resultSubmitted')
          .length,
      },
      null,
      2,
    ),
  });
});
