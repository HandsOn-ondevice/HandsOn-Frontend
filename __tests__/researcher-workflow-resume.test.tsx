import { describe, expect, jest, test } from '@jest/globals';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import type {
  ExperimentSession,
  WorkflowCommand,
} from '../src/features/researcher-workflow/domain/models';
import { selectExecution } from '../src/features/researcher-workflow/domain/execution';
import { selectRecovery } from '../src/features/researcher-workflow/domain/recovery';
import { mockResumeProgress } from '../src/features/researcher-workflow/screens/mock-resume-progress';
import {
  selectResume,
  type ResumeCheckTarget,
} from '../src/features/researcher-workflow/domain/resume';
import { MockWorkflowRepository } from '../src/features/researcher-workflow/infrastructure/mock/MockWorkflowRepository';
import { mockProcedure } from '../src/features/researcher-workflow/infrastructure/mock/fixtures';
import {
  buildMockDiagnostics,
  type MockDiagnosticsRunner,
} from '../src/features/researcher-workflow/infrastructure/mock/device-check-scenarios';
import {
  buildMockExecutionReport,
  type MockExecutionRunner,
} from '../src/features/researcher-workflow/infrastructure/mock/execution-scenarios';
import { finishResumeCheck } from '../src/features/researcher-workflow/infrastructure/mock/resume-transitions';
import { WorkflowProvider } from '../src/features/researcher-workflow/state/WorkflowProvider';
import { ResumeScreen } from '../src/features/researcher-workflow/screens/ResumeScreen';

const now = () => '2026-11-13T04:00:00.000Z';
function send(
  repo: MockWorkflowRepository,
  session: ExperimentSession,
  command: WorkflowCommand,
  requestId = `r-${session.revision}`,
) {
  return repo.executeCommand(session.sessionId, command, {
    requestId,
    expectedRevision: session.revision,
  });
}
async function setup(
  sample: MockExecutionRunner = async (input) => buildMockExecutionReport(input),
) {
  let inspect: MockDiagnosticsRunner = async (input) => buildMockDiagnostics(input);
  const repo = new MockWorkflowRepository({ now, inspect: (input) => inspect(input), sample });
  let session = await repo.createSession({
    requestId: 'create',
    operatorId: 'researcher',
    procedure: mockProcedure,
  });
  for (const check of mockProcedure.preparation.filter((item) => item.owner === 'operator'))
    session = await send(repo, session, {
      type: 'setPreparationCheck',
      checkId: check.id,
      checked: true,
    });
  session = await send(repo, session, { type: 'completePreparation' });
  await send(repo, session, { type: 'startDeviceCheck' });
  await waitFor(async () =>
    expect((await repo.getSession(session.sessionId)).phase).toBe('readyToExecute'),
  );
  session = await send(repo, await repo.getSession(session.sessionId), { type: 'startExecution' });
  return {
    repo,
    session,
    setInspect: (next: MockDiagnosticsRunner) => {
      inspect = next;
    },
  };
}
async function sampleReady(repo: MockWorkflowRepository, session: ExperimentSession) {
  await send(repo, session, {
    type: 'requestExecutionSample',
    cursorId: session.execution!.cursor!.cursorId,
  });
  await waitFor(async () =>
    expect(selectExecution(await repo.getSession(session.sessionId)).sampling).toBe(false),
  );
  return repo.getSession(session.sessionId);
}
function pause(repo: MockWorkflowRepository, session: ExperimentSession) {
  return send(repo, session, {
    type: 'pauseExecution',
    cursorId: session.execution!.cursor!.cursorId,
  });
}
function checkCommand(session: ExperimentSession, target: ResumeCheckTarget = 'connection') {
  const state = selectResume(session);
  return {
    type: 'checkResume',
    target,
    pauseEventId: state.pause!.eventId,
    cursorId: state.cursor!.cursorId,
  } as const;
}
async function checked(
  repo: MockWorkflowRepository,
  session: ExperimentSession,
  targets: readonly ResumeCheckTarget[] = ['connection', 'voltage'],
) {
  for (const target of targets) {
    await send(repo, session, checkCommand(session, target));
    await waitFor(async () =>
      expect(selectResume(await repo.getSession(session.sessionId)).checking).toBe(false),
    );
    session = await repo.getSession(session.sessionId);
  }
  return session;
}
function confirm(repo: MockWorkflowRepository, session: ExperimentSession, confirmed = true) {
  const state = selectResume(session);
  return send(repo, session, {
    type: 'confirmResumeSetup',
    pauseEventId: state.pause!.eventId,
    attemptId: state.attempt!.attemptId,
    confirmed,
  });
}
function resumeCommand(session: ExperimentSession) {
  const { pauseEventId, cursorId } = checkCommand(session);
  return { type: 'resumeExecution', pauseEventId, cursorId } as const;
}
async function resumed(repo: MockWorkflowRepository, session: ExperimentSession) {
  const confirmed = await confirm(repo, await checked(repo, session));
  return send(repo, confirmed, resumeCommand(confirmed));
}

