import { describe, expect, jest, test } from '@jest/globals';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { MockWorkflowRepository } from '../src/features/researcher-workflow/infrastructure/mock/MockWorkflowRepository';
import { buildMockDiagnostics } from '../src/features/researcher-workflow/infrastructure/mock/device-check-scenarios';
import {
  buildMockExecutionReport,
  type MockExecutionRunner,
  type MockExecutionScenario,
} from '../src/features/researcher-workflow/infrastructure/mock/execution-scenarios';
import { mockProcedure } from '../src/features/researcher-workflow/infrastructure/mock/fixtures';
import {
  selectExecution,
  type ExecutionSampleReport,
} from '../src/features/researcher-workflow/domain/execution';
import { selectRecovery } from '../src/features/researcher-workflow/domain/recovery';
import type {
  ExperimentSession,
  WorkflowCommand,
} from '../src/features/researcher-workflow/domain/models';
import { finishExecutionSample } from '../src/features/researcher-workflow/infrastructure/mock/execution-transitions';
import { RecoveryScreen } from '../src/features/researcher-workflow/screens/RecoveryScreen';
import { WorkflowProvider } from '../src/features/researcher-workflow/state/WorkflowProvider';

const now = () => '2026-11-04T04:00:00.000Z';
async function send(
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
async function settled(repo: MockWorkflowRepository, session: ExperimentSession) {
  await waitFor(async () =>
    expect(selectExecution(await repo.getSession(session.sessionId)).sampling).toBe(false),
  );
  return repo.getSession(session.sessionId);
}
async function setup(
  sample: MockExecutionRunner = async (input) => buildMockExecutionReport(input),
  clock: () => string = now,
) {
  const repo = new MockWorkflowRepository({
    now: clock,
    sample,
    inspect: async (input) => buildMockDiagnostics(input),
  });
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
  // 이미 저장된 측정값이 있는 상태에서 오류를 발생시켜 보존을 검증한다.
  await send(repo, session, {
    type: 'requestExecutionSample',
    cursorId: session.execution!.cursor!.cursorId,
  });
  session = await settled(repo, session);
  session = await send(repo, session, {
    type: 'completeExecutionStep',
    cursorId: session.execution!.cursor!.cursorId,
    sampleAttemptId: selectExecution(session).latest!.attemptId,
  });
  repo.setExecutionScenario(session.sessionId, 'stale');
  await send(repo, session, {
    type: 'requestExecutionSample',
    cursorId: session.execution!.cursor!.cursorId,
  });
  session = await settled(repo, session);
  return { repo, session };
}
function recoveryCommand(session: ExperimentSession): WorkflowCommand {
  const state = selectRecovery(session);
  return {
    type: 'requestRecovery',
    cursorId: state.cursor!.cursorId,
    blockedAttemptId: state.blocked!.attemptId,
  };
}

describe('S08 보류와 복구 계약', () => {
  test('보류 중 일반 측정·완료·음성 우회를 거절하고 명시적 복구 후에도 회차와 기록을 유지한다', async () => {
    const { repo, session } = await setup();
    const state = selectRecovery(session);
    expect(state).toMatchObject({
      canRecover: true,
      canSample: false,
      canComplete: false,
      canClarify: false,
      completedCount: 1,
    });
    for (const command of [
      { type: 'requestExecutionSample', cursorId: state.cursor!.cursorId },
      {
        type: 'completeExecutionStep',
        cursorId: state.cursor!.cursorId,
        sampleAttemptId: state.latest!.attemptId,
      },
      {
        type: 'requestVoiceClarification',
        cursorId: state.cursor!.cursorId,
        utterance: '다시 해줘',
      },
      {
        type: 'requestRecovery',
        cursorId: 'old-cursor',
        blockedAttemptId: state.blocked!.attemptId,
      },
      {
        type: 'requestRecovery',
        cursorId: state.cursor!.cursorId,
        blockedAttemptId: 'old-attempt',
      },
    ] as const)
      await expect(
        send(repo, session, command, `invalid-${command.type}-${JSON.stringify(command)}`),
      ).rejects.toMatchObject({ code: 'INVALID_STATE' });
    repo.setExecutionScenario(session.sessionId, 'normal');
    await send(repo, session, recoveryCommand(session));
    const recovered = await settled(repo, session);
    expect(selectRecovery(recovered)).toMatchObject({
      recovered: true,
      canComplete: false,
      requiresRemeasurement: true,
      completedCount: 1,
    });
    expect(recovered.execution!.cursor).toEqual(session.execution!.cursor);
    expect(recovered.execution!.attempts.slice(0, 2)).toEqual(session.execution!.attempts);
    expect(recovered.procedure).toEqual(session.procedure);
    expect(recovered.evidence.slice(0, session.evidence.length)).toEqual(session.evidence);
    expect(recovered.events.slice(0, session.events.length)).toEqual(session.events);
    expect(recovered.evidence.at(-2)?.kind).toBe('human');
    expect(recovered.evidence.at(-1)).toMatchObject({
      kind: 'program',
      action: 'recoveryChecked',
      diagnostics: recovered.execution!.attempts.at(-1)!.report!.diagnostics,
    });
    await expect(
      send(
        repo,
        recovered,
        {
          type: 'completeExecutionStep',
          cursorId: state.cursor!.cursorId,
          sampleAttemptId: selectExecution(recovered).latest!.attemptId,
        },
        'probe-completion',
      ),
    ).rejects.toMatchObject({ code: 'INVALID_STATE' });
    await send(repo, recovered, {
      type: 'requestRecoveryRemeasurement',
      cursorId: state.cursor!.cursorId,
      recoveryId: recovered.execution!.recoveries!.at(-1)!.recoveryId,
    });
    const measured = await settled(repo, recovered);
    const accepted = await send(repo, measured, {
      type: 'completeExecutionStep',
      cursorId: state.cursor!.cursorId,
      sampleAttemptId: selectExecution(measured).latest!.attemptId,
    });
    expect(selectExecution(accepted).completedCount).toBe(2);
    expect(accepted.execution!.recoveries).toEqual(recovered.execution!.recoveries);
  });

  test.each<MockExecutionScenario>(['waiting', 'stale', 'noResponse', 'error', 'held'])(
    '%s 복구 실패는 보류를 유지하고 재시도 성공 뒤에만 잠금을 해제한다',
    async (scenario) => {
      const { repo, session } = await setup();
      repo.setExecutionScenario(session.sessionId, scenario);
      await send(repo, session, recoveryCommand(session));
      const failed = await settled(repo, session);
      expect(selectRecovery(failed)).toMatchObject({
        failed: true,
        recovered: false,
        canComplete: false,
        canSample: false,
        canRecover: true,
        completedCount: 1,
      });
      repo.setExecutionScenario(session.sessionId, 'normal');
      await send(repo, failed, recoveryCommand(failed));
      const recovered = await settled(repo, failed);
      expect(selectRecovery(recovered).recovered).toBe(true);
      expect(recovered.execution!.recoveries).toHaveLength(2);
      expect(recovered.execution!.recoveries![0]).toEqual(failed.execution!.recoveries![0]);
    },
  );

  test.each(['attempt', 'oldTime', 'futureTime', 'unit', 'source'])(
    '정상 표시가 있어도 %s가 잘못된 복구 응답은 거절한다',
    async (variant) => {
      const { repo, session } = await setup(async (input) => {
        const raw = JSON.parse(JSON.stringify(buildMockExecutionReport(input)));
        if (input.scenario === 'normal' && input.cursor.trialIndex === 2) {
          if (variant === 'attempt') raw.attemptId = 'past-request';
          if (variant === 'oldTime')
            raw.diagnostics.sensors[0].readings[0].observedAt = '2026-01-01T00:00:00Z';
          if (variant === 'futureTime') raw.diagnostics.checkedAt = '2030-01-01T00:00:00Z';
          if (variant === 'unit') raw.diagnostics.sensors[0].readings[0].unit = 'invalid';
          if (variant === 'source') raw.source = 'api';
        }
        return raw;
      });
      repo.setExecutionScenario(session.sessionId, 'normal');
      await send(repo, session, recoveryCommand(session));
      const failed = await settled(repo, session);
      expect(selectRecovery(failed)).toMatchObject({ failed: true, canComplete: false });
      expect(failed.execution!.attempts.at(-1)!.report).toBeDefined();
      expect(failed.evidence.at(-1)?.issue).toEqual(failed.execution!.attempts.at(-1)!.issue);
      const screen = await render(
        <WorkflowProvider repository={repo}>
          <RecoveryScreen
            sessionId={session.sessionId}
            onBack={jest.fn()}
            onRemeasurement={jest.fn()}
          />
        </WorkflowProvider>,
      );
      await screen.findByText('검증 실패');
      expect(screen.queryByText(/^연결 끊김/)).toBeNull();
      expect(screen.queryByText('연결 확인 불가')).toBeNull();
      expect(screen.queryByText(/^정상 ·/)).toBeNull();
      expect(
        screen.getAllByText(failed.execution!.attempts.at(-1)!.issue!.message).length,
      ).toBeGreaterThan(0);
      expect(await repo.getSession(session.sessionId)).toEqual(failed);
    },
  );

  test('중복 요청·오래된 revision을 차단하고 늦게 도착한 이전 응답을 무시한다', async () => {
    let resolve!: (report: ExecutionSampleReport) => void;
    let input!: Parameters<MockExecutionRunner>[0];
    const sample = jest.fn<MockExecutionRunner>(async (value) => {
      if (value.cursor.trialIndex === 2 && value.scenario === 'normal') {
        input = value;
        return new Promise((done) => {
          resolve = done;
        });
      }
      return buildMockExecutionReport(value);
    });
    const { repo, session } = await setup(sample);
    repo.setExecutionScenario(session.sessionId, 'normal');
    const command = recoveryCommand(session);
    const checking = await send(repo, session, command, 'retry');
    expect(await send(repo, session, command, 'retry')).toEqual(checking);
    await expect(send(repo, checking, command, 'duplicate')).rejects.toMatchObject({
      code: 'INVALID_STATE',
    });
    await expect(send(repo, session, command, 'old-revision')).rejects.toMatchObject({
      code: 'REVISION_CONFLICT',
    });
    await expect(
      send(
        repo,
        checking,
        { type: 'requestExecutionSample', cursorId: checking.execution!.cursor!.cursorId },
        'retry',
      ),
    ).rejects.toMatchObject({ code: 'REQUEST_CONFLICT' });
    expect(() => repo.setExecutionScenario(session.sessionId, 'error')).toThrow();
    resolve(buildMockExecutionReport(input));
    const recovered = await settled(repo, checking);
    expect(await send(repo, session, command, 'retry')).toEqual(recovered);
    const old = session.execution!.attempts.at(-1)!;
    const ignored = finishExecutionSample(recovered, old.attemptId, old.report!, {
      requestId: 'late',
      now: now(),
      eventId: 'late-event',
      evidenceId: 'late-evidence',
    });
    expect(ignored).toBe(recovered);
    expect(recovered.events.filter((event) => event.type === 'recoveryRequested')).toHaveLength(1);
    expect(recovered.events.filter((event) => event.type === 'recoverySucceeded')).toHaveLength(1);
    expect(sample).toHaveBeenCalledTimes(3);
  });

  test('S08 재진입·뒤로 가기는 보류를 해제하지 않으며 응답 중 이탈 후 복구 상태를 복원한다', async () => {
    let resolve!: (report: ExecutionSampleReport) => void;
    let input!: Parameters<MockExecutionRunner>[0];
    const { repo, session } = await setup(async (value) => {
      if (value.cursor.trialIndex === 2 && value.scenario === 'normal') {
        input = value;
        return new Promise((done) => {
          resolve = done;
        });
      }
      return buildMockExecutionReport(value);
    });
    const onBack = jest.fn();
    const onRemeasurement = jest.fn();
    const view = () => (
      <WorkflowProvider repository={repo}>
        <RecoveryScreen
          sessionId={session.sessionId}
          onBack={onBack}
          onRemeasurement={onRemeasurement}
        />
      </WorkflowProvider>
    );
    let screen = await render(view());
    await screen.findByText('복구 순서');
    await fireEvent.press(screen.getByRole('button', { name: '뒤로가기' }));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(await repo.getSession(session.sessionId)).toEqual(session);
    await fireEvent.press(screen.getByRole('button', { name: '조치 듣기' }));
    expect(screen.getByText(/음성 안내 서비스는 아직 연결되지 않았습니다/)).toBeTruthy();
    repo.setExecutionScenario(session.sessionId, 'normal');
    await fireEvent.press(screen.getByRole('button', { name: '센서 다시 확인' }));
    await screen.findByText('새 센서 응답을 확인하고 있습니다');
    expect(screen.getByText('재확인 중')).toBeTruthy();
    expect(screen.queryByText(/^연결 끊김/)).toBeNull();
    expect(screen.queryByText('연결 확인 불가')).toBeNull();
    expect(screen.getByRole('button', { name: '센서 다시 확인' })).toBeDisabled();
    await screen.unmount();
    screen = await render(view());
    await screen.findByText('새 센서 응답을 확인하고 있습니다');
    await act(async () => resolve(buildMockExecutionReport(input)));
    await screen.findByText('새 센서값이 수신되었습니다');
    expect(screen.getByText(/^정상 ·/)).toBeTruthy();
    expect(screen.queryByText('재확인 중')).toBeNull();
    expect(selectRecovery(await repo.getSession(session.sessionId)).completedCount).toBe(1);
    await fireEvent.press(screen.getByRole('button', { name: '복구 후 재측정 안내' }));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onRemeasurement).toHaveBeenCalledTimes(1);
  });

  test.each<{ scenario: MockExecutionScenario; label: string }>([
    { scenario: 'stale', label: '오래된 값' },
    { scenario: 'waiting', label: '안정화 대기' },
    { scenario: 'noResponse', label: '응답 없음' },
    { scenario: 'error', label: '통신 오류' },
    { scenario: 'held', label: '작업 보류' },
  ])(
    '$scenario 복구 실패를 연결 끊김으로 표시하지 않고 상태와 원인을 보존한다',
    async ({ scenario, label }) => {
      const { repo, session } = await setup();
      repo.setExecutionScenario(session.sessionId, scenario);
      await send(repo, session, recoveryCommand(session));
      const failed = await settled(repo, session);
      const screen = await render(
        <WorkflowProvider repository={repo}>
          <RecoveryScreen
            sessionId={session.sessionId}
            onBack={jest.fn()}
            onRemeasurement={jest.fn()}
          />
        </WorkflowProvider>,
      );
      await screen.findByText(label === '오래된 값' ? /^오래된 값 ·/ : label);
      expect(screen.queryByText(/^연결 끊김/)).toBeNull();
      expect(screen.queryByText('연결 확인 불가')).toBeNull();
      expect(screen.queryByText(/^정상 ·/)).toBeNull();
      expect(selectRecovery(await repo.getSession(session.sessionId)).canComplete).toBe(false);
      expect(await repo.getSession(session.sessionId)).toEqual(failed);
    },
  );

  test('연결 끊김 진단이 있는 응답만 연결 끊김으로 표시한다', async () => {
    const { repo, session } = await setup(async (input) => {
      const report = buildMockExecutionReport(input);
      return input.scenario === 'stale'
        ? {
            ...report,
            diagnostics: buildMockDiagnostics({
              definition: input.definition,
              attemptId: input.sampleAttemptId,
              now: input.now,
              scenario: 'disconnected',
            }),
          }
        : report;
    });
    const screen = await render(
      <WorkflowProvider repository={repo}>
        <RecoveryScreen
          sessionId={session.sessionId}
          onBack={jest.fn()}
          onRemeasurement={jest.fn()}
        />
      </WorkflowProvider>,
    );
    await screen.findByText(/^연결 끊김 ·/);
    expect(screen.getByText('연결 확인 불가')).toBeTruthy();
    expect(screen.queryByText('검증 실패')).toBeNull();
    expect(await repo.getSession(session.sessionId)).toEqual(session);
  });

  test('센서 진단이 없는 보류는 상태 미확인으로 표시하고 연결 끊김을 추정하지 않는다', async () => {
    const { repo, session } = await setup(async (input) => {
      const report = buildMockExecutionReport(input);
      return input.scenario === 'stale'
        ? {
            ...report,
            holdReason: '센서 상태 확인이 필요합니다.',
            diagnostics: { ...report.diagnostics, sensors: [] },
          }
        : report;
    });
    const screen = await render(
      <WorkflowProvider repository={repo}>
        <RecoveryScreen
          sessionId={session.sessionId}
          onBack={jest.fn()}
          onRemeasurement={jest.fn()}
        />
      </WorkflowProvider>,
    );
    await screen.findByText('상태 미확인');
    expect(screen.queryByText(/^연결 끊김/)).toBeNull();
    expect(screen.queryByText('연결 확인 불가')).toBeNull();
    expect(await repo.getSession(session.sessionId)).toEqual(session);
  });

  test('같은 회차에서 다시 오류가 나면 새로운 보류 응답을 대상으로 복구한다', async () => {
    const { repo, session } = await setup();
    expect(selectRecovery(session).title).toBe('조도 센서 값이\n오래되었습니다');
    repo.setExecutionScenario(session.sessionId, 'normal');
    await send(repo, session, recoveryCommand(session));
    let current = await settled(repo, session);
    repo.setExecutionScenario(session.sessionId, 'error');
    await send(repo, current, {
      type: 'requestRecoveryRemeasurement',
      cursorId: current.execution!.cursor!.cursorId,
      recoveryId: current.execution!.recoveries!.at(-1)!.recoveryId,
    });
    current = await settled(repo, current);
    expect(selectRecovery(current).blocked?.attemptId).toBe(
      current.execution!.attempts.at(-1)!.attemptId,
    );
    expect(selectRecovery(current).blocked?.attemptId).not.toBe(
      selectRecovery(session).blocked?.attemptId,
    );
    repo.setExecutionScenario(session.sessionId, 'normal');
    await send(repo, current, recoveryCommand(current));
    const recovered = await settled(repo, current);
    expect(selectRecovery(recovered).recovered).toBe(true);
    expect(recovered.execution!.recoveries).toHaveLength(2);
    expect(selectExecution(recovered).completedCount).toBe(1);
  });

  test('새 세션의 이전 샘플은 생성 직전에 고정되며 재요청·새 세션 생성으로 기존 이력을 바꾸지 않는다', async () => {
    let time = Date.parse(now());
    const clock = () => new Date(time).toISOString();
    const { repo, session } = await setup(undefined, clock);
    const oldAttempt = session.execution!.attempts.at(-1)!;
    const oldReading = oldAttempt.report!.diagnostics.sensors[0].readings[0];
    expect(oldReading.observedAt).toBe(new Date(Date.parse(session.createdAt) - 1).toISOString());
    expect(oldAttempt.report!.diagnostics.sensors[0].status).toBe('stale');
    expect(Date.parse(oldReading.observedAt)).toBeLessThan(Date.parse(oldAttempt.requestedAt));
    expect(selectRecovery(session).canComplete).toBe(false);

    time += 60_000;
    expect(
      await repo.createSession({
        requestId: 'create',
        operatorId: 'researcher',
        procedure: mockProcedure,
      }),
    ).toEqual(session);
    const fresh = await repo.createSession({
      requestId: 'fresh',
      operatorId: 'researcher',
      procedure: mockProcedure,
    });
    expect(fresh.createdAt).toBe(clock());
    expect(fresh.sessionId).not.toBe(session.sessionId);
    expect(fresh.execution).toBeUndefined();
    expect(fresh.evidence).toEqual([]);
    expect(await repo.getSession(session.sessionId)).toEqual(session);

    await send(repo, session, recoveryCommand(session));
    const failed = await settled(repo, session);
    expect(
      failed.execution!.attempts.at(-1)!.report!.diagnostics.sensors[0].readings[0].observedAt,
    ).toBe(oldReading.observedAt);
    expect(failed.execution!.attempts.slice(0, session.execution!.attempts.length)).toEqual(
      session.execution!.attempts,
    );
    expect(selectRecovery(failed)).toMatchObject({ failed: true, canComplete: false });

    repo.setExecutionScenario(session.sessionId, 'normal');
    await send(repo, failed, recoveryCommand(failed));
    const recovered = await settled(repo, failed);
    const current = recovered.execution!.attempts.at(-1)!;
    expect(
      Date.parse(current.report!.diagnostics.sensors[0].readings[0].observedAt),
    ).toBeGreaterThanOrEqual(Date.parse(current.requestedAt));
    expect(selectRecovery(recovered)).toMatchObject({ recovered: true, completedCount: 1 });
    expect(recovered.execution!.attempts.slice(0, failed.execution!.attempts.length)).toEqual(
      failed.execution!.attempts,
    );
    expect(recovered.evidence.slice(0, failed.evidence.length)).toEqual(failed.evidence);
  });

  test('주입된 시계를 따르며 서로 다른 신규 세션은 각각의 생성 시각을 기준으로 이전 샘플을 만든다', async () => {
    const first = await setup();
    const shifted = () => '2026-12-10T04:00:00.000Z';
    const second = await setup(undefined, shifted);
    for (const session of [first.session, second.session]) {
      const reading =
        session.execution!.attempts.at(-1)!.report!.diagnostics.sensors[0].readings[0];
      expect(Date.parse(session.createdAt) - Date.parse(reading.observedAt)).toBe(1);
      expect(session.execution!.attempts.at(-1)!.status).toBe('held');
      expect(selectRecovery(session).canComplete).toBe(false);
    }
    const initial = await first.repo.getSession(first.session.sessionId);
    expect(initial).toEqual(first.session);
  });

  test('직접 진입한 정상 세션과 없는 세션은 복구를 실행하지 않는다', async () => {
    const { repo, session } = await setup();
    repo.setExecutionScenario(session.sessionId, 'normal');
    await send(repo, session, recoveryCommand(session));
    const recovered = await settled(repo, session);
    await expect(send(repo, recovered, recoveryCommand(recovered))).rejects.toMatchObject({
      code: 'INVALID_STATE',
    });
    await expect(
      repo.executeCommand('missing', recoveryCommand(session), {
        requestId: 'missing',
        expectedRevision: 0,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
