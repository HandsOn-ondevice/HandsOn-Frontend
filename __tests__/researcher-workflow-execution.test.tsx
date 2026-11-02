import { describe, expect, jest, test } from '@jest/globals';
import { waitFor } from '@testing-library/react-native';
import { MockWorkflowRepository } from '../src/features/researcher-workflow/infrastructure/mock/MockWorkflowRepository';
import { mockProcedure } from '../src/features/researcher-workflow/infrastructure/mock/fixtures';
import { buildMockDiagnostics } from '../src/features/researcher-workflow/infrastructure/mock/device-check-scenarios';
import {
  buildMockExecutionReport,
  type MockExecutionRunner,
  type MockExecutionScenario,
} from '../src/features/researcher-workflow/infrastructure/mock/execution-scenarios';
import type {
  ExperimentSession,
  WorkflowCommand,
} from '../src/features/researcher-workflow/domain/models';
import {
  selectExecution,
  type ExecutionSampleReport,
} from '../src/features/researcher-workflow/domain/execution';

const now = () => '2026-11-02T02:00:00.000Z';
function repoWith(sample: MockExecutionRunner = async (input) => buildMockExecutionReport(input)) {
  return new MockWorkflowRepository({
    now,
    inspect: async (input) => buildMockDiagnostics(input),
    sample,
  });
}
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
async function running(repo: MockWorkflowRepository) {
  let session = await repo.createSession({
    requestId: 'create',
    operatorId: 'researcher',
    procedure: mockProcedure,
  });
  for (const check of mockProcedure.preparation.filter((item) => item.owner === 'operator')) {
    session = await send(repo, session, {
      type: 'setPreparationCheck',
      checkId: check.id,
      checked: true,
    });
  }
  session = await send(repo, session, { type: 'completePreparation' });
  await send(repo, session, { type: 'startDeviceCheck' });
  await waitFor(async () =>
    expect((await repo.getSession(session.sessionId)).phase).toBe('readyToExecute'),
  );
  session = await repo.getSession(session.sessionId);
  return send(repo, session, { type: 'startExecution' });
}
async function sampleReady(repo: MockWorkflowRepository, session: ExperimentSession) {
  const cursor = session.execution!.cursor!;
  await send(repo, session, { type: 'requestExecutionSample', cursorId: cursor.cursorId });
  await waitFor(async () =>
    expect(selectExecution(await repo.getSession(session.sessionId)).latest?.status).not.toBe(
      'sampling',
    ),
  );
  return repo.getSession(session.sessionId);
}
function completeCommand(session: ExperimentSession): WorkflowCommand {
  const state = selectExecution(session);
  return {
    type: 'completeExecutionStep',
    cursorId: state.cursor!.cursorId,
    sampleAttemptId: state.latest!.attemptId,
  };
}