describe('S11 새 응답·작업자 확인과 기록 보존', () => {
  test('재확인과 작업자 확인 전 재개를 차단하고 같은 커서·승인 절차·완료 기록으로 복귀한다', async () => {
    const { repo, session: initial } = await setup();
    let session = await sampleReady(repo, initial);
    session = await send(repo, session, {
      type: 'completeExecutionStep',
      cursorId: session.execution!.cursor!.cursorId,
      sampleAttemptId: selectExecution(session).latest!.attemptId,
    });
    session = await pause(repo, session);
    await expect(send(repo, session, resumeCommand(session))).rejects.toMatchObject({
      code: 'INVALID_STATE',
    });
    const passed = await checked(repo, session);
    expect(selectResume(passed)).toMatchObject({ passed: true, canResume: false });
    await expect(send(repo, passed, resumeCommand(passed))).rejects.toMatchObject({
      code: 'INVALID_STATE',
    });
    const confirmed = await confirm(repo, passed);
    const command = resumeCommand(confirmed);
    const running = await send(repo, confirmed, command, 'resume');
    expect(running.phase).toBe('running');
    for (const key of ['sessionId', 'procedure', 'checks', 'deviceChecks'] as const)
      expect(running[key]).toEqual(session[key]);
    expect(running.execution).toEqual(session.execution);
    expect(running.events.slice(0, session.events.length)).toEqual(session.events);
    expect(running.evidence.slice(0, session.evidence.length)).toEqual(session.evidence);
    expect(selectExecution(running)).toMatchObject({
      completedCount: 1,
      canComplete: false,
      canSample: true,
    });
    expect(await send(repo, confirmed, command, 'resume')).toEqual(running);
    expect(running.events.filter((event) => event.type === 'executionResumed')).toHaveLength(1);
    await expect(send(repo, running, command, 'resume-again')).rejects.toMatchObject({
      code: 'INVALID_STATE',
    });
  });

  test('작업자 확인 취소와 새 재확인 요청은 재개를 다시 차단하고 취소 이력도 남긴다', async () => {
    const { repo, session } = await setup();
    let current = await confirm(repo, await checked(repo, await pause(repo, session)));
    current = await confirm(repo, current, false);
    expect(selectResume(current).canResume).toBe(false);
    expect(current.events.at(-1)?.type).toBe('resumeSetupRevoked');
    await expect(send(repo, current, resumeCommand(current))).rejects.toMatchObject({
      code: 'INVALID_STATE',
    });
    current = await confirm(repo, current);
    const previous = current.resumeChecks!;
    current = await checked(repo, current);
    expect(current.resumeChecks!.slice(0, -2)).toEqual(previous);
    expect(selectResume(current)).toMatchObject({ passed: true, canResume: false });
    await expect(
      send(repo, current, {
        type: 'confirmResumeSetup',
        pauseEventId: selectResume(current).pause!.eventId,
        attemptId: previous.at(-1)!.attemptId,
        confirmed: true,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_STATE' });
  });

  test.each(['disconnected', 'sensorError', 'timeout', 'stale'] as const)(
    '%s 응답은 재개를 막고 정상 재시도 뒤에도 작업자 확인이 필요하다',
    async (scenario) => {
      const { repo, session } = await setup();
      const paused = await pause(repo, session);
      repo.setDeviceCheckScenario(session.sessionId, scenario);
      const failed = await checked(repo, paused);
      expect(selectResume(failed)).toMatchObject({ passed: false, canResume: false });
      expect(failed.resumeChecks!.at(-1)!.status).toBe('failed');
      await expect(confirm(repo, failed)).rejects.toMatchObject({ code: 'INVALID_STATE' });
      await expect(send(repo, failed, resumeCommand(failed))).rejects.toMatchObject({
        code: 'INVALID_STATE',
      });
      repo.setDeviceCheckScenario(session.sessionId, 'normal');
      expect(selectResume(await checked(repo, failed))).toMatchObject({
        passed: true,
        canResume: false,
      });
    },
  );

  test.each(['source', 'unit', 'old', 'future', 'missing'] as const)(
    '재확인 %s 형식 오류는 정상 응답으로 인정하지 않는다',
    async (fault) => {
      const { repo, session, setInspect } = await setup();
      const paused = await pause(repo, session);
      setInspect(async (input) => {
        const report = buildMockDiagnostics(input);
        return {
          ...report,
          source: fault === 'source' ? 'api' : report.source,
          checkedAt:
            fault === 'old'
              ? '2026-01-01T00:00:00.000Z'
              : fault === 'future'
                ? '2027-01-01T00:00:00.000Z'
                : report.checkedAt,
          sensors: report.sensors.map((sensor) => ({
            ...sensor,
            readings: sensor.readings
              .filter((reading) => fault !== 'missing' || reading.metricId !== 'voltage')
              .map((reading) => ({
                ...reading,
                unit: fault === 'unit' && reading.metricId === 'voltage' ? 'mV' : reading.unit,
              })),
          })),
        };
      });
      const failed = await checked(repo, paused);
      expect(selectResume(failed)).toMatchObject({ passed: false, canResume: false });
      expect(failed.resumeChecks!.at(-1)!.issue).toBeDefined();
    },
  );

  test('진단 예외를 실패로 기록하며 대기 중 중복 재확인과 작업자 확인을 거절한다', async () => {
    const { repo, session, setInspect } = await setup();
    const gate = Promise.withResolvers<never>();
    setInspect(() => gate.promise);
    const paused = await pause(repo, session);
    const checking = await send(repo, paused, checkCommand(paused), 'check');
    expect(await send(repo, paused, checkCommand(paused), 'check')).toEqual(checking);
    await expect(send(repo, checking, checkCommand(checking), 'duplicate')).rejects.toMatchObject({
      code: 'INVALID_STATE',
    });
    await expect(confirm(repo, checking)).rejects.toMatchObject({ code: 'INVALID_STATE' });
    expect(() => repo.setDeviceCheckScenario(session.sessionId, 'normal')).toThrow();
    await act(async () => {
      gate.reject(new Error('진단 실패'));
    });
    await waitFor(async () =>
      expect(selectResume(await repo.getSession(session.sessionId)).attempt?.issue?.code).toBe(
        'RESUME_CHECK_ERROR',
      ),
    );
  });

  test('재개 후 이전 측정 응답을 무시하고 새 측정과 명시적 완료로만 다음 회차로 간다', async () => {
    const gate = Promise.withResolvers<ReturnType<typeof buildMockExecutionReport>>();
    let input!: Parameters<MockExecutionRunner>[0];
    const { repo, session } = await setup(async (value) => {
      input = value;
      return gate.promise;
    });
    const sampling = await send(repo, session, {
      type: 'requestExecutionSample',
      cursorId: session.execution!.cursor!.cursorId,
    });
    await waitFor(() => expect(input).toBeDefined());
    const running = await resumed(repo, await pause(repo, sampling));
    expect(selectExecution(running)).toMatchObject({ canSample: true, canComplete: false });
    await act(async () => {
      gate.resolve(buildMockExecutionReport(input));
      await gate.promise;
    });
    expect(await repo.getSession(session.sessionId)).toEqual(running);
  });

  test('일시정지 전 준비된 측정도 재개 후 완료 근거로 재사용하지 않는다', async () => {
    const { repo, session } = await setup();
    const ready = await sampleReady(repo, session);
    const running = await resumed(repo, await pause(repo, ready));
    expect(selectExecution(running).canComplete).toBe(false);
    await expect(
      send(repo, running, {
        type: 'completeExecutionStep',
        cursorId: running.execution!.cursor!.cursorId,
        sampleAttemptId: selectExecution(ready).latest!.attemptId,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_STATE' });
    const fresh = await sampleReady(repo, running);
    expect(selectExecution(fresh).latest!.attemptId).not.toBe(
      selectExecution(ready).latest!.attemptId,
    );
    const accepted = await send(repo, fresh, {
      type: 'completeExecutionStep',
      cursorId: fresh.execution!.cursor!.cursorId,
      sampleAttemptId: selectExecution(fresh).latest!.attemptId,
    });
    expect(selectExecution(accepted).completedCount).toBe(1);
  });

  test('이전 일시정지·커서·revision의 명령과 늦은 진단 응답이 새 상태를 바꾸지 않는다', async () => {
    const { repo, session } = await setup();
    const first = await checked(repo, await pause(repo, session));
    const running = await send(
      repo,
      await confirm(repo, first),
      resumeCommand(first),
      'first-resume',
    );
    const second = await pause(repo, running);
    await expect(send(repo, second, checkCommand(first), 'old-pause')).rejects.toMatchObject({
      code: 'INVALID_STATE',
    });
    await expect(
      send(repo, second, { ...checkCommand(second), cursorId: 'wrong' }, 'wrong'),
    ).rejects.toMatchObject({ code: 'INVALID_STATE' });
    await expect(send(repo, first, checkCommand(first), 'revision')).rejects.toMatchObject({
      code: 'REVISION_CONFLICT',
    });
    const old = first.resumeChecks!.at(-1)!;
    expect(
      finishResumeCheck(second, old.attemptId, old.report!, {
        now: now(),
        requestId: 'late',
        eventId: 'late',
        evidenceId: 'late',
      }),
    ).toBe(second);
    expect(await repo.getSession(session.sessionId)).toEqual(second);
  });

  test('S07 미확정 음성 요청과 S08 오류 보류를 재개로 자동 해제하지 않는다', async () => {
    const { repo, session } = await setup();
    const voice = await send(repo, session, {
      type: 'requestVoiceClarification',
      cursorId: session.execution!.cursor!.cursorId,
      utterance: '다시 해줘',
    });
    let running = await resumed(repo, await pause(repo, voice));
    expect(running.execution!.pendingVoice).toEqual(voice.execution!.pendingVoice);
    expect(selectExecution(running).canSample).toBe(false);
    running = await send(repo, running, {
      type: 'dismissVoiceClarification',
      commandId: running.execution!.pendingVoice!.commandId,
    });
    repo.setExecutionScenario(session.sessionId, 'stale');
    const held = await sampleReady(repo, running);
    running = await resumed(repo, await pause(repo, held));
    expect(running.execution).toEqual(held.execution);
    expect(selectRecovery(running)).toMatchObject({
      canRecover: true,
      canComplete: false,
      canSample: false,
    });
  });

  test('대기 중인 S08 복구 응답은 재개 뒤에도 무시하고 다시 복구할 수 있다', async () => {
    const gate = Promise.withResolvers<ReturnType<typeof buildMockExecutionReport>>();
    let recoveryInput!: Parameters<MockExecutionRunner>[0];
    const { repo, session } = await setup(async (input) => {
      if (input.scenario === 'normal' && !recoveryInput) {
        recoveryInput = input;
        return gate.promise;
      }
      return buildMockExecutionReport(input);
    });
    repo.setExecutionScenario(session.sessionId, 'stale');
    const held = await sampleReady(repo, session);
    repo.setExecutionScenario(session.sessionId, 'normal');
    const checking = await send(repo, held, {
      type: 'requestRecovery',
      cursorId: held.execution!.cursor!.cursorId,
      blockedAttemptId: selectExecution(held).latest!.attemptId,
    });
    await waitFor(() => expect(recoveryInput).toBeDefined());
    const running = await resumed(repo, await pause(repo, checking));
    expect(selectRecovery(running)).toMatchObject({
      checking: false,
      canRecover: true,
      canComplete: false,
    });
    expect(running.execution!.recoveries!.at(-1)!.issue?.code).toBe('PAUSE_INTERRUPTED');
    await act(async () => {
      gate.resolve(buildMockExecutionReport(recoveryInput));
      await gate.promise;
    });
    expect(await repo.getSession(session.sessionId)).toEqual(running);
    await send(repo, running, {
      type: 'requestRecovery',
      cursorId: running.execution!.cursor!.cursorId,
      blockedAttemptId: selectRecovery(running).blocked!.attemptId,
    });
    await waitFor(async () =>
      expect(selectRecovery(await repo.getSession(session.sessionId)).checking).toBe(false),
    );
    expect(selectRecovery(await repo.getSession(session.sessionId)).canRemeasure).toBe(true);
  });

  test('S08 복구 성공 뒤 일시정지해도 S09 필수 재측정 연결을 보존한다', async () => {
    const { repo, session } = await setup();
    repo.setExecutionScenario(session.sessionId, 'stale');
    let current = await sampleReady(repo, session);
    repo.setExecutionScenario(session.sessionId, 'normal');
    await send(repo, current, {
      type: 'requestRecovery',
      cursorId: current.execution!.cursor!.cursorId,
      blockedAttemptId: selectExecution(current).latest!.attemptId,
    });
    await waitFor(async () =>
      expect(selectRecovery(await repo.getSession(session.sessionId)).recovered).toBe(true),
    );
    current = await resumed(repo, await pause(repo, await repo.getSession(session.sessionId)));
    expect(selectExecution(current)).toMatchObject({
      canRemeasure: true,
      canSample: false,
      canComplete: false,
    });
    await send(repo, current, {
      type: 'requestRecoveryRemeasurement',
      cursorId: current.execution!.cursor!.cursorId,
      recoveryId: current.execution!.recoveries!.at(-1)!.recoveryId,
    });
    await waitFor(async () =>
      expect(selectExecution(await repo.getSession(session.sessionId)).canComplete).toBe(true),
    );
    const measured = await repo.getSession(session.sessionId);
    current = await resumed(repo, await pause(repo, measured));
    expect(selectExecution(current)).toMatchObject({
      canRecover: true,
      canSample: false,
      canComplete: false,
    });
    expect(current.execution!.recoveries).toEqual(measured.execution!.recoveries);
  });
});

describe('S11 화면과 명시적 재개', () => {
  test('화면 진입은 조회만 하고 새 응답과 작업자 확인·취소 후 저장 성공 때만 이동한다', async () => {
    const { repo, session } = await setup();
    const paused = await pause(repo, session);
    const onExecution = jest.fn();
    const screen = await render(
      <WorkflowProvider repository={repo}>
        <ResumeScreen sessionId={session.sessionId} onBack={() => {}} onExecution={onExecution} />
      </WorkflowProvider>,
    );
    await screen.findByText('확인을 기다리고 있어요');
    expect(await repo.getSession(session.sessionId)).toEqual(paused);
    expect(screen.getByRole('button', { name: '확인 후 재개 가능' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: '장치·센서 다시 확인' })).toBeNull();
    await fireEvent.press(screen.getByText('Orange Pi 5+와 필수 센서 3개 연결'));
    await waitFor(async () =>
      expect(selectResume(await repo.getSession(session.sessionId)).connection.passed).toBe(true),
    );
    expect(selectResume(await repo.getSession(session.sessionId)).voltageCheck.passed).toBe(false);
    await fireEvent.press(screen.getByText('공급 전압 확인 필요'));
    await screen.findByText('공급 전압 5.01 V');
    expect(screen.getByRole('button', { name: '확인 후 재개 가능' })).toBeDisabled();
    await fireEvent.press(screen.getByText('거리 20cm와 지그 고정 확인'));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '확인 완료 후 재개' })).toBeEnabled(),
    );
    await fireEvent.press(screen.getByText('거리 20cm와 지그 고정 확인'));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '확인 후 재개 가능' })).toBeDisabled(),
    );
    await fireEvent.press(screen.getByText('거리 20cm와 지그 고정 확인'));
    await fireEvent.press(await screen.findByRole('button', { name: '확인 완료 후 재개' }));
    await waitFor(() => expect(onExecution).toHaveBeenCalledTimes(1));
    expect((await repo.getSession(session.sessionId)).phase).toBe('running');
  });

  test('없는 세션·실행 중인 세션에 재개 성공을 표시하거나 명령을 만들지 않는다', async () => {
    const { repo, session } = await setup();
    const commands = jest.spyOn(repo, 'executeCommand');
    const screen = await render(
      <WorkflowProvider repository={repo}>
        <ResumeScreen sessionId={session.sessionId} onBack={() => {}} onExecution={() => {}} />
      </WorkflowProvider>,
    );
    await screen.findByText('재개 전 확인할 실험이 없습니다');
    expect(screen.getByRole('button', { name: '확인 후 재개 가능' })).toBeDisabled();
    await screen.rerender(
      <WorkflowProvider repository={repo}>
        <ResumeScreen key="missing" sessionId="missing" onBack={() => {}} onExecution={() => {}} />
      </WorkflowProvider>,
    );
    await screen.findByText('재개 전 확인을 처리하지 못했습니다');
    expect(commands).not.toHaveBeenCalled();
    expect(await repo.getSession(session.sessionId)).toEqual(session);
  });
});

