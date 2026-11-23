import { expect, test as base, type Locator, type Page, type Response } from '@playwright/test';
import {
  button,
  currentKitProcedure,
  enterProcedure,
  enterStudentHome,
  isolatedEdge,
  seedCompletedTrial,
  seedRunningSession,
  sessionsPath,
  simulationPath,
  submitSample,
  viewport,
  waitForJob,
  type CreateBody,
  type Session,
  type SimulationConfig,
  type TestEdge,
} from './helpers/edge-session';

const normal = { scenario: 'normal', distanceCm: 20, ledFailure: false };

type LiveEdge = {
  edge: TestEdge;
  track: (session: Session) => Session;
};

const test = base.extend<{ live: LiveEdge }>({
  live: async ({ request }, runTest) => {
    const edge = isolatedEdge(request);
    const health = await edge.read<{ executionMode: string }>('/api/v1/system/health');
    expect(health.executionMode).toBe('simulation');
    const { enabled, scenario, distanceCm, ledFailure } = await edge.read<
      SimulationConfig & { enabled: boolean }
    >(simulationPath, 'expert');
    expect(enabled).toBe(true);
    const previousSessions = await edge.read<Session[]>(sessionsPath, 'operator');
    expect(previousSessions.every(({ phase }) => ['completed', 'cancelled'].includes(phase))).toBe(
      true,
    );
    const ids = new Set<string>();
    try {
      await edge.configure(normal);
      await runTest({
        edge,
        track: (session) => {
          ids.add(session.sessionId);
          return session;
        },
      });
    } finally {
      try {
        for (const id of ids) {
          const session = await edge.read<Session>(`${sessionsPath}/${id}`, 'operator');
          if (!['completed', 'cancelled'].includes(session.phase)) {
            await edge.command(id, session.revision, { type: 'cancel' });
          }
        }
      } finally {
        await edge.configure({ scenario, distanceCm, ledFailure });
      }
    }
  },
});

test.use({
  viewport,
  isMobile: true,
  hasTouch: true,
  trace: 'off',
  screenshot: 'off',
  video: 'off',
});
test.skip(
  process.env.HANDSON_E2E_EDGE_SESSION !== '1',
  'Set HANDSON_E2E_EDGE_SESSION=1 to run against a dedicated loopback Edge with one worker.',
);

type ConfirmationCommand = {
  type: 'resume' | 'requestRecovery';
  cursorId?: string;
  blockedAttemptId?: string;
  confirmation: {
    holdId: string;
    cursorId: string;
    conditionsConfirmed: boolean;
    installationConfirmed: boolean;
    confirmedAt: string;
  };
};

type CommandRequest = {
  requestId: string;
  expectedRevision: number;
  command: { type: string };
};

function sessionPath(session: Session) {
  return `${sessionsPath}/${session.sessionId}`;
}

function screenPath(session: Session, screen: string) {
  return `/researcher-workflow/${session.sessionId}/${screen}`;
}

function cursorOf(session: Session) {
  const cursor = session.execution?.cursor;
  if (!cursor) throw new Error('Edge did not return an execution cursor.');
  return cursor;
}

function reply(
  page: Page,
  edge: TestEdge,
  method: 'GET' | 'POST',
  path: string,
  commandType?: string,
) {
  return page.waitForResponse(
    (response) =>
      response.url() === `${edge.origin}${path}` &&
      response.request().method() === method &&
      (!commandType || response.request().postDataJSON()?.command?.type === commandType),
  );
}

async function clickCommand(
  page: Page,
  edge: TestEdge,
  session: Session,
  commandType: string,
  control: Locator,
) {
  const response = reply(page, edge, 'POST', `${sessionPath(session)}/commands`, commandType);
  await control.click();
  return response;
}

function confirmationControls(page: Page) {
  return [
    page.getByRole('checkbox', { name: '실험 조건을 확인했어요' }),
    page.getByRole('checkbox', { name: '장치 설치 상태를 확인했어요' }),
  ];
}

async function confirm(page: Page, send: Locator) {
  await expect(send).toBeDisabled();
  const [conditions, installation] = confirmationControls(page);
  await expect(conditions).not.toBeChecked();
  await expect(installation).not.toBeChecked();
  await conditions.click();
  await expect(send).toBeDisabled();
  await installation.click();
  await expect(send).toBeEnabled();
}