describe('S06 Mock 회차 실행과 근거', () => {
  test('S05 미완료 세션은 직접 실행 명령을 보내도 진행할 수 없다', async () => {
    const repo = repoWith();
    const session = await repo.createSession({
      requestId: 'create',
      operatorId: 'researcher',
      procedure: mockProcedure,
    });
    await expect(
      send(repo, session, { type: 'requestExecutionSample', cursorId: 'fake' }),
    ).rejects.toMatchObject({ code: 'INVALID_STATE' });
    await expect(
      send(repo, session, {
        type: 'completeExecutionStep',
        cursorId: 'fake',
        sampleAttemptId: 'fake',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_STATE' });
    expect((await repo.getSession(session.sessionId)).events).toEqual(session.events);
  });

  test('초기 커서는 첫 조건 1회차이며 재진입과 중복 시작으로 초기화되지 않는다', async () => {
    const repo = repoWith();
    const session = await running(repo);
    expect(session.execution?.cursor).toMatchObject({ conditionId: 'output-0', trialIndex: 1 });
    expect(selectExecution(session)).toMatchObject({
      completedCount: 0,
      total: 15,
      percentage: 0,
      canComplete: false,
    });
    expect(await repo.getSession(session.sessionId)).toEqual(session);
    const repeated = await send(repo, session, { type: 'startExecution' }, 'again');
    expect(repeated).toEqual(session);
    expect(repeated.procedure.version).toBe('1.2');
    expect(repeated.events.filter((event) => event.type === 'executionStarted')).toHaveLength(1);
  });

  test('센서 응답만으로 사람 근거가 생기지 않고 명시적 완료 후만 다음 회차로 진행한다', async () => {
    const repo = repoWith();
    const started = await running(repo);
    const ready = await sampleReady(repo, started);
    expect(ready.evidence).toEqual(started.evidence);
    expect(selectExecution(ready).canComplete).toBe(true);
    const command = completeCommand(ready);
    const accepted = await send(repo, ready, command, 'complete');
    expect(accepted.execution?.cursor).toMatchObject({ conditionId: 'output-0', trialIndex: 2 });
    expect(selectExecution(accepted)).toMatchObject({
      completedCount: 1,
      percentage: 7,
      canComplete: false,
    });
    expect(accepted.execution?.attempts[0].status).toBe('valid');
    const human = accepted.evidence.filter((item) => item.action === 'measurementConfirmed');
    expect(human).toHaveLength(1);
    expect(human[0]).toMatchObject({
      kind: 'human',
      actorId: 'researcher',
      source: 'mock',
      cursor: started.execution!.cursor,
    });
    expect(
      accepted.evidence.filter(
        (item) => item.action === 'measurementAccepted' && item.kind === 'sensor',
      ),
    ).toHaveLength(3);
    expect(accepted.sessionId).toBe(started.sessionId);
    expect(accepted.deviceChecks).toEqual(started.deviceChecks);
    expect(accepted.procedure).toEqual(started.procedure);
    expect(await send(repo, ready, command, 'complete')).toEqual(accepted);
    expect(await send(repo, accepted, command, 'new-duplicate')).toEqual(accepted);
    expect(accepted.events.filter((event) => event.type === 'measurementAccepted')).toHaveLength(1);
  });

  test.each<MockExecutionScenario>(['waiting', 'stale', 'noResponse', 'error', 'held'])(
    '%s 응답은 완료되지 않고 명시적 정상 재요청 후에만 완료 가능하다',
    async (scenario) => {
      const repo = repoWith();
      const started = await running(repo);
      repo.setExecutionScenario(started.sessionId, scenario);
      const rejected = await sampleReady(repo, started);
      expect(selectExecution(rejected).canComplete).toBe(false);
      expect(selectExecution(rejected).completedCount).toBe(0);
      expect(rejected.execution?.cursor).toEqual(started.execution?.cursor);
      await expect(
        send(repo, rejected, completeCommand(rejected), 'bad-complete'),
      ).rejects.toMatchObject({ code: 'INVALID_STATE' });
      repo.setExecutionScenario(started.sessionId, 'normal');
      const ready = await sampleReady(repo, rejected);
      expect(selectExecution(ready).canComplete).toBe(true);
      expect(ready.execution?.attempts).toHaveLength(2);
      expect(ready.execution?.attempts[0]).toEqual(rejected.execution?.attempts[0]);
      const accepted = await send(repo, ready, completeCommand(ready));
      expect(selectExecution(accepted).completedCount).toBe(1);
      expect(accepted.execution?.attempts[0].status).not.toBe('valid');
    },
  );

  test('같은 회차 응답을 새로 요청하면 이전 준비 응답을 재사용할 수 없다', async () => {
    const repo = repoWith();
    const ready = await sampleReady(repo, await running(repo));
    const old = completeCommand(ready);
    const refreshed = await sampleReady(repo, ready);
    expect(refreshed.execution?.attempts[0].status).toBe('superseded');
    await expect(send(repo, refreshed, old, 'old-response')).rejects.toMatchObject({
      code: 'INVALID_STATE',
    });
    expect((await repo.getSession(ready.sessionId)).execution?.attempts).toHaveLength(2);
  });

  test('지연 응답 중 중복 요청·완료·시나리오 변경을 막고 이탈 뒤에도 결과를 보존한다', async () => {
    let resolve!: (report: ExecutionSampleReport) => void;
    let input!: Parameters<MockExecutionRunner>[0];
    const gate = new Promise<ExecutionSampleReport>((done) => {
      resolve = done;
    });
    const sample = jest.fn<MockExecutionRunner>((value) => {
      input = value;
      return gate;
    });
    const repo = repoWith(sample);
    const started = await running(repo);
    const cursorId = started.execution!.cursor!.cursorId;
    const command = { type: 'requestExecutionSample', cursorId } as const;
    const [first, second] = await Promise.all([
      send(repo, started, command, 'same'),
      send(repo, started, command, 'same'),
    ]);
    expect(first).toEqual(second);
    await expect(send(repo, first, command, 'another')).rejects.toMatchObject({
      code: 'INVALID_STATE',
    });
    expect(() => repo.setExecutionScenario(first.sessionId, 'normal')).toThrow();
    await expect(send(repo, first, completeCommand(first), 'early')).rejects.toMatchObject({
      code: 'INVALID_STATE',
    });
    resolve(buildMockExecutionReport(input));
    await waitFor(async () =>
      expect(selectExecution(await repo.getSession(first.sessionId)).canComplete).toBe(true),
    );
    expect(sample).toHaveBeenCalledTimes(1);
    expect((await repo.getSession(first.sessionId)).execution?.attempts).toHaveLength(1);
  });

  test.each(['cursor', 'source', 'missing', 'oldTimestamp'])(
    '응답의 %s가 잘못되면 성공으로 표시된 값도 유효 측정이 되지 않는다',
    async (variant) => {
      const repo = repoWith(async (input) => {
        const raw = JSON.parse(JSON.stringify(buildMockExecutionReport(input)));
        if (variant === 'cursor') raw.cursorId = 'other';
        if (variant === 'source') raw.source = 'api';
        if (variant === 'missing') raw.diagnostics.sensors[0].readings = [];
        if (variant === 'oldTimestamp')
          raw.diagnostics.sensors[0].readings[0].observedAt = '2026-01-01T00:00:00.000Z';
        return raw;
      });
      const rejected = await sampleReady(repo, await running(repo));
      expect(selectExecution(rejected).canComplete).toBe(false);
      expect(rejected.execution?.attempts[0].issue).toBeDefined();
    },
  );

  test('모호한 음성은 커서·근거를 유지하며 S07 취소 복귀 후에만 완료 요청을 허용한다', async () => {
    const repo = repoWith();
    const ready = await sampleReady(repo, await running(repo));
    const command = {
      type: 'requestVoiceClarification',
      cursorId: ready.execution!.cursor!.cursorId,
      utterance: '다시 해줘',
    } as const;
    const pending = await send(repo, ready, command, 'voice');
    expect(pending.execution?.cursor).toEqual(ready.execution?.cursor);
    expect(pending.execution?.attempts).toEqual(ready.execution?.attempts);
    expect(pending.evidence).toEqual(ready.evidence);
    expect(await send(repo, ready, command, 'voice')).toEqual(pending);
    await expect(
      send(repo, pending, completeCommand(pending), 'voice-complete'),
    ).rejects.toMatchObject({ code: 'INVALID_STATE' });
    const dismissed = await send(repo, pending, {
      type: 'dismissVoiceClarification',
      commandId: pending.execution!.pendingVoice!.commandId,
    });
    expect(dismissed.execution?.pendingVoice).toBeNull();
    expect(selectExecution(dismissed).canComplete).toBe(true);
    expect(dismissed.execution?.cursor).toEqual(ready.execution?.cursor);
  });

  test('초안의 반복을 모두 끝내도 실험 종료·장치 정리·제출을 완료 처리하지 않는다', async () => {
    const repo = repoWith();
    let session = await running(repo);
    for (let i = 0; i < 15; i++) {
      session = await sampleReady(repo, session);
      session = await send(repo, session, completeCommand(session));
    }
    expect(selectExecution(session)).toMatchObject({
      completed: true,
      completedCount: 15,
      percentage: 100,
      canSample: false,
      canComplete: false,
    });
    expect(session.phase).toBe('running');
    expect(session.execution?.cursor).toBeNull();
    expect(
      session.execution?.attempts.filter((attempt) => attempt.status === 'valid'),
    ).toHaveLength(15);
    expect(session.events.filter((event) => event.type === 'measurementAccepted')).toHaveLength(15);
  }, 10000);

  test('실행 정의가 없는 기존 절차는 S05 동작을 유지하되 S06 측정 진행은 거절한다', async () => {
    const repo = repoWith();
    const started = await running(repo);
    const snapshot: ExperimentSession = {
      ...started,
      procedure: { ...started.procedure, execution: undefined },
      execution: undefined,
    };
    expect(selectExecution(snapshot)).toMatchObject({
      configured: false,
      canSample: false,
      canComplete: false,
    });
  });
});
