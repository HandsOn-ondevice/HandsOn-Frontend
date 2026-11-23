import {
  expect,
  test,
  type APIRequestContext,
  type Locator,
  type Page,
  type Response,
} from '@playwright/test';

const sessionsPath = '/api/v1/sessions';
const simulationPath = '/api/v1/simulation';
const viewport = { width: 360, height: 800 };
const runAgainstEdge = process.env.HANDSON_E2E_EDGE_SESSION === '1';

type Command =
  | { type: 'setPreparationCheck'; checkId: string; checked: boolean }
  | { type: 'requestExecutionSample'; cursorId: string }
  | { type: 'completeExecutionStep'; cursorId: string; sampleAttemptId: string }
  | { type: 'completePreparation' | 'startDeviceCheck' | 'startExecution' | 'cancel' };

type CreateBody = {
  requestId: string;
  workflowVersion: '2.0';
  procedureId: string;
  procedureVersion: string;
  workProfileId: string;
  operatorId: string;
};
type CommandBody = { requestId: string; expectedRevision: number; command: Command };
type SimulationConfig = { scenario: string; distanceCm: number; ledFailure: boolean };
type Cursor = { cursorId: string; conditionId: string; trialIndex: number };

type Session = {
  sessionId: string;
  workflowVersion?: '1.0' | '2.0';
  phase: string;
  revision: number;
  holdReason?: { code: string; message: string } | null;
  dataOrigin: string;
  checks: { id: string; checked: boolean }[];
  procedure: {
    procedureId: string;
    version: string;
    workProfileId: string;
    title: string;
    preparation: { id: string; title: string; owner: string }[];
    execution: { conditions: { id: string; label: string }[] };
  };
  events: { type: string; requestId: string }[];
  deviceChecks: {
    attemptId: string;
    status: string;
    issue?: { code: string; message: string };
  }[];
  pendingJob: { kind: string; attemptId: string } | null;
  execution?: { cursor: Cursor; attempts: { attemptId: string; status: string }[] };
};

type ObservedWrite = {
  path: string;
  body: CreateBody | CommandBody;
  key: string | null;
  status: number;
  replay: string | null;
  data?: Session;
  dropped: boolean;
  error?: { code: string };
};

test.use({ viewport, isMobile: true, hasTouch: true });
test.skip(!runAgainstEdge, 'Set HANDSON_E2E_EDGE_SESSION=1 to run against an isolated Edge.');

function button(page: Page, name: string) {
  return page.getByRole('button', { name, exact: true });
}