describe('S11 카드별 독립 검증과 Mock 단계 표시', () => {
  test.each(['connection', 'voltage'] as const)(
    '%s 카드 재검증은 다른 카드의 결과를 보존하고 작업자 확인을 해제한다',
    async (target) => {
      const { repo, session } = await setup();
      let current = await confirm(repo, await checked(repo, await pause(repo, session)));
      const other = target === 'connection' ? 'voltageCheck' : 'connection';
      const previous = selectResume(current)[other].attempt;
      repo.setDeviceCheckScenario(session.sessionId, 'timeout');
      current = await checked(repo, current, [target]);
      const state = selectResume(current);
      expect(state[other]).toMatchObject({ passed: true, attempt: previous });
      expect(state).toMatchObject({ passed: false, canResume: false });
      expect(state.attempt).toMatchObject({ target, status: 'failed', operatorConfirmed: false });
      await expect(confirm(repo, current)).rejects.toMatchObject({ code: 'INVALID_STATE' });
      repo.setDeviceCheckScenario(session.sessionId, 'normal');
      current = await checked(repo, current, [target]);
      expect(selectResume(current)).toMatchObject({ passed: true, canResume: false });
      expect(selectResume(current)[other].attempt).toEqual(previous);
      expect(selectResume(await confirm(repo, current)).canResume).toBe(true);
    },
  );

  test.each(['connection', 'voltage'] as const)(
    '%s 응답이 먼저 도착해도 두 카드가 독립적으로 진행된다',
    async (firstTarget) => {
      const { repo, session, setInspect } = await setup();
      const gates = {
        connection: Promise.withResolvers<ReturnType<typeof buildMockDiagnostics>>(),
        voltage: Promise.withResolvers<ReturnType<typeof buildMockDiagnostics>>(),
      };
      const inputs: Partial<Record<ResumeCheckTarget, Parameters<MockDiagnosticsRunner>[0]>> = {};
      setInspect((input) => {
        const target = input.definition.sensors.length === 1 ? 'voltage' : 'connection';
        inputs[target] = input;
        return gates[target].promise;
      });
      let current = await pause(repo, session);
      current = await send(repo, current, checkCommand(current, 'connection'));
      current = await send(repo, current, checkCommand(current, 'voltage'));
      await waitFor(() => expect(Object.keys(inputs)).toHaveLength(2));
      expect(selectResume(current)).toMatchObject({
        connection: { checking: true },
        voltageCheck: { checking: true },
        canResume: false,
      });
      await act(async () => {
        gates[firstTarget].resolve(buildMockDiagnostics(inputs[firstTarget]!));
      });
      const firstKey = firstTarget === 'connection' ? 'connection' : 'voltageCheck';
      const secondTarget = firstTarget === 'connection' ? 'voltage' : 'connection';
      const secondKey = secondTarget === 'connection' ? 'connection' : 'voltageCheck';
      await waitFor(async () =>
        expect(selectResume(await repo.getSession(session.sessionId))[firstKey].passed).toBe(true),
      );
      current = await repo.getSession(session.sessionId);
      expect(selectResume(current)[secondKey].checking).toBe(true);
      await expect(confirm(repo, current)).rejects.toMatchObject({ code: 'INVALID_STATE' });
      await act(async () => {
        gates[secondTarget].resolve(buildMockDiagnostics(inputs[secondTarget]!));
      });
      await waitFor(async () =>
        expect(selectResume(await repo.getSession(session.sessionId)).passed).toBe(true),
      );
      current = await repo.getSession(session.sessionId);
      const confirmed = await confirm(repo, current);
      const retried = await send(repo, confirmed, checkCommand(confirmed, firstTarget));
      expect(selectResume(retried)).toMatchObject({
        canResume: false,
        [firstKey]: { checking: true },
        [secondKey]: { passed: true },
      });
      const old = current.resumeChecks!.find((attempt) => attempt.target === firstTarget)!;
      expect(
        finishResumeCheck(retried, old.attemptId, old.report!, {
          now: now(),
          requestId: 'late',
          eventId: 'late',
          evidenceId: 'late',
        }),
      ).toBe(retried);
    },
  );

  test.each(['connection', 'voltage'] as const)(
    '%s 카드의 과거·미래·타임아웃·실패 응답을 성공으로 표시하지 않는다',
    async (target) => {
      const { repo, session, setInspect } = await setup();
      let current = await pause(repo, session);
      for (const fault of [
        'old',
        'future',
        'timeout',
        'sensorError',
        'stale',
        'disconnected',
      ] as const) {
        setInspect(async (input) => {
          const report = buildMockDiagnostics({
            ...input,
            scenario: fault === 'old' || fault === 'future' ? 'normal' : fault,
          });
          return {
            ...report,
            checkedAt:
              fault === 'old'
                ? '2026-01-01T00:00:00.000Z'
                : fault === 'future'
                  ? '2027-01-01T00:00:00.000Z'
                  : report.checkedAt,
          };
        });
        current = await checked(repo, current, [target]);
        expect(selectResume(current).attempt).toMatchObject({ target, status: 'failed' });
        expect(selectResume(current).canResume).toBe(false);
      }
    },
  );

  test('새 일시정지에서는 두 카드와 작업자 확인을 재사용하지 않고 복원 위치는 유지한다', async () => {
    const { repo, session } = await setup();
    const first = await pause(repo, session);
    const position = mockResumeProgress(first);
    expect(position).toEqual({ step: 9, total: 16, percentage: 56 });
    const running = await resumed(repo, first);
    const second = await pause(repo, running);
    expect(mockResumeProgress(second)).toEqual(position);
    expect(selectResume(second)).toMatchObject({
      connection: { passed: false, attempt: undefined },
      voltageCheck: { passed: false, attempt: undefined },
      canResume: false,
    });
    expect(second.resumeChecks).toEqual(running.resumeChecks);
  });

  test('v0.1의 조건별 9~13단계를 각 1~3회차에 표시하고 API 세션에는 적용하지 않는다', async () => {
    const { session } = await setup();
    const original = JSON.stringify(session);
    for (const [index, condition] of session.procedure.execution!.conditions.entries()) {
      for (const trialIndex of [1, 2, 3]) {
        const mapped = {
          ...session,
          execution: {
            ...session.execution!,
            cursor: { ...session.execution!.cursor!, conditionId: condition.id, trialIndex },
          },
        };
        expect(mockResumeProgress(mapped)).toEqual({
          step: 9 + index,
          total: 16,
          percentage: Math.round(((9 + index) / 16) * 100),
        });
      }
    }
    expect(mockResumeProgress({ ...session, source: 'api' })).toBeUndefined();
    expect(mockResumeProgress({ ...session, execution: undefined })).toBeUndefined();
    expect(JSON.stringify(session)).toBe(original);
  });
});
