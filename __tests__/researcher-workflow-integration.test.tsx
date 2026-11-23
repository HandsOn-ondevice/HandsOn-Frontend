import { describe, expect, jest, test } from '@jest/globals';
import { render, waitFor } from '@testing-library/react-native';
import { AppText } from '../src/design-system';
import type {
  ExperimentSession,
  WorkflowCommand,
} from '../src/features/researcher-workflow/domain/models';
import { selectExecution } from '../src/features/researcher-workflow/domain/execution';
import { MockWorkflowRepository } from '../src/features/researcher-workflow/infrastructure/mock/MockWorkflowRepository';
import { buildMockDiagnostics } from '../src/features/researcher-workflow/infrastructure/mock/device-check-scenarios';
import { buildMockExecutionReport } from '../src/features/researcher-workflow/infrastructure/mock/execution-scenarios';
import { mockProcedure } from '../src/features/researcher-workflow/infrastructure/mock/fixtures';
import { WorkflowProvider } from '../src/features/researcher-workflow/state/WorkflowProvider';

async function start(repository: MockWorkflowRepository, session: ExperimentSession) {
  let current = session;
  const send = async (command: WorkflowCommand) => {
    current = await repository.executeCommand(current.sessionId, command, {
      requestId: `integration-${current.revision}`,
      expectedRevision: current.revision,
    });
  };
  for (const check of current.procedure.preparation.filter((item) => item.owner === 'operator')) {
    await send({ type: 'setPreparationCheck', checkId: check.id, checked: true });
  }
  await send({ type: 'completePreparation' });
  await send({ type: 'startDeviceCheck' });
  await waitFor(async () =>
    expect((await repository.getSession(current.sessionId)).phase).toBe('readyToExecute'),
  );
  current = await repository.getSession(current.sessionId);
  const prepared = current;
  await send({ type: 'startExecution' });
  return { prepared, running: current };
}

describe('main의 준비 세션과 실행 기능 통합', () => {
  test('S01 고정 세션과 새 세션 모두 S04·S05 기록을 유지한 채 S06 측정을 명시적으로 완료한다', async () => {
    const repository = new MockWorkflowRepository({
      inspect: async (input) => buildMockDiagnostics(input),
      sample: async (input) => buildMockExecutionReport(input),
    });
    const seeded = await repository.getSession('demo-session-led-m03');
    expect(seeded.phase).toBe('preparing');
    expect(seeded.execution).toBeUndefined();
    const created = await repository.createSession({
      requestId: 'integration-create',
      operatorId: 'researcher',
      procedure: mockProcedure,
    });
    for (const initial of [seeded, created]) {
      const { prepared, running } = await start(repository, initial);
      expect(running.sessionId).toBe(initial.sessionId);
      expect(running.procedure).toEqual(initial.procedure);
      expect(running.checks).toEqual(prepared.checks);
      expect(running.deviceChecks).toEqual(prepared.deviceChecks);
      expect(running.evidence.slice(0, prepared.evidence.length)).toEqual(prepared.evidence);
      expect(running.execution?.cursor?.trialIndex).toBe(1);
      const cursor = running.execution!.cursor!;
      await repository.executeCommand(
        running.sessionId,
        { type: 'requestExecutionSample', cursorId: cursor.cursorId },
        { requestId: 'integration-sample', expectedRevision: running.revision },
      );
      await waitFor(async () =>
        expect(selectExecution(await repository.getSession(running.sessionId)).canComplete).toBe(
          true,
        ),
      );
      const ready = await repository.getSession(running.sessionId);
      expect(selectExecution(ready).completedCount).toBe(0);
      const complete = await repository.executeCommand(
        ready.sessionId,
        {
          type: 'completeExecutionStep',
          cursorId: cursor.cursorId,
          sampleAttemptId: selectExecution(ready).latest!.attemptId,
        },
        { requestId: 'integration-complete', expectedRevision: ready.revision },
      );
      expect(complete.phase).toBe('running');
      expect(selectExecution(complete).completedCount).toBe(1);
      expect(complete.checks).toEqual(prepared.checks);
    }
  });

  test('일반 배포는 Mock을 차단하고 Maestro fixture 빌드는 같은 준비·실행 계약을 허용한다', async () => {
    const environment = globalThis as unknown as { __DEV__: boolean };
    const previousDev = environment.__DEV__;
    const previousFlag = process.env.EXPO_PUBLIC_HANDSON_MAESTRO;
    const repository = new MockWorkflowRepository({
      inspect: async (input) => buildMockDiagnostics(input),
    });
    try {
      environment.__DEV__ = false;
      delete process.env.EXPO_PUBLIC_HANDSON_MAESTRO;
      await expect(repository.getSession('demo-session-led-m03')).rejects.toMatchObject({
        code: 'INVALID_STATE',
      });
      await expect(
        repository.createSession({
          requestId: 'blocked',
          operatorId: 'researcher',
          procedure: mockProcedure,
        }),
      ).rejects.toMatchObject({ code: 'INVALID_STATE' });
      await expect(
        repository.executeCommand(
          'demo-session-led-m03',
          { type: 'completePreparation' },
          { requestId: 'blocked', expectedRevision: 0 },
        ),
      ).rejects.toMatchObject({ code: 'INVALID_STATE' });
      expect(() => repository.subscribe('demo-session-led-m03', () => {})).toThrow();
      const screen = await render(
        <WorkflowProvider repository={repository}>
          <AppText>실행 내용</AppText>
        </WorkflowProvider>,
      );
      expect(screen.getByText('실험 서비스를 준비하고 있습니다.')).toBeTruthy();
      expect(screen.queryByText('실행 내용')).toBeNull();
      process.env.EXPO_PUBLIC_HANDSON_MAESTRO = '1';
      const initial = await repository.getSession('demo-session-led-m03');
      const { running } = await start(repository, initial);
      expect(running.execution?.cursor).toBeTruthy();
      const listener = jest.fn();
      const unsubscribe = repository.subscribe(initial.sessionId, listener);
      unsubscribe();
      await screen.rerender(
        <WorkflowProvider repository={repository}>
          <AppText>실행 내용</AppText>
        </WorkflowProvider>,
      );
      expect(screen.getByText('실행 내용')).toBeTruthy();
    } finally {
      environment.__DEV__ = previousDev;
      if (previousFlag === undefined) delete process.env.EXPO_PUBLIC_HANDSON_MAESTRO;
      else process.env.EXPO_PUBLIC_HANDSON_MAESTRO = previousFlag;
    }
  });
});