async function checkLayout(page: Page, locator: Locator) {
  await locator.scrollIntoViewIfNeeded();
  await expect(locator).toBeInViewport({ ratio: 1 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    viewport.width,
  );
}

async function reopen(page: Page, path: string) {
  // Keep the app's in-memory authentication while mounting the route from its session ID.
  await page.evaluate((target) => {
    history.pushState({}, '', target);
    dispatchEvent(new PopStateEvent('popstate'));
  }, path);
  await expect(page).toHaveURL(path);
}

async function enterStudentHome(page: Page, token: string) {
  await page.goto('/');
  await page.getByRole('radio', { name: '신규 연구생, 승인된 절차 실행' }).click();
  try {
    await page.getByLabel(/Edge (?:접속|API) 토큰/).fill(token);
  } catch {
    throw new Error('Could not fill the local Edge credential field.');
  }
  await page.getByRole('button', { name: /^(작업 환경 불러오기|다시 시도)$/ }).click();
  await page.getByRole('button', { name: /^연구실: / }).click();
  await page.getByRole('radio', { name: '지급 키트 실습실', exact: true }).click();
  await button(page, '설정하고 계속').click();
}

async function enterProcedure(page: Page, token: string, procedureTitle: string) {
  await enterStudentHome(page, token);
  await page.getByRole('tab', { name: '실험', exact: true }).click();
  await expect(page).toHaveURL('/procedures?environmentId=kit-lab');
  await page.getByRole('button', { name: `${procedureTitle}, 승인,` }).click();
  await button(page, '선택한 절차 확인').click();
  await expect(page).toHaveURL(/\/procedures\/kit-distance\?/);
}

function isolatedEdge(request: APIRequestContext) {
  const origin = new URL(process.env.EXPO_PUBLIC_HANDSON_EDGE_BASE_URL ?? '');
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname)) {
    throw new Error(
      'Run session E2E only on a dedicated loopback Edge with its own data directory.',
    );
  }
  const operatorToken = process.env.HANDSON_E2E_OPERATOR_TOKEN;
  const expertToken = process.env.HANDSON_E2E_EXPERT_TOKEN;
  if (!operatorToken || !expertToken) {
    throw new Error('Set the operator and expert test tokens for the isolated Edge.');
  }
  const operatorHeaders = { Authorization: `Bearer ${operatorToken}` };
  const expertHeaders = { Authorization: `Bearer ${expertToken}` };

  return {
    origin: origin.origin,
    operatorToken,
    async read<T>(path: string, role?: 'operator' | 'expert') {
      const headers =
        role === 'operator' ? operatorHeaders : role === 'expert' ? expertHeaders : undefined;
      const response = await request.get(new URL(path, origin).href, { headers });
      expect(response.status(), `GET ${path}`).toBe(200);
      return (await response.json()) as T;
    },
    async create(procedure: Session['procedure']) {
      const requestId = crypto.randomUUID();
      const response = await request.post(`${origin.origin}${sessionsPath}`, {
        headers: { ...operatorHeaders, 'Idempotency-Key': requestId },
        data: {
          requestId,
          workflowVersion: '2.0',
          procedureId: procedure.procedureId,
          procedureVersion: procedure.version,
          workProfileId: procedure.workProfileId,
          operatorId: 'operator-01',
        } satisfies CreateBody,
      });
      expect(response.status(), `POST ${sessionsPath}`).toBe(201);
      return (await response.json()) as Session;
    },
    async command(sessionId: string, expectedRevision: number, command: Command) {
      const requestId = crypto.randomUUID();
      const response = await request.post(`${origin.origin}${sessionsPath}/${sessionId}/commands`, {
        headers: { ...operatorHeaders, 'Idempotency-Key': requestId },
        data: { requestId, expectedRevision, command },
      });
      expect(response.status(), command.type).toBe(200);
      return (await response.json()) as Session;
    },
    async configure(config: SimulationConfig) {
      const response = await request.post(`${origin.origin}${simulationPath}`, {
        headers: expertHeaders,
        data: { requestId: crypto.randomUUID(), config },
      });
      expect(response.status()).toBe(200);
    },
  };
}

async function currentKitProcedure(edge: ReturnType<typeof isolatedEdge>) {
  const procedures = await edge.read<Session['procedure'][]>(
    '/api/v1/procedures?environmentId=kit-lab',
    'operator',
  );
  const procedure = procedures.find(({ procedureId }) => procedureId === 'kit-distance');
  if (!procedure) throw new Error('Isolated Edge has no approved kit-distance procedure.');
  return procedure;
}

