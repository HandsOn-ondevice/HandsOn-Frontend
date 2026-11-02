import { describe, expect, jest, test } from '@jest/globals';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import type {
  ExperimentSession,
  WorkflowCommand,
} from '../src/features/researcher-workflow/domain/models';
import type { WorkflowRepository } from '../src/features/researcher-workflow/application/WorkflowRepository';
import { selectExecution } from '../src/features/researcher-workflow/domain/execution';
import {
  selectVoiceClarification,
  type VoiceChoice,
} from '../src/features/researcher-workflow/domain/voice-clarification';
import { MockWorkflowRepository } from '../src/features/researcher-workflow/infrastructure/mock/MockWorkflowRepository';
import { mockProcedure } from '../src/features/researcher-workflow/infrastructure/mock/fixtures';
import { buildMockDiagnostics } from '../src/features/researcher-workflow/infrastructure/mock/device-check-scenarios';
import {
  buildMockExecutionReport,
  type MockExecutionRunner,
} from '../src/features/researcher-workflow/infrastructure/mock/execution-scenarios';
import { resolveVoiceClarification } from '../src/features/researcher-workflow/infrastructure/mock/voice-clarification-transitions';
import { VoiceClarificationScreen } from '../src/features/researcher-workflow/screens/VoiceClarificationScreen';
import { WorkflowProvider } from '../src/features/researcher-workflow/state/WorkflowProvider';

async function send(
  repo: WorkflowRepository,
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
  utterance = '다시 해줘',
  sample: MockExecutionRunner = async (input) => buildMockExecutionReport(input),
) {
  const repo = new MockWorkflowRepository({
    inspect: async (input) => buildMockDiagnostics(input),
    sample,
  });
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
  session = await send(repo, session, { type: 'startExecution' });
  await send(repo, session, {
    type: 'requestExecutionSample',
    cursorId: session.execution!.cursor!.cursorId,
  });
  await waitFor(async () =>
    expect(selectExecution(await repo.getSession(session.sessionId)).canComplete).toBe(true),
  );
  const ready = await repo.getSession(session.sessionId);
  session = await send(repo, ready, {
    type: 'requestVoiceClarification',
    cursorId: ready.execution!.cursor!.cursorId,
    utterance,
  });
  return { repo, ready, session };
}
const resolveCommand = (session: ExperimentSession, choice: VoiceChoice): WorkflowCommand => ({
  type: 'resolveVoiceClarification',
  commandId: session.execution!.pendingVoice!.commandId,
  choice,
});
const meta = {
  now: new Date().toISOString(),
  requestId: 'resolution',
  eventId: 'event',
  evidenceId: 'evidence',
};

