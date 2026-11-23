import { randomUUID } from 'node:crypto';
import {
  expect,
  test,
  type APIResponse,
  type Locator,
  type Page,
  type Response,
} from '@playwright/test';
import type { MeasurementAttempt } from '../src/features/researcher-workflow/domain/execution';
import type {
  ExperimentSession,
  WorkflowCommand,
} from '../src/features/researcher-workflow/domain/models';
import type { StudentHomeData } from '../src/features/student-home/studentHomeData';

const enabled = process.env.HANDSON_E2E_EDGE_EXECUTION === '1';
const viewport = { width: 360, height: 800 };
const api = '/api/v1';
const homePath = api + '/home/student';
const environmentId = 'kit-lab';

test.use({
  viewport,
  isMobile: true,
  hasTouch: true,
  trace: 'off',
  screenshot: 'off',
  video: 'off',
});
test.skip(!enabled, 'Set HANDSON_E2E_EDGE_EXECUTION=1 for an isolated simulation Edge.');

async function read<T>(response: APIResponse | Response, status = 200): Promise<T> {
  const body = await response.json();
  expect(
    response.status(),
    [new URL(response.url()).pathname, body?.error?.code].filter(Boolean).join(' '),
  ).toBe(status);
  return body as T;
}

function button(page: Page, name: string) {
  return page.getByRole('button', { name, exact: true });
}