test('모바일 S03~S06에서 실제 Edge의 재전송, 점검 판정과 첫 회차를 확인한다', async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(90_000);
  const edge = isolatedEdge(request);
  const health = await edge.read<{ executionMode: string }>('/api/v1/system/health');
  expect(health.executionMode).toBe('simulation');
  const { scenario, distanceCm, ledFailure, enabled } = await edge.read<
    SimulationConfig & { enabled: boolean }
  >(simulationPath, 'expert');
  expect(enabled).toBe(true);
  const originalConfig = { scenario, distanceCm, ledFailure };
  const previousSessions = await edge.read<Session[]>(sessionsPath, 'operator');
  expect(previousSessions.every(({ phase }) => ['completed', 'cancelled'].includes(phase))).toBe(
    true,
  );

  const procedure = await currentKitProcedure(edge);
  const writes: ObservedWrite[] = [];
  const reads: { path: string; revision: number; phase: string; attemptStatus?: string }[] = [];
  let concurrentRevision: number | undefined;
  let changedSimulation = false;
  await page.route(
    (url) =>
      url.origin === edge.origin &&
      (url.pathname === sessionsPath || url.pathname.startsWith(`${sessionsPath}/`)),
    async (route) => {
      const req = route.request();
      const path = new URL(req.url()).pathname;
      if (req.method() === 'GET') {
        const response = await route.fetch({ maxRedirects: 0 });
        if (response.ok()) {
          const state = (await response.json()) as Session;
          reads.push({
            path,
            revision: state.revision,
            phase: state.phase,
            attemptStatus: state.deviceChecks.at(-1)?.status,
          });
        }
        await route.fulfill({ response });
        return;
      }
      if (req.method() !== 'POST' || path.endsWith('/heartbeat')) {
        await route.continue();
        return;
      }

      const body = req.postDataJSON() as CreateBody | CommandBody;
      const command = 'command' in body ? body.command : undefined;
      if (
        command?.type === 'setPreparationCheck' &&
        command.checkId === 'materials' &&
        concurrentRevision === undefined &&
        'expectedRevision' in body
      ) {
        const sessionId = path.split('/').at(-2)!;
        // A separate client writes before this request reaches Edge, without modifying the app's request.
        const concurrent = await edge.command(sessionId, body.expectedRevision, {
          type: 'setPreparationCheck',
          checkId: 'distance',
          checked: true,
        });
        concurrentRevision = concurrent.revision;
      }

      const response = await route.fetch({ maxRedirects: 0 });
      const dropped =
        response.ok() &&
        (path === sessionsPath || command?.type === 'completePreparation') &&
        !writes.some((write) => write.path === path && write.dropped);
      const payload = await response.json();
      writes.push({
        path,
        body,
        key: await req.headerValue('idempotency-key'),
        status: response.status(),
        replay: response.headers()['x-idempotent-replay'] ?? null,
        data: response.ok() ? (payload as Session) : undefined,
        dropped,
        error: response.ok() ? undefined : payload.error,
      });
      // The backend has already returned a committed response. Only browser delivery is interrupted.
      if (dropped) await route.abort('failed');
      else await route.fulfill({ response });
    },
  );

  try {
    await enterProcedure(page, edge.operatorToken, procedure.title);
    await button(page, '이 버전으로 준비 시작').click();
    await expect(page).toHaveURL(/\/researcher-workflow\/[^/]+\/preparation$/);
    const creates = writes.filter(({ path }) => path === sessionsPath);
    expect(creates.map(({ status, replay, dropped }) => [status, replay, dropped])).toEqual([
      [201, 'false', true],
      [201, 'true', false],
    ]);
    const create = creates[0];
    expect(create.body).toMatchObject({
      workflowVersion: '2.0',
      procedureId: procedure.procedureId,
      procedureVersion: procedure.version,
      workProfileId: procedure.workProfileId,
      operatorId: 'operator-01',
    });
    expect(creates[1].body).toEqual(create.body);
    expect(creates.map(({ key }) => key)).toEqual([create.body.requestId, create.body.requestId]);
    const created = create.data!;
    expect(created.workflowVersion).toBe('2.0');
    expect(creates[1].data?.sessionId).toBe(created.sessionId);
    const sessionPath = `${sessionsPath}/${created.sessionId}`;
    const commandPath = `${sessionPath}/commands`;
    const sessionRoute = `/researcher-workflow/${created.sessionId}`;
    await expect(page).toHaveURL(`${sessionRoute}/preparation`);
    await expect
      .poll(() => reads.find(({ path }) => path === sessionPath))
      .toMatchObject({
        revision: created.revision,
        phase: 'preparing',
      });

    const materials = page.getByRole('checkbox', { name: '지급 부품 확인', exact: true });
    const distance = page.getByRole('checkbox', { name: '대상 배치 확인', exact: true });
    await checkLayout(page, materials);
    await materials.click();
    await expect(distance).toBeChecked();
    await expect(materials).not.toBeChecked();
    const conflict = writes.find(({ status }) => status === 409)!;
    expect(conflict).toMatchObject({
      path: commandPath,
      body: { expectedRevision: created.revision },
      error: { code: 'REVISION_CONFLICT' },
    });
    expect(reads).toContainEqual(
      expect.objectContaining({ path: sessionPath, revision: concurrentRevision }),
    );

    const checks = procedure.preparation.filter(({ owner }) => owner === 'operator');
    for (const check of checks.filter(({ id }) => id !== 'distance')) {
      const checkbox = page.getByRole('checkbox', { name: check.title, exact: true });
      await checkbox.click();
      await expect(checkbox).toBeChecked();
    }
    const retriedCheck = writes.find(
      ({ body, status }) =>
        'command' in body &&
        body.command.type === 'setPreparationCheck' &&
        body.command.checkId === 'materials' &&
        status === 200,
    );
    expect(retriedCheck?.body.requestId).not.toBe(conflict.body.requestId);
    expect(retriedCheck?.body).toMatchObject({ expectedRevision: concurrentRevision });

    const complete = button(page, '확인 완료');
    await checkLayout(page, complete);
    await page.screenshot({ path: testInfo.outputPath('s04-prepared.png') });
    await complete.click();
    await expect(page).toHaveURL(`${sessionRoute}/device-check`);
    const completions = writes.filter(
      ({ body }) => 'command' in body && body.command.type === 'completePreparation',
    );
    expect(completions.map(({ status, replay, dropped }) => [status, replay, dropped])).toEqual([
      [200, 'false', true],
      [200, 'true', false],
    ]);
    expect(completions[0].body).toEqual(completions[1].body);
    expect(completions.map(({ key }) => key)).toEqual(Array(2).fill(completions[0].body.requestId));

    const startExecution = button(page, '실험 측정 시작');
    const startingCheck = button(page, '장치·센서 점검 시작');
    await expect(page.getByText('Edge 시뮬레이션 · 센서값은 모의 데이터입니다.')).toBeVisible();
    await expect(startExecution).toBeDisabled();
    await checkLayout(page, startingCheck);
    await edge.configure({ ...originalConfig, scenario: 'disconnected', ledFailure: false });
    changedSimulation = true;
    await startingCheck.click();
    await checkLayout(page, page.getByText('장치·센서 점검 중입니다', { exact: true }));
    await expect(startExecution).toBeDisabled();
    await page.screenshot({ path: testInfo.outputPath('s05-checking.png') });

    const failure = page.getByText('장치·센서 점검에 실패했습니다', { exact: true });
    await expect(failure).toBeVisible();
    const failed = await edge.read<Session>(sessionPath, 'operator');
    const failedAttempt = failed.deviceChecks.at(-1)!;
    expect(failedAttempt).toMatchObject({
      status: 'failed',
      issue: { code: 'SENSOR_DISCONNECTED' },
    });
    expect(failed.pendingJob).toBeNull();
    const failedMessage = page.getByText(failedAttempt.issue!.message, { exact: true }).first();
    await checkLayout(page, failedMessage);
    await expect(
      page.getByText(`점검 ID ${failedAttempt.attemptId}`, { exact: true }),
    ).toBeVisible();
    await expect(startExecution).toBeDisabled();

    await reopen(page, `${sessionRoute}/preparation`);
    await expect(materials).toBeChecked();
    const beforeReopen = reads.length;
    await reopen(page, `${sessionRoute}/device-check`);
    await expect(failure).toBeVisible();
    expect(reads.slice(beforeReopen)).toContainEqual(
      expect.objectContaining({ path: sessionPath, attemptStatus: 'failed' }),
    );
    const retryCheck = button(page, '장치·센서 다시 점검');
    await checkLayout(page, retryCheck);
    await page.screenshot({ path: testInfo.outputPath('s05-failed.png') });
    await edge.configure({ scenario: 'normal', distanceCm: 20, ledFailure: false });
    await retryCheck.click();
    await expect(startExecution).toBeEnabled();
    const passed = await edge.read<Session>(sessionPath, 'operator');
    const passedAttempt = passed.deviceChecks.at(-1)!;
    expect(passed.phase).toBe('readyToExecute');
    expect(passedAttempt.status).toBe('passed');
    expect(passedAttempt.attemptId).not.toBe(failedAttempt.attemptId);
    await expect(
      page.getByText(`점검 ID ${passedAttempt.attemptId}`, { exact: true }),
    ).toBeVisible();

    const deviceRequests = writes.filter(
      ({ body }) => 'command' in body && body.command.type === 'startDeviceCheck',
    );
    expect(deviceRequests).toHaveLength(2);
    expect(deviceRequests.map(({ path }) => path)).toEqual([commandPath, commandPath]);
    expect(deviceRequests[0].body).toMatchObject({
      expectedRevision: completions[1].data?.revision,
    });
    expect(deviceRequests[1].body).toMatchObject({ expectedRevision: failed.revision });
    expect(deviceRequests.map(({ data }) => data?.pendingJob)).toEqual([
      expect.objectContaining({ kind: 'deviceCheck', attemptId: failedAttempt.attemptId }),
      expect.objectContaining({ kind: 'deviceCheck', attemptId: passedAttempt.attemptId }),
    ]);

    await reopen(page, `${sessionRoute}/preparation`);
    await expect(page.getByRole('checkbox', { name: '장치 응답 확인', exact: true })).toBeChecked();
    await reopen(page, `${sessionRoute}/device-check`);
    await expect(startExecution).toBeEnabled();
    await checkLayout(page, startExecution);
    await page.screenshot({ path: testInfo.outputPath('s05-passed.png') });
    await startExecution.click();
    await expect(page).toHaveURL(`${sessionRoute}/execution`);
    const started = writes.find(
      ({ body }) => 'command' in body && body.command.type === 'startExecution',
    )!;
    expect(started).toMatchObject({
      path: commandPath,
      body: { expectedRevision: passed.revision },
      status: 200,
      data: { sessionId: created.sessionId, phase: 'running' },
    });
    const cursor = started.data?.execution?.cursor;
    expect(cursor).toMatchObject({
      cursorId: expect.any(String),
      conditionId: procedure.execution.conditions[0].id,
      trialIndex: 1,
    });
    await checkLayout(page, page.getByRole('heading', { name: '첫 측정 회차', exact: true }));
    await expect(
      page.getByText(
        `조건 ${procedure.execution.conditions[0].label} · ${cursor!.trialIndex}회차`,
        {
          exact: true,
        },
      ),
    ).toBeVisible();
    await expect(page.getByText(`회차 ID ${cursor!.cursorId}`, { exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('s06-first-cursor.png') });

    const allSessions = await edge.read<Session[]>(sessionsPath, 'operator');
    const previousIds = new Set(previousSessions.map(({ sessionId }) => sessionId));
    expect(allSessions.filter(({ sessionId }) => !previousIds.has(sessionId))).toHaveLength(1);
    const final = await edge.read<Session>(sessionPath, 'operator');
    for (const write of writes) expect(write.key).toBe(write.body.requestId);
    expect(final.events.filter(({ type }) => type === 'sessionCreated')).toEqual([
      expect.objectContaining({ requestId: create.body.requestId }),
    ]);
    expect(final.events.filter(({ type }) => type === 'preparationCompleted')).toEqual([
      expect.objectContaining({ requestId: completions[0].body.requestId }),
    ]);
    expect(final.execution?.cursor).toEqual(cursor);

    await testInfo.attach('edge-session-evidence', {
      body: JSON.stringify(
        {
          viewport,
          sessionId: created.sessionId,
          attemptIds: [failedAttempt.attemptId, passedAttempt.attemptId],
          firstCursor: cursor,
          writes: writes.map(({ data, ...write }) => ({
            method: 'POST',
            ...write,
            sessionId: data?.sessionId,
            revision: data?.revision,
            phase: data?.phase,
          })),
          reads: reads.map((read) => ({ method: 'GET', ...read })),
        },
        null,
        2,
      ),
      contentType: 'application/json',
    });
  } finally {
    const created = writes.find(({ path, data }) => path === sessionsPath && data)?.data;
    try {
      if (created) {
        const current = await edge.read<Session>(
          `${sessionsPath}/${created.sessionId}`,
          'operator',
        );
        await edge.command(current.sessionId, current.revision, { type: 'cancel' });
      }
    } finally {
      if (changedSimulation) await edge.configure(originalConfig);
    }
  }
});