async function observedConfirmation(response: Response, held: Session, type: string) {
  const request = response.request();
  const payload = request.postDataJSON() as CommandRequest & { command: ConfirmationCommand };
  expect(await request.headerValue('idempotency-key')).toBe(payload.requestId);
  expect(payload).toMatchObject({
    expectedRevision: held.revision,
    command: {
      type,
      confirmation: {
        holdId: held.hold?.holdId,
        cursorId: cursorOf(held).cursorId,
        conditionsConfirmed: true,
        installationConfirmed: true,
        confirmedAt: expect.any(String),
      },
    },
  });
  expect(Number.isFinite(Date.parse(payload.command.confirmation.confirmedAt))).toBe(true);
  return payload;
}

async function sampleAndComplete(
  page: Page,
  edge: TestEdge,
  session: Session,
  recoveryId?: string,
) {
  const cursorId = cursorOf(session).cursorId;
  const execution = page.getByTestId('execution-screen');
  const remeasurement = page.getByTestId('edge-remeasurement-screen');
  const measurement = recoveryId ? remeasurement : execution;
  const complete = execution.getByRole('button', { name: '완료 요청', exact: true });
  const next = remeasurement.getByRole('button', { name: '완료 확인 화면으로 이동', exact: true });
  if (recoveryId) {
    await button(page, '같은 회차 재측정으로 이동').click();
    await expect(page).toHaveURL(screenPath(session, 'remeasurement'));
    await expect(remeasurement.getByText(`복구 ID ${recoveryId}`, { exact: true })).toBeVisible();
    await expect(next).toBeDisabled();
  } else {
    await expect(page).toHaveURL(screenPath(session, 'execution'));
    await expect(complete).toBeDisabled();
  }
  await expect(measurement.getByText(`회차 ID ${cursorId}`, { exact: true })).toBeVisible();
  const sampleType = recoveryId ? 'requestRecoveryRemeasurement' : 'requestExecutionSample';
  const sampleLabel = recoveryId ? '같은 회차 다시 측정' : '현재 회차 측정값 확인';
  const sampled = await clickCommand(page, edge, session, sampleType, button(page, sampleLabel));
  expect(sampled.status()).toBe(200);
  expect(sampled.request().postDataJSON().command).toEqual({
    type: sampleType,
    cursorId,
    ...(recoveryId && { recoveryId }),
  });
  await expect(recoveryId ? next : complete).toBeEnabled();
  await expect(measurement.getByLabel('거리, 20, cm', { exact: true })).toBeVisible();
  const read = await edge.read<Session>(sessionPath(session), 'operator');
  expect(cursorOf(read)).toEqual(cursorOf(session));
  const attempt = read.execution?.attempts.at(-1);
  expect(attempt).toMatchObject({ status: 'ready', attemptId: expect.any(String) });
  expect(session.execution?.attempts).not.toContainEqual(
    expect.objectContaining({ attemptId: attempt?.attemptId }),
  );
  if (recoveryId) {
    await expect(
      page.getByText(`재측정 시도 ID ${attempt?.attemptId}`, { exact: true }),
    ).toBeVisible();
    await next.click();
    await expect(page).toHaveURL(screenPath(session, 'execution'));
  }
  const completed = await clickCommand(page, edge, session, 'completeExecutionStep', complete);
  expect(completed.status()).toBe(200);
  expect(completed.request().postDataJSON().command).toEqual({
    type: 'completeExecutionStep',
    cursorId,
    sampleAttemptId: attempt?.attemptId,
  });
  const state = (await completed.json()) as Session;
  const previouslyValid =
    session.execution?.attempts.filter(({ status }) => status === 'valid') ?? [];
  expect(state.execution?.attempts).toEqual(
    expect.arrayContaining([
      ...previouslyValid,
      expect.objectContaining({ attemptId: attempt?.attemptId, status: 'valid' }),
    ]),
  );
  expect(cursorOf(state).cursorId).not.toBe(cursorId);
}