describe('S07 사용자 확인과 Mock 효과', () => {
  test.each<VoiceChoice>(['repeatGuidance', 'doNothing'])(
    '%s 선택 확정은 커서·측정·이전 근거를 유지하며 의도 확인만 기록한다',
    async (choice) => {
      const { repo, ready, session } = await setup();
      const command = resolveCommand(session, choice);
      const confirmed = await send(repo, session, command, 'confirm');
      expect(confirmed.sessionId).toBe(ready.sessionId);
      expect(confirmed.procedure).toEqual(ready.procedure);
      expect(confirmed.execution?.cursor).toEqual(ready.execution?.cursor);
      expect(confirmed.execution?.attempts).toEqual(ready.execution?.attempts);
      expect(confirmed.deviceChecks).toEqual(ready.deviceChecks);
      expect(confirmed.evidence.slice(0, ready.evidence.length)).toEqual(ready.evidence);
      expect(confirmed.evidence.at(-1)).toMatchObject({
        kind: 'human',
        source: 'mock',
        action: 'voiceClarificationConfirmed',
        voiceChoice: choice,
      });
      expect(confirmed.execution?.voiceResolutions).toHaveLength(1);
      expect(selectExecution(confirmed).canComplete).toBe(true);
      expect(selectExecution(confirmed).completedCount).toBe(0);
      expect(await send(repo, session, command, 'confirm')).toEqual(confirmed);
      expect(await send(repo, confirmed, command, 'another-key')).toEqual(confirmed);
      await expect(
        send(repo, confirmed, resolveCommand(session, 'remeasure'), 'changed-choice'),
      ).rejects.toMatchObject({ code: 'REQUEST_CONFLICT' });
    },
  );

  test('재측정은 같은 회차에서 새 응답만 요청하고 이전 기록을 보존하며 중복 실행하지 않는다', async () => {
    const sample = jest.fn<MockExecutionRunner>(async (input) => buildMockExecutionReport(input));
    const { repo, ready, session } = await setup('다시 해줘', sample);
    // pendingVoice 동안 시나리오 변경은 기존 S06 규칙으로 금지된다.
    expect(() => repo.setExecutionScenario(session.sessionId, 'normal')).toThrow();
    expect(sample).toHaveBeenCalledTimes(1);
    const command = resolveCommand(session, 'remeasure');
    const accepted = await send(repo, session, command, 'retry');
    expect(accepted.execution?.cursor).toEqual(ready.execution?.cursor);
    expect(accepted.execution?.attempts[0].status).toBe('superseded');
    expect(accepted.execution?.attempts[0].report).toEqual(ready.execution?.attempts[0].report);
    expect(accepted.execution?.attempts[1].status).toBe('sampling');
    expect(accepted.execution?.voiceResolutions?.[0].replacementAttemptId).toBe(
      accepted.execution?.attempts[1].attemptId,
    );
    expect(selectExecution(accepted).canComplete).toBe(false);
    await send(repo, session, command, 'retry');
    await waitFor(async () =>
      expect(selectExecution(await repo.getSession(session.sessionId)).canComplete).toBe(true),
    );
    const finished = await repo.getSession(session.sessionId);
    expect(selectExecution(finished).completedCount).toBe(0);
    expect(await send(repo, finished, command, 'new-key')).toEqual(finished);
    expect(sample).toHaveBeenCalledTimes(2);
    expect(finished.execution?.attempts).toHaveLength(2);
    expect(
      finished.events.filter((item) => item.type === 'voiceClarificationResolved'),
    ).toHaveLength(1);
    expect(finished.evidence.filter((item) => item.action === 'measurementConfirmed')).toHaveLength(
      0,
    );
  });

  test('취소는 선택 실행 없이 확인 이력만 남기고 이전 S06 상태를 보존한다', async () => {
    const { repo, ready, session } = await setup();
    const command: WorkflowCommand = {
      type: 'dismissVoiceClarification',
      commandId: session.execution!.pendingVoice!.commandId,
    };
    const cancelled = await send(repo, session, command);
    expect(cancelled.execution?.pendingVoice).toBeNull();
    expect(cancelled.execution?.attempts).toEqual(ready.execution?.attempts);
    expect(cancelled.execution?.cursor).toEqual(ready.execution?.cursor);
    expect(cancelled.evidence.at(-1)?.action).toBe('voiceClarificationCancelled');
    expect(await send(repo, cancelled, command, 'duplicate-cancel')).toEqual(cancelled);
  });

  test('재측정 응답이 실패해도 완료로 바꾸지 않고 실패 시도를 보존한다', async () => {
    let calls = 0;
    const { repo, session, ready } = await setup('다시 해줘', async (input) => {
      calls++;
      if (calls === 2) throw Error('Mock 통신 실패');
      return buildMockExecutionReport(input);
    });
    await send(repo, session, resolveCommand(session, 'remeasure'));
    await waitFor(async () =>
      expect(selectExecution(await repo.getSession(session.sessionId)).latest?.status).toBe(
        'error',
      ),
    );
    const failed = await repo.getSession(session.sessionId);
    expect(failed.execution?.cursor).toEqual(ready.execution?.cursor);
    expect(failed.execution?.attempts).toHaveLength(2);
    expect(selectExecution(failed)).toMatchObject({ canComplete: false, completedCount: 0 });
  });

  test.each([
    'cursorId',
    'stepId',
    'conditionId',
    'trialIndex',
    'sampleAttemptId',
    'source',
    'createdAt',
  ])('요청의 %s가 오래되거나 유효하지 않으면 확정은 거절하고 취소만 허용한다', async (field) => {
    const { session } = await setup();
    const snapshot = JSON.parse(JSON.stringify(session));
    const request = snapshot.execution.pendingVoice;
    if (field === 'sampleAttemptId') request.sampleAttemptId = 'old-sample';
    else if (field === 'source') request.source = 'api';
    else if (field === 'createdAt') request.createdAt = 'invalid';
    else request.cursor[field] = field === 'trialIndex' ? 99 : 'other';
    expect(selectVoiceClarification(snapshot).valid).toBe(false);
    expect(() =>
      resolveVoiceClarification(snapshot, request.commandId, 'doNothing', undefined, meta),
    ).toThrow();
    const cancelled = resolveVoiceClarification(
      snapshot,
      request.commandId,
      'cancel',
      undefined,
      meta,
    );
    expect(cancelled.execution?.cursor).toEqual(session.execution?.cursor);
    expect(cancelled.execution?.attempts).toEqual(session.execution?.attempts);
  });

  test('다른 요청 ID·세션·미점검 상태는 확인 조건을 우회하지 못한다', async () => {
    const { repo, session } = await setup();
    await expect(
      send(repo, session, {
        type: 'resolveVoiceClarification',
        commandId: 'wrong',
        choice: 'doNothing',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_STATE' });
    const other = await repo.createSession({
      requestId: 'other',
      operatorId: 'other',
      procedure: mockProcedure,
    });
    await expect(
      send(repo, other, resolveCommand(session, 'remeasure'), 'bypass'),
    ).rejects.toMatchObject({ code: 'INVALID_STATE' });
    expect((await repo.getSession(other.sessionId)).events).toEqual(other.events);
  });

  test('과거 요청의 중복 확인은 새 음성 요청을 지우지 않는다', async () => {
    const { repo, session } = await setup();
    const old = resolveCommand(session, 'doNothing');
    let current = await send(repo, session, old);
    current = await send(repo, current, {
      type: 'requestVoiceClarification',
      cursorId: current.execution!.cursor!.cursorId,
      utterance: '다시 해줘',
    });
    const pending = current.execution!.pendingVoice;
    current = await send(repo, current, old, 'old-confirmation');
    expect(current.execution?.pendingVoice).toEqual(pending);
    expect(current.execution?.voiceResolutions).toHaveLength(1);
  });
});

describe('S07 화면 입력과 요청 처리', () => {
  test('선택만으로 상태를 바꾸지 않고 확정한 뒤 복귀하며 재진입해도 재실행하지 않는다', async () => {
    const { repo, session, ready } = await setup();
    const onBack = jest.fn();
    const view = (
      <WorkflowProvider repository={repo}>
        <VoiceClarificationScreen sessionId={session.sessionId} onBack={onBack} />
      </WorkflowProvider>
    );
    const screen = await render(view);
    await screen.findByText('“다시 해줘”가\n어떤 뜻인가요?');
    expect(screen.getByText(/Mock 발화·선택 예시/)).toBeTruthy();
    expect(screen.getByRole('button', { name: '현재 작업으로 돌아가기' })).toBeDisabled();
    await fireEvent.press(screen.getByRole('button', { name: '아무것도 하지 않기' }));
    expect(await repo.getSession(session.sessionId)).toEqual(session);
    await fireEvent.press(screen.getByRole('button', { name: '현재 작업으로 돌아가기' }));
    await waitFor(() => expect(onBack).toHaveBeenCalledTimes(1));
    const confirmed = await repo.getSession(session.sessionId);
    expect(confirmed.execution?.attempts).toEqual(ready.execution?.attempts);
    await screen.unmount();
    const reopened = await render(view);
    await reopened.findByText('이미 처리한 음성 확인 요청입니다');
    expect(reopened.queryByRole('button', { name: /회차 다시 측정/ })).toBeNull();
    await fireEvent.press(reopened.getByRole('button', { name: '현재 작업으로 돌아가기' }));
    expect(await repo.getSession(session.sessionId)).toEqual(confirmed);
  });

  test('긴 발화와 처리 오류를 표시하고 재시도로 확정하며 중복 클릭을 막는다', async () => {
    const { repo, session } = await setup(
      '다시 확인해 주세요. 현재 조건과 회차는 유지하고 안내를 다시 들을지 측정을 다시 할지 확인해 주세요.',
    );
    let release!: () => void;
    const gate = new Promise<void>((done) => {
      release = done;
    });
    let fail = true;
    const commands = jest.fn<WorkflowRepository['executeCommand']>(async (id, command, context) => {
      if (fail) {
        fail = false;
        throw Error('Mock 확인 전송 오류: 선택과 현재 회차를 유지했습니다. 다시 요청해 주세요.');
      }
      await gate;
      return repo.executeCommand(id, command, context);
    });
    const adapter: WorkflowRepository = {
      createSession: (input) => repo.createSession(input),
      getSession: (id) => repo.getSession(id),
      subscribe: (id, listener) => repo.subscribe(id, listener),
      executeCommand: commands,
    };
    const onBack = jest.fn();
    const screen = await render(
      <WorkflowProvider repository={adapter}>
        <VoiceClarificationScreen sessionId={session.sessionId} onBack={onBack} />
      </WorkflowProvider>,
    );
    await screen.findByText(/다시 확인해 주세요/);
    await fireEvent.press(screen.getByRole('button', { name: '현재 안내를 다시 듣기' }));
    await fireEvent.press(screen.getByRole('button', { name: '현재 작업으로 돌아가기' }));
    await screen.findByText(/Mock 확인 전송 오류/);
    expect(onBack).not.toHaveBeenCalled();
    expect((await repo.getSession(session.sessionId)).execution?.pendingVoice).toEqual(
      session.execution?.pendingVoice,
    );
    await fireEvent.press(screen.getByRole('button', { name: '현재 작업으로 돌아가기' }));
    expect(screen.getByRole('button', { name: '현재 작업으로 돌아가기' })).toBeDisabled();
    await fireEvent.press(screen.getByRole('button', { name: '현재 작업으로 돌아가기' }));
    await act(async () => release());
    await waitFor(() => expect(onBack).toHaveBeenCalledTimes(1));
    expect(commands).toHaveBeenCalledTimes(2);
    expect((await repo.getSession(session.sessionId)).execution?.voiceResolutions).toHaveLength(1);
  });

  test('미점검 세션과 존재하지 않는 세션에서 확인 버튼을 제공하지 않는다', async () => {
    const repo = new MockWorkflowRepository();
    const session = await repo.createSession({
      requestId: 'empty',
      operatorId: 'researcher',
      procedure: mockProcedure,
    });
    const screen = await render(
      <WorkflowProvider repository={repo}>
        <VoiceClarificationScreen sessionId={session.sessionId} onBack={() => {}} />
      </WorkflowProvider>,
    );
    await screen.findByText('S05 점검·시작 요청이 필요합니다');
    expect(screen.queryByRole('button', { name: '현재 안내를 다시 듣기' })).toBeNull();
    await screen.rerender(
      <WorkflowProvider repository={repo}>
        <VoiceClarificationScreen key="missing" sessionId="missing" onBack={() => {}} />
      </WorkflowProvider>,
    );
    await screen.findByText(/세션을 찾을 수 없습니다/);
    expect(screen.queryByRole('button', { name: /회차 다시 측정/ })).toBeNull();
  });
});