async function seedCompletedTrial(edge: ReturnType<typeof isolatedEdge>, created: Session) {
  let session = created;
  const path = `${sessionsPath}/${session.sessionId}`;
  async function send(command: Command) {
    session = await edge.command(session.sessionId, session.revision, command);
  }
  async function waitForJob() {
    await expect
      .poll(async () => {
        session = await edge.read<Session>(path, 'operator');
        return session.pendingJob;
      })
      .toBeNull();
  }

  for (const { id, owner } of session.procedure.preparation) {
    if (owner === 'operator')
      await send({ type: 'setPreparationCheck', checkId: id, checked: true });
  }
  await send({ type: 'completePreparation' });
  await send({ type: 'startDeviceCheck' });
  await waitForJob();
  expect(session.phase).toBe('readyToExecute');
  await send({ type: 'startExecution' });
  const cursorId = session.execution?.cursor.cursorId;
  if (!cursorId) throw new Error('Edge did not return an execution cursor.');
  await send({ type: 'requestExecutionSample', cursorId });
  await waitForJob();
  const attempt = session.execution?.attempts.at(-1);
  if (!attempt) throw new Error('Edge did not return a measurement attempt.');
  expect(attempt.status).toBe('ready');
  await send({ type: 'completeExecutionStep', cursorId, sampleAttemptId: attempt.attemptId });
  return session;
}

