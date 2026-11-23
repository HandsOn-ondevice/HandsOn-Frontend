import { describe, expect, jest, test } from '@jest/globals';
import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native';
import type {
  ExperimentSession,
  WorkflowCommand,
} from '../src/features/researcher-workflow/domain/models';
import type { ExecutionSampleReport } from '../src/features/researcher-workflow/domain/execution';
import { selectExecution } from '../src/features/researcher-workflow/domain/execution';
import { MockWorkflowRepository } from '../src/features/researcher-workflow/infrastructure/mock/MockWorkflowRepository';
import { mockProcedure } from '../src/features/researcher-workflow/infrastructure/mock/fixtures';
import { buildMockDiagnostics } from '../src/features/researcher-workflow/infrastructure/mock/device-check-scenarios';
import {
  buildMockExecutionReport,
  type MockExecutionRunner,
} from '../src/features/researcher-workflow/infrastructure/mock/execution-scenarios';
import { WorkflowProvider } from '../src/features/researcher-workflow/state/WorkflowProvider';
import { SessionMenuScreen } from '../src/features/researcher-workflow/screens/SessionMenuScreen';
import { PauseScreen } from '../src/features/researcher-workflow/screens/PauseScreen';

jest.mock('expo-router', () => ({ useFocusEffect: jest.fn() }));

function repository(
  sample: MockExecutionRunner = async (input) => buildMockExecutionReport(input),
) {
  return new MockWorkflowRepository({
    now: () => '2026-11-09T01:00:00.000Z',
    inspect: async (input) => buildMockDiagnostics(input),
    sample,
  });
}

function send(
  repo: MockWorkflowRepository,
  session: ExperimentSession,
  command: WorkflowCommand,
  requestId = `request-${session.revision}`,
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
  for (const item of mockProcedure.preparation.filter((check) => check.owner === 'operator')) {
    session = await send(repo, session, {
      type: 'setPreparationCheck',
      checkId: item.id,
      checked: true,
    });
  }
  session = await send(repo, session, { type: 'completePreparation' });
  await send(repo, session, { type: 'startDeviceCheck' });
  await waitFor(async () =>
    expect((await repo.getSession(session.sessionId)).phase).toBe('readyToExecute'),
  );
  return send(repo, await repo.getSession(session.sessionId), { type: 'startExecution' });
}

async function ready(repo: MockWorkflowRepository, session: ExperimentSession) {
  await send(repo, session, {
    type: 'requestExecutionSample',
    cursorId: session.execution!.cursor!.cursorId,
  });
  await waitFor(async () =>
    expect(selectExecution(await repo.getSession(session.sessionId)).latest?.status).not.toBe(
      'sampling',
    ),
  );
  return repo.getSession(session.sessionId);
}