async function visibleOnMobile(page: Page, element: Locator) {
  await element.scrollIntoViewIfNeeded();
  await expect(element).toBeInViewport({ ratio: 1 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    viewport.width,
  );
}

test('연구생 홈에서 실제 Edge 측정·음성 확인·오류 복구·재측정·결과 조회를 이어간다', async ({
  request,
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const origin = new URL(process.env.EXPO_PUBLIC_HANDSON_EDGE_BASE_URL ?? '');
  const operator = process.env.HANDSON_E2E_OPERATOR_TOKEN;
  const expert = process.env.HANDSON_E2E_EXPERT_TOKEN;
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname) || !operator || !expert) {
    throw new Error('Use a dedicated loopback Edge and local operator/expert tokens.');
  }
  const headers = { Authorization: 'Bearer ' + operator };
  const expertHeaders = { Authorization: 'Bearer ' + expert };
  const health = await read<{ executionMode: string }>(
    await request.get(origin.origin + api + '/system/health'),
  );
  expect(health.executionMode).toBe('simulation');
  const simulationPath = origin.origin + api + '/simulation';
  type Simulation = { scenario: string; distanceCm: number; ledFailure: boolean };
  const original = await read<Simulation>(
    await request.get(simulationPath, { headers: expertHeaders }),
  );

  async function configure(config: Simulation) {
    await read(
      await request.post(simulationPath, {
        headers: expertHeaders,
        data: { requestId: randomUUID(), config },
      }),
    );
  }

  const nextResponse = (method: string, path: string) =>
    page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        url.origin === origin.origin &&
        url.pathname === path &&
        response.request().method() === method
      );
    });

  try {
    await configure({ scenario: 'normal', distanceCm: 20, ledFailure: false });
    let seeded = await read<ExperimentSession>(
      await request.post(origin.origin + api + '/sessions', {
        headers,
        data: { requestId: randomUUID() },
      }),
      201,
    );
    const sessionPath = api + '/sessions/' + seeded.sessionId;
    const commandPath = sessionPath + '/commands';
    const interpretationPath = sessionPath + '/voice/interpret';
    const sessionUrl = origin.origin + sessionPath;
    const getSession = async () =>
      read<ExperimentSession>(await request.get(sessionUrl, { headers }));

    async function seed(command: WorkflowCommand) {
      seeded = await read<ExperimentSession>(
        await request.post(origin.origin + commandPath, {
          headers,
          data: { requestId: randomUUID(), expectedRevision: seeded.revision, command },
        }),
      );
    }
    for (const check of seeded.procedure.preparation.filter(({ owner }) => owner === 'operator')) {
      await seed({ type: 'setPreparationCheck', checkId: check.id, checked: true });
    }
    await seed({ type: 'completePreparation' });
    await seed({ type: 'startDeviceCheck' });
    await expect
      .poll(
        async () => {
          seeded = await getSession();
          return seeded.phase;
        },
        { timeout: 35_000 },
      )
      .toBe('readyToExecute');
    await seed({ type: 'startExecution' });

    async function uiCommand(label: string, command: WorkflowCommand) {
      const before = await getSession();
      const responsePromise = nextResponse('POST', commandPath);
      const action = button(page, label);
      await visibleOnMobile(page, action);
      await action.click();
      const response = await responsePromise;
      const payload = response.request().postDataJSON();
      expect(payload).toMatchObject({ expectedRevision: before.revision, command });
      expect(await response.request().headerValue('idempotency-key')).toBe(payload.requestId);
      return read<ExperimentSession>(response);
    }

    async function fromHome(phase: 'running' | 'held') {
      const session = nextResponse('GET', sessionPath);
      await button(page, '이어서 진행').click();
      expect(await read<ExperimentSession>(await session)).toMatchObject({
        sessionId: seeded.sessionId,
        phase,
      });
    }

    async function checkReading(attempt: MeasurementAttempt) {
      const reading = attempt.report?.diagnostics.sensors
        .flatMap(({ readings }) => readings)
        .find(({ metricId }) => metricId === 'distance');
      if (!reading || reading.value === null) throw new Error('Edge did not return a distance.');
      const label =
        seeded.procedure.deviceCheck?.sensors
          .flatMap(({ metrics }) => metrics)
          .find(({ id }) => id === reading.metricId)?.label ?? reading.metricId;
      await visibleOnMobile(
        page,
        page.getByLabel([label, reading.value, reading.unit].join(', '), { exact: true }),
      );
    }

    async function settledSample(cursorId: string) {
      let attempt: MeasurementAttempt | undefined;
      await expect
        .poll(
          async () => {
            attempt = (await getSession()).execution?.attempts.at(-1);
            return attempt?.status;
          },
          { timeout: 35_000 },
        )
        .toBe('ready');
      if (!attempt) throw new Error('No ready measurement returned by Edge.');
      expect(attempt.cursor.cursorId).toBe(cursorId);
      await checkReading(attempt);
      return attempt;
    }

    await page.goto('/');
    await page.getByRole('radio', { name: '신규 연구생, 승인된 절차 실행' }).click();
    try {
      await page.getByLabel('Edge 접속 토큰', { exact: true }).fill(operator);
    } catch {
      throw new Error('Edge 접속 토큰을 입력하지 못했습니다.');
    }
    const environments = nextResponse('GET', api + '/environments');
    await button(page, '작업 환경 불러오기').click();
    const catalog = await read<{ id: string; name: string }[]>(await environments);
    const environment = catalog.find(({ id }) => id === environmentId);
    if (!environment) throw new Error('Edge does not offer the simulation lab.');
    await page.getByRole('button', { name: /^연구실: / }).click();
    await page.getByRole('radio', { name: environment.name, exact: true }).click();
    const home = nextResponse('GET', homePath);
    await button(page, '설정하고 계속').click();
    const studentHome = await home;
    expect(new URL(studentHome.url()).search).toBe('?environmentId=' + environmentId);
    expect((await read<StudentHomeData>(studentHome)).ongoingSession?.id).toBe(seeded.sessionId);
    await fromHome('running');

    const activeCursor = seeded.execution?.cursor;
    if (!activeCursor) throw new Error('Edge did not create an execution cursor.');
    const firstCursor = activeCursor.cursorId;
    await expect(page.getByText('회차 ID ' + firstCursor)).toBeVisible();
    await uiCommand('현재 회차 측정값 확인', {
      type: 'requestExecutionSample',
      cursorId: firstCursor,
    });
    const first = await settledSample(firstCursor);
    const utterance = '다시 해줘';

    async function clarify() {
      const before = await getSession();
      await page.getByLabel('명령 텍스트', { exact: true }).fill(utterance);
      const interpretation = nextResponse('POST', interpretationPath);
      await button(page, '명령 해석 요청').click();
      const response = await interpretation;
      expect(response.request().postDataJSON()).toEqual({ text: utterance });
      expect(await read(response)).toMatchObject({
        text: utterance,
        expectedRevision: before.revision,
        cursorId: firstCursor,
        intent: 'clarification',
        command: null,
        dataOrigin: 'simulation',
        executed: false,
      });
      expect(await getSession()).toMatchObject({
        revision: before.revision,
        execution: { pendingVoice: null },
      });
      const pending = await uiCommand('명령 뜻 선택하기', {
        type: 'requestVoiceClarification',
        cursorId: firstCursor,
        utterance,
      });
      const voiceRequest = pending.execution?.pendingVoice;
      if (!voiceRequest) throw new Error('Edge did not create a voice clarification request.');
      expect(voiceRequest).toMatchObject({
        cursor: { cursorId: firstCursor },
        utterance,
        sampleAttemptId: first.attemptId,
      });
      await expect(page.getByText('모호한 음성 확인', { exact: true })).toBeVisible();
      await expect(page.getByText(/“다시 해줘”/)).toBeVisible();
      await expect(button(page, '현재 작업으로 돌아가기')).toBeDisabled();
      return voiceRequest.commandId;
    }

    const dismissedCommandId = await clarify();
    const dismissed = await uiCommand('뒤로가기', {
      type: 'dismissVoiceClarification',
      commandId: dismissedCommandId,
    });
    expect(dismissed.execution?.pendingVoice).toBeNull();
    expect(dismissed.execution?.cursor?.cursorId).toBe(firstCursor);
    expect(dismissed.execution?.attempts.at(-1)?.attemptId).toBe(first.attemptId);
    await expect(page.getByText('음성 확인 결과 · 선택하지 않고 취소')).toBeVisible();

    const confirmedCommandId = await clarify();
    const beforeSelection = await getSession();
    await page.getByRole('button', { name: /조건 1회차 다시 측정/ }).click();
    expect((await getSession()).revision).toBe(beforeSelection.revision);
    const confirmed = await uiCommand('현재 작업으로 돌아가기', {
      type: 'resolveVoiceClarification',
      commandId: confirmedCommandId,
      choice: 'remeasure',
    });
    expect(confirmed.execution?.pendingVoice).toBeNull();
    expect(confirmed.execution?.cursor?.cursorId).toBe(firstCursor);
    const voiceSample = await settledSample(firstCursor);
    expect(voiceSample.attemptId).not.toBe(first.attemptId);
    expect(confirmed.execution?.voiceResolutions?.at(-1)?.replacementAttemptId).toBe(
      voiceSample.attemptId,
    );
    await expect(page.getByText('음성 확인 결과 · 같은 조건·회차 다시 측정')).toBeVisible();

    const completionText = '완료했어';
    const latestVoiceState = await getSession();
    await page.getByLabel('명령 텍스트', { exact: true }).fill(completionText);
    const completionProposal = nextResponse('POST', interpretationPath);
    await button(page, '명령 해석 요청').click();
    const proposal = await completionProposal;
    expect(proposal.request().postDataJSON()).toEqual({ text: completionText });
    const completeFirst = {
      type: 'completeExecutionStep',
      cursorId: firstCursor,
      sampleAttemptId: voiceSample.attemptId,
    } as const;
    expect(await read(proposal)).toMatchObject({
      expectedRevision: latestVoiceState.revision,
      executed: false,
      command: completeFirst,
    });
    expect((await getSession()).revision).toBe(latestVoiceState.revision);
    let session = await uiCommand('이 명령으로 완료 요청', completeFirst);

    const blockedCursor = session.execution?.cursor?.cursorId;
    if (!blockedCursor) throw new Error('Edge did not advance to the next trial.');
    expect(blockedCursor).not.toBe(firstCursor);
    await expect(page.getByText('회차 ID ' + blockedCursor)).toBeVisible();
    await uiCommand('현재 회차 측정값 확인', {
      type: 'requestExecutionSample',
      cursorId: blockedCursor,
    });
    const blocked = await settledSample(blockedCursor);
    await configure({ scenario: 'timeout', distanceCm: 20, ledFailure: false });
    expect(await getSession()).toMatchObject({
      phase: 'held',
      holdReason: { code: 'SENSOR_TIMEOUT' },
    });
    await page.goBack();
    await expect(page).toHaveURL('/student');
    await fromHome('held');
    await visibleOnMobile(page, page.getByText('측정 오류', { exact: true }));
    await expect(page.getByText('차단된 측정 시도 ID ' + blocked.attemptId)).toBeVisible();

    await configure({ scenario: 'normal', distanceCm: 22, ledFailure: false });
    const recovering = await uiCommand('센서 다시 확인', {
      type: 'requestRecovery',
      cursorId: blockedCursor,
      blockedAttemptId: blocked.attemptId,
    });
    const recovery = recovering.execution?.recoveries?.at(-1);
    if (!recovery) throw new Error('Edge did not create a recovery.');
    await button(page, '같은 회차 재측정으로 이동').click({ timeout: 35_000 });
    await expect(page.getByText('복구 ID ' + recovery.recoveryId)).toBeVisible();
    await expect(page.getByText('회차 ID ' + blockedCursor)).toBeVisible();
    await uiCommand('같은 회차 다시 측정', {
      type: 'requestRecoveryRemeasurement',
      cursorId: blockedCursor,
      recoveryId: recovery.recoveryId,
    });
    const remeasured = await settledSample(blockedCursor);
    expect(remeasured.attemptId).not.toBe(blocked.attemptId);
    await expect(page.getByText('재측정 시도 ID ' + remeasured.attemptId)).toBeVisible();
    await button(page, '완료 확인 화면으로 이동').click();
    session = await uiCommand('완료 요청', {
      type: 'completeExecutionStep',
      cursorId: blockedCursor,
      sampleAttemptId: remeasured.attemptId,
    });

    while (session.execution?.cursor) {
      const { cursorId } = session.execution.cursor;
      await uiCommand('현재 회차 측정값 확인', { type: 'requestExecutionSample', cursorId });
      const attempt = await settledSample(cursorId);
      session = await uiCommand('완료 요청', {
        type: 'completeExecutionStep',
        cursorId,
        sampleAttemptId: attempt.attemptId,
      });
    }
    expect(session).toMatchObject({ phase: 'completed', execution: { cursor: null } });
    await visibleOnMobile(page, page.getByText('반복 측정 완료', { exact: true }));
    const completedHome = nextResponse('GET', homePath);
    await button(page, '연구생 홈으로').click();
    const result = (await read<StudentHomeData>(await completedHome)).recentResults.find(
      ({ sessionId }) => sessionId === seeded.sessionId,
    );
    if (!result) throw new Error('Edge home did not return the completed result.');
    const resultResponse = nextResponse('GET', api + '/results/' + result.id);
    await button(page, result.title + ', 결과 보기')
      .filter({ hasText: result.completedAtLabel })
      .click();
    expect(await read(await resultResponse)).toMatchObject({
      id: result.id,
      session: { sessionId: seeded.sessionId, phase: 'completed' },
    });
    const completedTrials = session.execution?.attempts.filter(
      ({ status }) => status === 'valid',
    ).length;
    const totalTrials = session.procedure.execution?.conditions.reduce(
      (total, condition) => total + condition.repetitions,
      0,
    );
    await expect(page.getByText('실험 결과', { exact: true })).toBeVisible();
    await expect(
      page.getByText(`유효 측정 ${completedTrials} / ${totalTrials}`, { exact: true }),
    ).toBeVisible();

    await testInfo.attach('edge-execution', {
      contentType: 'application/json',
      body: JSON.stringify({
        sessionId: seeded.sessionId,
        dataOrigin: session.dataOrigin,
        firstCursor,
        voice: {
          dismissedCommandId,
          confirmedCommandId,
          previousAttemptId: first.attemptId,
          voiceAttemptId: voiceSample.attemptId,
        },
        blockedCursor,
        blockedAttemptId: blocked.attemptId,
        recoveryId: recovery.recoveryId,
        remeasuredAttemptId: remeasured.attemptId,
        resultId: result.id,
      }),
    });
  } finally {
    const { scenario, distanceCm, ledFailure } = original;
    await configure({ scenario, distanceCm, ledFailure });
  }
});