test('새 세션을 2.0으로 만든 뒤 연구생 홈을 거쳐 재개하고 같은 회차를 새로 측정한다', async ({
  page,
  live: { edge, track },
}, testInfo) => {
  test.setTimeout(90_000);
  const procedure = await currentKitProcedure(edge);
  await enterProcedure(page, edge.operatorToken, procedure.title);
  const creation = reply(page, edge, 'POST', sessionsPath);
  await button(page, '이 버전으로 준비 시작').click();
  const createdResponse = await creation;
  expect(createdResponse.status()).toBe(201);
  const createBody = createdResponse.request().postDataJSON() as CreateBody;
  const created = track((await createdResponse.json()) as Session);
  expect(createBody.resumePolicyVersion).toBe('2.0');
  expect(created.resumePolicyVersion).toBe('2.0');
  await expect(page).toHaveURL(screenPath(created, 'preparation'));
  const running = await seedCompletedTrial(edge, created);
  const valid = running.execution?.attempts.find(({ status }) => status === 'valid');
  expect(valid).toBeDefined();
  await enterStudentHome(page, edge.operatorToken);
  await button(page, '이어서 진행').click();
  await expect(page).toHaveURL(screenPath(created, 'execution'));
  await button(page, '더 보기').click();
  const pause = await clickCommand(page, edge, created, 'pause', button(page, '실험 일시정지'));
  expect(pause.status()).toBe(200);
  const held = (await pause.json()) as Session;
  expect(held.hold).toMatchObject({
    allowedCommands: ['resume', 'cancel'],
    nextSampleCommand: 'requestExecutionSample',
    requiresConfirmation: true,
    confirmationValidityMs: 30_000,
  });
  expect(cursorOf(held)).toEqual(cursorOf(running));
  await expect(page).toHaveURL(screenPath(held, 'paused'));
  await expect(page.getByText('완료한 측정 1회', { exact: true })).toBeVisible();
  const home = reply(page, edge, 'GET', '/api/v1/home/student?environmentId=kit-lab');
  await button(page, '홈으로').click();
  expect(await (await home).json()).toMatchObject({
    ongoingSession: { id: held.sessionId, completedCycles: 1 },
  });
  const reloaded = reply(page, edge, 'GET', sessionPath(held));
  await button(page, '이어서 진행').click();
  expect(await (await reloaded).json()).toMatchObject({
    sessionId: held.sessionId,
    hold: held.hold,
  });
  await expect(page).toHaveURL(screenPath(held, 'paused'));
  await button(page, '바로 재개').click();
  const send = button(page, '장치 점검하고 재개');

  // The browser clock is behind the Edge clock so the real server rejects confirmation as expired.
  await page.clock.setFixedTime(new Date(Date.now() - 31_000));
  await confirm(page, send);
  const expired = await clickCommand(page, edge, held, 'resume', send);
  expect(expired.status()).toBe(423);
  expect(await expired.json()).toMatchObject({ error: { code: 'RESUME_CONFIRMATION_EXPIRED' } });
  await expect(
    page.getByText('확인 유효시간이 지났어요. 두 항목을 다시 확인해 주세요.'),
  ).toBeVisible();

  const afterExpiry = await edge.read<Session>(sessionPath(held), 'operator');
  expect(afterExpiry.resumeChecks).toEqual([]);
  await page.clock.setFixedTime(new Date());
  await edge.configure({ ...normal, scenario: 'disconnected' });
  await confirm(page, send);
  const failedResponse = await clickCommand(page, edge, held, 'resume', send);
  const failedRequest = await observedConfirmation(failedResponse, afterExpiry, 'resume');
  expect(failedResponse.status()).toBe(423);
  expect(await failedResponse.json()).toMatchObject({ error: { code: 'SENSOR_DISCONNECTED' } });
  await expect(page.getByText('센서가 연결되지 않았습니다.')).toBeVisible();
  const stillHeld = await edge.read<Session>(sessionPath(held), 'operator');
  expect(stillHeld).toMatchObject({ phase: 'held', execution: { cursor: cursorOf(held) } });
  expect(stillHeld.resumeChecks?.map(({ status }) => status)).toEqual(['failed']);

  await edge.configure(normal);
  const writes: { body: string | null; key: string | null; status: number; replay?: string }[] = [];
  let firstSuccess: Session | undefined;
  await page.route(`${edge.origin}${sessionPath(held)}/commands`, async (route) => {
    const request = route.request();
    if (request.method() !== 'POST' || request.postDataJSON()?.command?.type !== 'resume') {
      await route.continue();
      return;
    }
    const response = await route.fetch({ maxRedirects: 0 });
    writes.push({
      body: request.postData(),
      key: await request.headerValue('idempotency-key'),
      status: response.status(),
      replay: response.headers()['x-idempotent-replay'],
    });
    if (writes.length === 1 && response.ok()) {
      firstSuccess = (await response.json()) as Session;
      await route.abort('failed');
    } else {
      await route.fulfill({ response });
    }
  });
  await confirm(page, send);
  const replay = await clickCommand(page, edge, held, 'resume', send);
  const replayedRequest = await observedConfirmation(replay, stillHeld, 'resume');
  expect(replayedRequest.requestId).not.toBe(failedRequest.requestId);
  expect(writes.map(({ status, replay }) => [status, replay])).toEqual([
    [200, 'false'],
    [200, 'true'],
  ]);
  expect(writes[1].body).toBe(writes[0].body);
  expect(writes.map(({ key }) => key)).toEqual([
    replayedRequest.requestId,
    replayedRequest.requestId,
  ]);
  const resumed = (await replay.json()) as Session;
  expect(resumed).toEqual(firstSuccess);
  expect(cursorOf(resumed)).toEqual(cursorOf(held));
  expect(resumed.execution?.attempts).toContainEqual(valid);
  expect(resumed.resumeChecks?.map(({ status }) => status)).toEqual(['failed', 'passed']);
  expect(resumed.events.filter(({ type }) => type === 'sessionResumed')).toEqual([
    expect.objectContaining({ requestId: replayedRequest.requestId }),
  ]);
  await sampleAndComplete(page, edge, resumed);
  await testInfo.attach('api09-resume-evidence', {
    contentType: 'application/json',
    body: JSON.stringify({
      create: createBody,
      rejected: failedRequest,
      replayed: replayedRequest,
      writes,
    }),
  });
});