describe('S10 사용자 일시정지와 기존 기록 보존', () => {
  test('정상 완료한 회차와 고정 절차·커서·근거를 그대로 보관하고 중복 일시정지는 한 번만 기록한다', async () => {
    const repo = repository();
    let session = await ready(repo, await running(repo));
    session = await send(repo, session, {
      type: 'completeExecutionStep',
      cursorId: session.execution!.cursor!.cursorId,
      sampleAttemptId: session.execution!.attempts.at(-1)!.attemptId,
    });
    const command = {
      type: 'pauseExecution',
      cursorId: session.execution!.cursor!.cursorId,
    } as const;
    const paused = await send(repo, session, command, 'pause');
    expect(paused.phase).toBe('paused');
    expect(paused.revision).toBe(session.revision + 1);
    for (const key of [
      'sessionId',
      'procedure',
      'checks',
      'deviceChecks',
      'execution',
      'evidence',
    ] as const)
      expect(paused[key]).toEqual(session[key]);
    expect(paused.events.slice(0, -1)).toEqual(session.events);
    expect(paused.events.at(-1)).toMatchObject({
      type: 'executionPaused',
      cursor: session.execution!.cursor,
    });
    expect(await send(repo, session, command, 'pause')).toEqual(paused);
    expect(await send(repo, paused, command, 'pause-again')).toEqual(paused);
    expect(selectExecution(paused).completedCount).toBe(1);
    const screen = await render(
      <WorkflowProvider repository={repo}>
        <PauseScreen
          sessionId={session.sessionId}
          onBack={() => {}}
          onHome={() => {}}
          onResume={() => {}}
        />
      </WorkflowProvider>,
    );
    await screen.findByText('진행 상태를 안전하게 저장했어요');
    const heading = within(screen.getByTestId('pause-heading'));
    expect(heading.getByRole('header', { name: '실험 일시정지' })).toBeTruthy();
    expect(heading.getByText(`세션 ${session.sessionId}`)).toBeTruthy();
    expect(screen.getByTestId('pause-led-caution')).toHaveTextContent(
      '자리를 비우기 전 LED 출력을 0%로 내리고 전원을 확인하세요.',
    );
    expect(screen.getByTestId('pause-storage-scope')).toHaveTextContent(
      '앱 실행 중에만 보관합니다. 재시작·새로고침 후 복원과 실제 LED 차단은 보장하지 않습니다.',
    );
    expect(screen.getByText('마지막 유효 측정 · 0% 1회차')).toBeTruthy();
    expect(screen.getByText('다음 작업 · 0% 2회차')).toBeTruthy();
    expect(screen.getByText('완료 근거 5건 유지')).toBeTruthy();
  });

  test('일시정지 중 측정·완료·음성·준비 변경 명령은 상태를 바꾸지 못한다', async () => {
    const repo = repository();
    const session = await ready(repo, await running(repo));
    const cursorId = session.execution!.cursor!.cursorId;
    const paused = await send(repo, session, { type: 'pauseExecution', cursorId });
    const commands: WorkflowCommand[] = [
      { type: 'requestExecutionSample', cursorId },
      {
        type: 'completeExecutionStep',
        cursorId,
        sampleAttemptId: session.execution!.attempts.at(-1)!.attemptId,
      },
      { type: 'requestVoiceClarification', cursorId, utterance: '다시 해줘' },
      { type: 'startExecution' },
      { type: 'setPreparationCheck', checkId: 'materials', checked: false },
    ];
    for (const command of commands)
      await expect(send(repo, paused, command)).rejects.toMatchObject({ code: 'INVALID_STATE' });
    expect(await repo.getSession(session.sessionId)).toEqual(paused);
    expect(selectExecution(paused).canComplete).toBe(false);
  });

  test('일시정지 전에 요청한 늦은 응답은 현재 상태나 완료 근거를 변경하지 않는다', async () => {
    let resolve!: (report: ExecutionSampleReport) => void;
    let input!: Parameters<MockExecutionRunner>[0];
    const gate = new Promise<ExecutionSampleReport>((done) => {
      resolve = done;
    });
    const repo = repository(async (value) => {
      input = value;
      return gate;
    });
    const session = await running(repo);
    const sampling = await send(repo, session, {
      type: 'requestExecutionSample',
      cursorId: session.execution!.cursor!.cursorId,
    });
    await waitFor(() => expect(input).toBeDefined());
    const paused = await send(repo, sampling, {
      type: 'pauseExecution',
      cursorId: sampling.execution!.cursor!.cursorId,
    });
    await act(async () => {
      resolve(buildMockExecutionReport(input));
      await gate;
    });
    expect(await repo.getSession(session.sessionId)).toEqual(paused);
    expect(selectExecution(paused).canComplete).toBe(false);
  });

  test('센서 오류 보류는 사용자 일시정지와 구분하며 오류·복구·음성 이력을 보존한다', async () => {
    const repo = repository();
    let session = await running(repo);
    const cursorId = session.execution!.cursor!.cursorId;
    session = await send(repo, session, {
      type: 'requestVoiceClarification',
      cursorId,
      utterance: '다시 해줘',
    });
    session = await send(repo, session, {
      type: 'dismissVoiceClarification',
      commandId: session.execution!.pendingVoice!.commandId,
    });
    repo.setExecutionScenario(session.sessionId, 'stale');
    session = await ready(repo, session);
    expect(session.phase).toBe('running');
    expect(session.execution!.attempts.at(-1)!.status).toBe('held');
    await send(repo, session, {
      type: 'requestRecovery',
      cursorId,
      blockedAttemptId: session.execution!.attempts.at(-1)!.attemptId,
    });
    await waitFor(async () =>
      expect((await repo.getSession(session.sessionId)).execution!.recoveries!.at(-1)!.status).toBe(
        'failed',
      ),
    );
    session = await repo.getSession(session.sessionId);
    const paused = await send(repo, session, { type: 'pauseExecution', cursorId });
    expect(paused.execution).toEqual(session.execution);
    expect(paused.evidence).toEqual(session.evidence);
    expect(paused.events.slice(0, -1)).toEqual(session.events);
  });

  test('없는 세션·다른 커서·오래된 revision·요청 ID 재사용을 기존 검증으로 거절한다', async () => {
    const repo = repository();
    const session = await running(repo);
    const command = {
      type: 'pauseExecution',
      cursorId: session.execution!.cursor!.cursorId,
    } as const;
    await expect(
      repo.executeCommand('missing', command, { requestId: 'missing', expectedRevision: 0 }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(send(repo, session, { ...command, cursorId: 'wrong' })).rejects.toMatchObject({
      code: 'INVALID_STATE',
    });
    await expect(
      repo.executeCommand(session.sessionId, command, {
        requestId: 'old',
        expectedRevision: session.revision - 1,
      }),
    ).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
    const paused = await send(repo, session, command, 'pause');
    await expect(send(repo, paused, { type: 'startExecution' }, 'pause')).rejects.toMatchObject({
      code: 'REQUEST_CONFLICT',
    });
    expect(await repo.getSession(session.sessionId)).toEqual(paused);
  });
});

describe('S06 세션 메뉴의 일시정지와 S10 화면', () => {
  test('명시적인 버튼 조작이 성공한 뒤에만 한 번 이동하며 홈·재개 이동 요청은 상태를 유지한다', async () => {
    const repo = repository();
    const session = await running(repo);
    const onPause = jest.fn();
    const onHome = jest.fn();
    const onResume = jest.fn();
    const gate = Promise.withResolvers<void>();
    const execute = repo.executeCommand.bind(repo);
    const requests = jest.spyOn(repo, 'executeCommand').mockImplementation(async (...args) => {
      await gate.promise;
      return execute(...args);
    });
    const screen = await render(
      <WorkflowProvider repository={repo}>
        <SessionMenuScreen
          sessionId={session.sessionId}
          onExecution={() => {}}
          onDeviceStatus={() => {}}
          onPause={onPause}
        />
      </WorkflowProvider>,
    );
    const pause = await screen.findByRole('button', { name: '실험 일시정지' });
    expect(onPause).not.toHaveBeenCalled();
    await fireEvent.press(pause);
    await fireEvent.press(pause);
    expect(requests).toHaveBeenCalledTimes(1);
    await act(async () => gate.resolve());
    await waitFor(() => expect(onPause).toHaveBeenCalledTimes(1));
    const paused = await repo.getSession(session.sessionId);
    await screen.rerender(
      <WorkflowProvider repository={repo}>
        <PauseScreen
          sessionId={session.sessionId}
          onBack={() => {}}
          onHome={onHome}
          onResume={onResume}
        />
      </WorkflowProvider>,
    );
    await screen.findByText('진행 상태를 안전하게 저장했어요');
    await fireEvent.press(screen.getByRole('button', { name: '홈으로' }));
    expect(onHome).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByRole('button', { name: '바로 재개' }));
    expect(onResume).toHaveBeenCalledTimes(1);
    expect(await repo.getSession(session.sessionId)).toEqual(paused);
  });

  test('저장 실패는 세션 메뉴에 오류를 표시하고 S10으로 이동하지 않는다', async () => {
    const repo = repository();
    const session = await running(repo);
    const onPause = jest.fn();
    jest
      .spyOn(repo, 'executeCommand')
      .mockRejectedValueOnce(new Error('일시정지 상태를 저장하지 못했습니다.'));
    const screen = await render(
      <WorkflowProvider repository={repo}>
        <SessionMenuScreen
          sessionId={session.sessionId}
          onExecution={() => {}}
          onDeviceStatus={() => {}}
          onPause={onPause}
        />
      </WorkflowProvider>,
    );
    await fireEvent.press(await screen.findByRole('button', { name: '실험 일시정지' }));
    await screen.findByText('일시정지 상태를 저장하지 못했습니다.');
    expect(onPause).not.toHaveBeenCalled();
    expect(await repo.getSession(session.sessionId)).toEqual(session);
  });

  test('직접 진입한 정상 세션이나 없는 세션에 저장 성공을 표시하지 않는다', async () => {
    const repo = repository();
    const session = await running(repo);
    const screen = await render(
      <WorkflowProvider repository={repo}>
        <PauseScreen
          sessionId={session.sessionId}
          onBack={() => {}}
          onHome={() => {}}
          onResume={() => {}}
        />
      </WorkflowProvider>,
    );
    await screen.findByText('일시정지된 실험이 아닙니다');
    expect(screen.queryByText('진행 상태를 안전하게 저장했어요')).toBeNull();
    expect(await repo.getSession(session.sessionId)).toEqual(session);
    await screen.rerender(
      <WorkflowProvider repository={repo}>
        <PauseScreen
          key="missing"
          sessionId="missing"
          onBack={() => {}}
          onHome={() => {}}
          onResume={() => {}}
        />
      </WorkflowProvider>,
    );
    await screen.findByText('일시정지 기록을 확인할 수 없습니다');
    expect(screen.queryByText('진행 상태를 안전하게 저장했어요')).toBeNull();
    expect(screen.getByRole('button', { name: '상태 다시 불러오기' })).toBeTruthy();
  });
});
