import { describe, expect, jest, test } from '@jest/globals';
import { waitFor } from '@testing-library/react-native';
import type { DeviceDiagnosticsReport } from '../src/features/researcher-workflow/domain/device-check';
import { selectDeviceCheck } from '../src/features/researcher-workflow/domain/device-check';
import { selectPreparation } from '../src/features/researcher-workflow/domain/preparation';
import type {
  ExperimentSession,
  WorkflowCommand,
} from '../src/features/researcher-workflow/domain/models';
import { MockWorkflowRepository } from '../src/features/researcher-workflow/infrastructure/mock/MockWorkflowRepository';
import { mockProcedure } from '../src/features/researcher-workflow/infrastructure/mock/fixtures';
import {
  buildMockDiagnostics,
  type MockDeviceScenario,
  type MockDiagnosticsRunner,
} from '../src/features/researcher-workflow/infrastructure/mock/device-check-scenarios';

const now = () => '2026-11-02T01:00:00.000Z';
function repoWith(inspect: MockDiagnosticsRunner = async (input) => buildMockDiagnostics(input)) {
  return new MockWorkflowRepository({ now, inspect });
}
async function prepared(repo: MockWorkflowRepository, submit = true) {
  let session = await repo.createSession({
    requestId: 'create',
    operatorId: 'researcher',
    procedure: mockProcedure,
  });
  for (const requirement of mockProcedure.preparation.filter((item) => item.owner === 'operator')) {
    session = await send(repo, session, {
      type: 'setPreparationCheck',
      checkId: requirement.id,
      checked: true,
    });
  }
  return submit ? send(repo, session, { type: 'completePreparation' }) : session;
}
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
async function terminal(repo: MockWorkflowRepository, id: string, status: 'passed' | 'failed') {
  await waitFor(async () =>
    expect((await repo.getSession(id)).deviceChecks.at(-1)?.status).toBe(status),
  );
  return repo.getSession(id);
}
function deferred() {
  let resolve!: (report: DeviceDiagnosticsReport) => void;
  const promise = new Promise<DeviceDiagnosticsReport>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('S05 점검 Repository와 상태 전환', () => {
  test('응답 지연 시나리오는 대기 상태를 유지한 뒤 성공하며 장비 timeout 기준으로 사용하지 않는다', async () => {
    jest.useFakeTimers();
    try {
      const repo = new MockWorkflowRepository({ now });
      const ready = await prepared(repo);
      repo.setDeviceCheckScenario(ready.sessionId, 'delayed');
      await send(repo, ready, { type: 'startDeviceCheck' });
      await jest.advanceTimersByTimeAsync(2999);
      const checking = await repo.getSession(ready.sessionId);
      expect(checking.deviceChecks.at(-1)?.status).toBe('checking');
      expect(selectDeviceCheck(checking).canStart).toBe(false);
      await jest.advanceTimersByTimeAsync(1);
      expect((await repo.getSession(ready.sessionId)).deviceChecks.at(-1)?.status).toBe('passed');
    } finally {
      jest.useRealTimers();
    }
  });

  test('S04 미완료 또는 확인 완료 미제출 상태에서는 점검과 시작을 거절한다', async () => {
    const repo = repoWith();
    const initial = await repo.createSession({
      requestId: 'create',
      operatorId: 'researcher',
      procedure: mockProcedure,
    });
    await expect(
      send(repo, initial, { type: 'startDeviceCheck' }, 'inspect'),
    ).rejects.toMatchObject({ code: 'INVALID_STATE' });
    const checked = await prepared(repo, false);
    await expect(
      send(repo, checked, { type: 'startDeviceCheck' }, 'unsubmitted'),
    ).rejects.toMatchObject({ code: 'INVALID_STATE' });
    await expect(send(repo, checked, { type: 'startExecution' }, 'start')).rejects.toMatchObject({
      code: 'INVALID_STATE',
    });
  });

  test('같은 세션·버전의 성공 응답으로만 통신 근거와 6/6을 기록하고 시작은 별도 요청한다', async () => {
    const repo = repoWith();
    const ready = await prepared(repo);
    expect(selectPreparation(ready).completed).toBe(5);
    const started = await send(repo, ready, { type: 'startDeviceCheck' });
    expect(started.deviceChecks.at(-1)?.status).toBe('checking');
    const passed = await terminal(repo, ready.sessionId, 'passed');
    expect(passed.sessionId).toBe(ready.sessionId);
    expect(passed.procedure).toEqual(ready.procedure);
    expect(passed.phase).toBe('readyToExecute');
    expect(selectPreparation(passed)).toMatchObject({ completed: 6, percentage: 100 });
    expect(selectDeviceCheck(passed).canStart).toBe(true);
    expect(passed.evidence.filter((item) => item.kind === 'human')).toEqual(
      ready.evidence.filter((item) => item.kind === 'human'),
    );
    expect(passed.evidence.filter((item) => item.kind === 'sensor')).toHaveLength(3);
    expect(passed.evidence.at(-1)).toMatchObject({
      checkId: 'communication',
      kind: 'program',
      source: 'mock',
      action: 'deviceCheckPassed',
    });
    expect(passed.checks.find((item) => item.id === 'communication')?.evidenceId).toBe(
      passed.evidence.at(-1)?.evidenceId,
    );
    const running = await send(repo, passed, { type: 'startExecution' }, 'start');
    expect(running.phase).toBe('running');
    expect(selectDeviceCheck(running).executionStarted).toBe(true);
    const retry = await send(repo, passed, { type: 'startExecution' }, 'start');
    expect(retry.revision).toBe(running.revision);
    const repeated = await send(repo, running, { type: 'startExecution' }, 'start-another');
    expect(repeated.events.filter((item) => item.type === 'executionStarted')).toHaveLength(1);
    await expect(
      send(repo, running, { type: 'startDeviceCheck' }, 'after-start'),
    ).rejects.toMatchObject({ code: 'INVALID_STATE' });
  });

  test.each<MockDeviceScenario>(['disconnected', 'sensorError', 'timeout', 'stale'])(
    '%s 실패에서는 5/6을 유지하고 정상 재시도 후 원본 실패 이력을 보존한다',
    async (scenario) => {
      const repo = repoWith();
      const ready = await prepared(repo);
      repo.setDeviceCheckScenario(ready.sessionId, scenario);
      await send(repo, ready, { type: 'startDeviceCheck' });
      const failed = await terminal(repo, ready.sessionId, 'failed');
      expect(failed.phase).toBe('awaitingDeviceCheck');
      expect(failed.deviceChecks[0].issue).toBeDefined();
      expect(selectPreparation(failed).completed).toBe(5);
      expect(selectDeviceCheck(failed).canStart).toBe(false);
      await expect(
        send(repo, failed, { type: 'startExecution' }, 'bad-start'),
      ).rejects.toMatchObject({ code: 'INVALID_STATE' });
      repo.setDeviceCheckScenario(ready.sessionId, 'normal');
      await send(repo, failed, { type: 'startDeviceCheck' }, 'retry');
      const passed = await terminal(repo, ready.sessionId, 'passed');
      expect(passed.deviceChecks.map((attempt) => attempt.status)).toEqual(['failed', 'passed']);
      expect(passed.events.filter((event) => event.type === 'deviceCheckFailed')).toHaveLength(1);
      expect(passed.evidence.some((item) => item.action === 'deviceCheckFailed')).toBe(true);
      expect(selectPreparation(passed).completed).toBe(6);
    },
  );

  test('진행 중 요청·중복 요청·구독 해제와 재진입을 안전하게 처리한다', async () => {
    const gate = deferred();
    const inspect = jest.fn<MockDiagnosticsRunner>(() => gate.promise);
    const repo = repoWith(inspect);
    const ready = await prepared(repo);
    const revisions: number[] = [];
    const unsubscribe = repo.subscribe(ready.sessionId, (session) =>
      revisions.push(session.revision),
    );
    const [started, duplicate] = await Promise.all([
      send(repo, ready, { type: 'startDeviceCheck' }, 'same'),
      send(repo, ready, { type: 'startDeviceCheck' }, 'same'),
    ]);
    expect(started).toEqual(duplicate);
    await expect(
      send(repo, started, { type: 'startDeviceCheck' }, 'another'),
    ).rejects.toMatchObject({ code: 'INVALID_STATE' });
    await expect(
      send(repo, started, { type: 'startExecution' }, 'early-start'),
    ).rejects.toMatchObject({ code: 'INVALID_STATE' });
    expect(() => repo.setDeviceCheckScenario(ready.sessionId, 'normal')).toThrow();
    unsubscribe();
    expect((await repo.getSession(ready.sessionId)).deviceChecks[0].status).toBe('checking');
    gate.resolve(
      buildMockDiagnostics({
        definition: mockProcedure.deviceCheck!,
        scenario: 'normal',
        attemptId: started.deviceChecks[0].attemptId,
        now,
      }),
    );
    const passed = await terminal(repo, ready.sessionId, 'passed');
    expect(inspect).toHaveBeenCalledTimes(1);
    expect(revisions).toEqual([started.revision]);
    expect(passed.events.filter((event) => event.type === 'deviceCheckStarted')).toHaveLength(1);
    const retransmit = await send(repo, ready, { type: 'startDeviceCheck' }, 'same');
    expect(retransmit.phase).toBe('readyToExecute');
    expect(retransmit.deviceChecks).toHaveLength(1);
  });

  test('성공 뒤 재점검을 시작하면 이전 통신 확인을 즉시 무효화한다', async () => {
    const gate = deferred();
    let count = 0;
    const repo = repoWith(async (input) =>
      ++count === 1 ? buildMockDiagnostics(input) : gate.promise,
    );
    const ready = await prepared(repo);
    await send(repo, ready, { type: 'startDeviceCheck' });
    const passed = await terminal(repo, ready.sessionId, 'passed');
    const rechecking = await send(repo, passed, { type: 'startDeviceCheck' }, 'recheck');
    expect(selectPreparation(rechecking).completed).toBe(5);
    expect(selectDeviceCheck(rechecking).canStart).toBe(false);
    await expect(
      send(repo, rechecking, { type: 'startExecution' }, 'old-success'),
    ).rejects.toMatchObject({ code: 'INVALID_STATE' });
    gate.resolve(
      buildMockDiagnostics({
        definition: mockProcedure.deviceCheck!,
        scenario: 'sensorError',
        attemptId: rechecking.deviceChecks[1].attemptId,
        now,
      }),
    );
    const failed = await terminal(repo, ready.sessionId, 'failed');
    expect(failed.deviceChecks.map((attempt) => attempt.status)).toEqual(['passed', 'failed']);
  });

  test('점검 처리 예외도 실패로 기록해 재시도 가능 상태로 복구한다', async () => {
    const repo = repoWith(async () => {
      throw new Error('transport unavailable');
    });
    const ready = await prepared(repo);
    await send(repo, ready, { type: 'startDeviceCheck' });
    const failed = await terminal(repo, ready.sessionId, 'failed');
    expect(failed.deviceChecks[0].issue?.code).toBe('MOCK_DIAGNOSTICS_ERROR');
    expect(selectDeviceCheck(failed).canInspect).toBe(true);
  });

  test.each([
    'missingSensor',
    'missingValue',
    'wrongUnit',
    'invalidTime',
    'wrongDevice',
    'wrongSource',
  ])('성공 표기라도 %s 응답이면 다음 단계로 진행하지 않는다', async (variant) => {
    const repo = repoWith(async (input) => {
      const raw = JSON.parse(JSON.stringify(buildMockDiagnostics(input)));
      if (variant === 'missingSensor') raw.sensors.pop();
      if (variant === 'missingValue') raw.sensors[0].readings[0].value = null;
      if (variant === 'wrongUnit') raw.sensors[0].readings[0].unit = 'V';
      if (variant === 'invalidTime') raw.sensors[0].readings[0].observedAt = 'invalid';
      if (variant === 'wrongDevice') raw.deviceId = 'other-device';
      if (variant === 'wrongSource') raw.source = 'api';
      return raw;
    });
    const ready = await prepared(repo);
    await send(repo, ready, { type: 'startDeviceCheck' });
    const failed = await terminal(repo, ready.sessionId, 'failed');
    expect(selectDeviceCheck(failed).canStart).toBe(false);
    expect(selectPreparation(failed).completed).toBe(5);
  });

  test('점검 정의가 없는 기존 절차는 S04까지 유지하되 S05 진행은 차단한다', async () => {
    const repo = repoWith();
    const { deviceCheck: omitted, ...procedure } = mockProcedure;
    expect(omitted).toBeDefined();
    let session = await repo.createSession({
      requestId: 'old',
      operatorId: 'researcher',
      procedure,
    });
    for (const check of procedure.preparation.filter((item) => item.requiredForDeviceCheck)) {
      session = await send(repo, session, {
        type: 'setPreparationCheck',
        checkId: check.id,
        checked: true,
      });
    }
    session = await send(repo, session, { type: 'completePreparation' });
    expect(selectDeviceCheck(session).canInspect).toBe(false);
    await expect(send(repo, session, { type: 'startDeviceCheck' })).rejects.toMatchObject({
      code: 'INVALID_STATE',
    });
  });
});