test('실패 시도가 있는 보류에서 비동기 센서 복구 후 새 측정을 완료한다', async ({
  page,
  live: { edge, track },
}, testInfo) => {
  const procedure = await currentKitProcedure(edge);
  const created = track(await edge.create(procedure, '2.0'));
  const running = await seedRunningSession(edge, created);
  await submitSample(edge, running);
  const sampled = await waitForJob(edge, running.sessionId);
  const blockedAttemptId = sampled.execution?.attempts.at(-1)?.attemptId;
  expect(blockedAttemptId).toBeDefined();
  await edge.configure({ ...normal, scenario: 'disconnected' });
  const held = await edge.read<Session>(sessionPath(created), 'operator');
  expect(held.phase).toBe('held');
  expect(held.hold).toMatchObject({
    allowedCommands: ['requestRecovery', 'cancel'],
    nextSampleCommand: 'requestRecoveryRemeasurement',
  });

  await enterStudentHome(page, edge.operatorToken);
  await button(page, '이어서 진행').click();
  await expect(page).toHaveURL(screenPath(held, 'recovery'));
  const recover = button(page, '센서 다시 확인');
  await expect(button(page, '장치 점검하고 재개')).toHaveCount(0);
  await edge.configure(normal);
  await confirm(page, recover);
  const response = await clickCommand(page, edge, held, 'requestRecovery', recover);
  expect(response.status()).toBe(200);
  const write = await observedConfirmation(response, held, 'requestRecovery');
  expect(write.command).toMatchObject({ cursorId: cursorOf(held).cursorId, blockedAttemptId });
  const pending = (await response.json()) as Session;
  expect(pending).toMatchObject({
    phase: 'held',
    pendingJob: { kind: 'sample' },
    execution: { recoveries: [expect.objectContaining({ status: 'checking' })] },
  });
  await expect(page.getByText('센서 재확인 결과를 기다리고 있습니다.')).toBeVisible();
  await expect(button(page, '같은 회차 재측정으로 이동')).toBeEnabled();
  const recovered = await edge.read<Session>(sessionPath(held), 'operator');
  const recovery = recovered.execution?.recoveries?.at(-1);
  expect(recovery).toMatchObject({
    status: 'recovered',
    confirmationEvidenceId: expect.any(String),
  });
  expect(cursorOf(recovered)).toEqual(cursorOf(held));
  await sampleAndComplete(page, edge, recovered, recovery?.recoveryId);
  await testInfo.attach('api09-recovery-evidence', {
    contentType: 'application/json',
    body: JSON.stringify({ write, pendingJob: pending.pendingJob, recovery }),
  });
});

test('실패 시도가 없는 자동 보류는 S08에서 재개한 후 같은 회차를 측정한다', async ({
  page,
  live: { edge, track },
}) => {
  const procedure = await currentKitProcedure(edge);
  const created = track(await edge.create(procedure, '2.0'));
  const running = await seedRunningSession(edge, created);
  await edge.configure({ ...normal, scenario: 'disconnected' });
  const held = await edge.read<Session>(sessionPath(created), 'operator');
  expect(held).toMatchObject({ phase: 'held', execution: { attempts: [] } });
  expect(held.hold?.allowedCommands).toEqual(['resume', 'cancel']);
  await enterStudentHome(page, edge.operatorToken);
  await button(page, '이어서 진행').click();
  await expect(page).toHaveURL(screenPath(held, 'recovery'));
  await expect(button(page, '센서 다시 확인')).toHaveCount(0);
  await edge.configure(normal);
  const resume = button(page, '장치 점검하고 재개');
  await confirm(page, resume);
  const response = await clickCommand(page, edge, held, 'resume', resume);
  expect(response.status()).toBe(200);
  await observedConfirmation(response, held, 'resume');
  const resumed = (await response.json()) as Session;
  expect(cursorOf(resumed)).toEqual(cursorOf(running));
  await sampleAndComplete(page, edge, resumed);
});