async function observedCommand(response: Response, command: 'pause' | 'resume') {
  const request = response.request();
  const url = new URL(request.url());
  const body = request.postDataJSON() as Omit<CommandBody, 'command'> & {
    command: { type: typeof command };
  };
  expect(body.command).toEqual({ type: command });
  expect(body.requestId).toEqual(expect.any(String));
  expect(await request.headerValue('idempotency-key')).toBe(body.requestId);
  expect(url.search).toBe('');
  return { method: request.method(), path: url.pathname, status: response.status(), ...body };
}

test('모바일에서 일시정지 후 점검을 통과하면 실제 Edge의 같은 회차로 복귀한다', async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(90_000);
  const edge = isolatedEdge(request);
  const health = await edge.read<{ executionMode: string }>('/api/v1/system/health');
  expect(health.executionMode).toBe('simulation');
  const { enabled, scenario, distanceCm, ledFailure } = await edge.read<
    SimulationConfig & { enabled: boolean }
  >(simulationPath, 'expert');
  expect(enabled).toBe(true);
  const originalConfig = { scenario, distanceCm, ledFailure };
  const existing = await edge.read<Session[]>(sessionsPath, 'operator');
  expect(existing.every(({ phase }) => ['cancelled', 'completed'].includes(phase))).toBe(true);
  const procedure = await currentKitProcedure(edge);
  const normalSimulation = { scenario: 'normal', distanceCm: 20, ledFailure: false };
  let created: Session | undefined;

  try {
    // The test drives S10/S11 through the app. Setup records one valid simulation trial on Edge.
    await edge.configure(normalSimulation);
    created = await edge.create(procedure);
    const sessionId = created.sessionId;
    const beforePause = await seedCompletedTrial(edge, created);
    const execution = beforePause.execution;
    if (!execution) throw new Error('Edge did not start the seeded session.');
    expect(beforePause).toMatchObject({ phase: 'running', dataOrigin: 'simulation' });
    const cursor = execution.cursor;
    const condition = procedure.execution.conditions.find(({ id }) => id === cursor.conditionId);
    if (!condition) throw new Error('Seeded cursor does not match an approved condition.');
    const accepted = beforePause.events.filter(({ type }) => type === 'measurementAccepted');
    expect(accepted).toHaveLength(1);
    expect(execution.attempts).toEqual([expect.objectContaining({ status: 'valid' })]);

    const apiPath = `${sessionsPath}/${sessionId}`;
    const screenPath = `/researcher-workflow/${sessionId}`;
    const homePath = '/api/v1/home/student?environmentId=kit-lab';
    const nextResponse = (method: 'GET' | 'POST', path: string) =>
      page.waitForResponse(
        (response) =>
          response.url() === `${edge.origin}${path}` && response.request().method() === method,
      );
    const requestCommand = (control: Locator) => {
      const response = nextResponse('POST', `${apiPath}/commands`);
      return Promise.all([response, control.click()]).then(([command]) => command);
    };
    const continueSession = button(page, '이어서 진행');
    const executionCondition = page.getByText(
      `조건 ${condition.label} · ${cursor.trialIndex}회차`,
      { exact: true },
    );
    const executionCursor = page.getByText(`회차 ID ${cursor.cursorId}`, { exact: true });

    await enterStudentHome(page, edge.operatorToken);
    await continueSession.click();
    await expect(page).toHaveURL(`${screenPath}/execution`);
    await expect(executionCondition).toBeVisible();
    await expect(executionCursor).toBeVisible();
    await button(page, '더 보기').click();
    await expect(page).toHaveURL(`${screenPath}/session-menu`);
    const pause = button(page, '실험 일시정지');
    await checkLayout(page, pause);
    const pauseResponse = await requestCommand(pause);
    const pauseWrite = await observedCommand(pauseResponse, 'pause');
    expect(pauseWrite).toMatchObject({ status: 200, expectedRevision: beforePause.revision });
    const paused = (await pauseResponse.json()) as Session;
    expect(paused).toMatchObject({
      sessionId,
      phase: 'held',
      holdReason: { code: 'USER_PAUSED' },
      execution: { cursor },
    });

    await expect(page).toHaveURL(`${screenPath}/paused`);
    await expect(page.getByText('완료한 측정 1회', { exact: true })).toBeVisible();
    const home = button(page, '홈으로');
    await checkLayout(page, home);
    const homeResponse = nextResponse('GET', homePath);
    await home.click();
    await expect(page).toHaveURL('/student');
    const revisitedHome = await homeResponse;
    expect(revisitedHome.status()).toBe(200);
    expect(await revisitedHome.json()).toMatchObject({
      ongoingSession: { id: sessionId, status: 'held', completedCycles: 1 },
    });
    await checkLayout(page, continueSession);
    const sameSessionResponse = nextResponse('GET', apiPath);
    await continueSession.click();
    const sameSession = await sameSessionResponse;
    expect(sameSession.status()).toBe(200);
    expect(await sameSession.json()).toMatchObject({
      sessionId,
      holdReason: { code: 'USER_PAUSED' },
    });
    await expect(page).toHaveURL(`${screenPath}/paused`);
    await expect(page.getByText('작업자가 일시정지했습니다.', { exact: true })).toBeVisible();
    await button(page, '바로 재개').click();
    await expect(page).toHaveURL(`${screenPath}/resume`);

    const confirmation = page.getByRole('checkbox', { name: /작업 환경을 재확인했어요/ });
    const resume = button(page, '장치 점검하고 재개');
    await expect(resume).toBeDisabled();
    await expect(confirmation).not.toBeChecked();
    await edge.configure({ ...normalSimulation, scenario: 'disconnected' });
    await checkLayout(page, confirmation);
    await confirmation.click();
    await expect(confirmation).toBeChecked();
    await checkLayout(page, resume);
    const failedResponse = await requestCommand(resume);
    const failedWrite = await observedCommand(failedResponse, 'resume');
    expect(failedWrite).toMatchObject({ status: 423, expectedRevision: paused.revision });
    const failure = (await failedResponse.json()) as { error: { code: string }; session: Session };
    expect(failure.error.code).toBe('SENSOR_DISCONNECTED');
    expect(failure.session).toMatchObject({
      sessionId,
      phase: 'held',
      holdReason: { code: 'USER_PAUSED' },
      execution: { cursor },
    });
    await expect(page).toHaveURL(`${screenPath}/resume`);
    await checkLayout(page, page.getByText('센서가 연결되지 않았습니다.', { exact: false }));
    await expect(confirmation).not.toBeChecked();
    await expect(resume).toBeDisabled();

    await edge.configure(normalSimulation);
    await confirmation.click();
    const resumeResponse = await requestCommand(resume);
    const resumeWrite = await observedCommand(resumeResponse, 'resume');
    expect(resumeWrite).toMatchObject({ status: 200, expectedRevision: failure.session.revision });
    expect(resumeWrite.requestId).not.toBe(failedWrite.requestId);
    const resumed = (await resumeResponse.json()) as Session;
    expect(resumed).toMatchObject({
      sessionId,
      phase: 'running',
      holdReason: null,
      execution: { cursor },
    });
    await expect(page).toHaveURL(`${screenPath}/execution`);
    await checkLayout(page, executionCondition);
    await expect(executionCursor).toBeVisible();

    const stored = await edge.read<Session>(apiPath, 'operator');
    expect(stored).toMatchObject({ phase: 'running', execution: { cursor } });
    expect(stored.execution?.attempts).toEqual(execution.attempts);
    expect(stored.events.filter(({ type }) => type === 'measurementAccepted')).toEqual(accepted);
    expect(stored.events.filter(({ type }) => type === 'sessionResumed')).toEqual([
      expect.objectContaining({ requestId: resumeWrite.requestId }),
    ]);
    const storedSessions = await edge.read<Session[]>(sessionsPath, 'operator');
    const existingIds = new Set(existing.map(({ sessionId }) => sessionId));
    expect(storedSessions.filter((session) => !existingIds.has(session.sessionId))).toHaveLength(1);
    await testInfo.attach('edge-pause-resume-evidence', {
      body: JSON.stringify({
        viewport,
        sessionId,
        dataOrigin: stored.dataOrigin,
        procedure: { id: procedure.procedureId, version: procedure.version },
        cursor,
        priorMeasurementAttemptId: execution.attempts[0].attemptId,
        writes: [pauseWrite, { ...failedWrite, errorCode: failure.error.code }, resumeWrite],
        homeLookup: { method: 'GET', path: homePath, status: revisitedHome.status() },
        sessionLookup: { method: 'GET', path: apiPath, status: sameSession.status() },
      }),
      contentType: 'application/json',
    });
  } finally {
    try {
      if (created) {
        const session = await edge.read<Session>(
          `${sessionsPath}/${created.sessionId}`,
          'operator',
        );
        await edge.command(session.sessionId, session.revision, { type: 'cancel' });
      }
    } finally {
      await edge.configure(originalConfig);
    }
  }
});
