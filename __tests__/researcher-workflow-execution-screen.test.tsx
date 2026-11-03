import { describe, expect, jest, test } from '@jest/globals';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { MockWorkflowRepository } from '../src/features/researcher-workflow/infrastructure/mock/MockWorkflowRepository';
import { mockProcedure } from '../src/features/researcher-workflow/infrastructure/mock/fixtures';
import { buildMockDiagnostics } from '../src/features/researcher-workflow/infrastructure/mock/device-check-scenarios';
import {
  buildMockExecutionReport,
  type MockExecutionRunner,
} from '../src/features/researcher-workflow/infrastructure/mock/execution-scenarios';
import type { ExecutionSampleReport } from '../src/features/researcher-workflow/domain/execution';
import type { WorkflowCommand } from '../src/features/researcher-workflow/domain/models';
import { WorkflowProvider } from '../src/features/researcher-workflow/state/WorkflowProvider';
import { ExecutionScreen } from '../src/features/researcher-workflow/screens/ExecutionScreen';
import { VoiceClarificationConnectionScreen } from '../src/features/researcher-workflow/screens/VoiceClarificationConnectionScreen';

async function setup(
  sample: MockExecutionRunner = async (input) => buildMockExecutionReport(input),
) {
  const repository = new MockWorkflowRepository({
    inspect: async (input) => buildMockDiagnostics(input),
    sample,
  });
  let session = await repository.createSession({
    requestId: 'create',
    operatorId: 'researcher',
    procedure: mockProcedure,
  });
  const send = async (command: WorkflowCommand) => {
    session = await repository.executeCommand(session.sessionId, command, {
      requestId: `r-${session.revision}`,
      expectedRevision: session.revision,
    });
  };
  for (const check of mockProcedure.preparation.filter((item) => item.owner === 'operator')) {
    await send({ type: 'setPreparationCheck', checkId: check.id, checked: true });
  }
  await send({ type: 'completePreparation' });
  await send({ type: 'startDeviceCheck' });
  await waitFor(async () =>
    expect((await repository.getSession(session.sessionId)).phase).toBe('readyToExecute'),
  );
  session = await repository.getSession(session.sessionId);
  await send({ type: 'startExecution' });
  const onClarification = jest.fn();
  const view = () => (
    <WorkflowProvider repository={repository}>
      <ExecutionScreen
        sessionId={session.sessionId}
        onBack={() => {}}
        onClarification={onClarification}
      />
    </WorkflowProvider>
  );
  const screen = await render(view());
  await screen.findByText('유효 측정 0 / 15회');
  return { repository, session, screen, view, onClarification };
}

describe('S06 화면 조작과 재진입', () => {
  test('응답 확인 뒤 명시적 완료로 진행하고 재진입 시 이전 회차를 보존한다', async () => {
    const { repository, session, screen, view } = await setup();
    expect(screen.getByText('LED 출력 특성 측정')).toBeTruthy();
    expect((await repository.getSession(session.sessionId)).procedure).toEqual(mockProcedure);
    expect(screen.getByRole('button', { name: '완료 요청' })).toBeDisabled();
    await fireEvent.press(screen.getByRole('button', { name: '현재 회차 측정값 확인' }));
    await screen.findByLabelText(/BH1750 조도, 18.4, lx/);
    expect(screen.getByRole('button', { name: '완료 요청' })).toBeEnabled();
    expect((await repository.getSession(session.sessionId)).evidence).toEqual(session.evidence);
    await fireEvent.press(screen.getByRole('button', { name: '완료 요청' }));
    await screen.findByText('유효 측정 1 / 15회');
    expect(screen.getByText('0% 출력 · 2회차\n측정을 진행하세요')).toBeTruthy();
    expect(screen.getByRole('button', { name: '완료 요청' })).toBeDisabled();
    await screen.unmount();
    const reopened = await render(view());
    await reopened.findByText('유효 측정 1 / 15회');
    const restored = await repository.getSession(session.sessionId);
    expect(restored.sessionId).toBe(session.sessionId);
    expect(restored.procedure.version).toBe(session.procedure.version);
    expect(restored.events.filter((event) => event.type === 'executionStarted')).toHaveLength(1);
  });

  test('오래된 값은 진행을 차단하고 정상 재요청 뒤에만 완료 버튼을 활성화한다', async () => {
    const { screen, repository, session } = await setup();
    await fireEvent.press(screen.getByRole('button', { name: '더 보기' }));
    await fireEvent.press(screen.getByRole('button', { name: '미리보기 설정' }));
    await fireEvent.press(screen.getByRole('button', { name: '측정 응답 조건: 정상 응답' }));
    await fireEvent.press(screen.getByRole('radio', { name: '오래된 값 · 보류' }));
    await fireEvent.press(screen.getByRole('button', { name: '하단 시트 닫기' }));
    await fireEvent.press(screen.getByRole('button', { name: '현재 회차 측정값 확인' }));
    await waitFor(() => expect(screen.getAllByText(/이전 측정값/).length).toBeGreaterThan(0));
    expect(screen.getByRole('button', { name: '완료 요청' })).toBeDisabled();
    await fireEvent.press(screen.getByRole('button', { name: '더 보기' }));
    await fireEvent.press(screen.getByRole('button', { name: '미리보기 설정' }));
    await fireEvent.press(screen.getByRole('button', { name: '측정 응답 조건: 오래된 값 · 보류' }));
    await fireEvent.press(screen.getByRole('radio', { name: '정상 응답' }));
    await fireEvent.press(screen.getByRole('button', { name: '하단 시트 닫기' }));
    await fireEvent.press(screen.getByRole('button', { name: '현재 회차 측정값 확인' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '완료 요청' })).toBeEnabled());
    expect((await repository.getSession(session.sessionId)).execution?.attempts).toHaveLength(2);
  });

  test('응답 대기 중 화면을 이탈해도 완료를 허용하지 않고 지연 결과를 복원한다', async () => {
    let resolve!: (report: ExecutionSampleReport) => void;
    let input!: Parameters<MockExecutionRunner>[0];
    const gate = new Promise<ExecutionSampleReport>((done) => {
      resolve = done;
    });
    const { screen, view } = await setup(async (value) => {
      input = value;
      return gate;
    });
    await fireEvent.press(screen.getByRole('button', { name: '현재 회차 측정값 확인' }));
    await screen.findByText('측정값 확인 중');
    expect(screen.getByRole('button', { name: '완료 요청' })).toBeDisabled();
    await screen.unmount();
    const reopened = await render(view());
    await reopened.findByText('측정값 확인 중');
    await act(async () => resolve(buildMockExecutionReport(input)));
    await waitFor(() => expect(reopened.getByRole('button', { name: '완료 요청' })).toBeEnabled());
    expect(reopened.getByText('유효 측정 0 / 15회')).toBeTruthy();
  });

  test('모호한 음성 연결은 진행을 보존하고 명령 실행 없이 취소 복귀한다', async () => {
    const { screen, repository, session, onClarification, view } = await setup();
    await fireEvent.press(screen.getByRole('button', { name: '현재 회차 측정값 확인' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '완료 요청' })).toBeEnabled());
    const ready = await repository.getSession(session.sessionId);
    await fireEvent.press(screen.getByRole('button', { name: /^음성 명령 확인,/ }));
    await waitFor(() => expect(onClarification).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: '완료 요청' })).toBeDisabled();
    const onBack = jest.fn();
    await screen.rerender(
      <WorkflowProvider repository={repository}>
        <VoiceClarificationConnectionScreen sessionId={session.sessionId} onBack={onBack} />
      </WorkflowProvider>,
    );
    await screen.findByText('“다시 해줘”가\n어떤 뜻인가요?');
    await fireEvent.press(screen.getByRole('button', { name: '뒤로가기' }));
    await waitFor(() => expect(onBack).toHaveBeenCalledTimes(1));
    await screen.rerender(view());
    await waitFor(() => expect(screen.getByRole('button', { name: '완료 요청' })).toBeEnabled());
    const restored = await repository.getSession(session.sessionId);
    expect(restored.execution?.cursor).toEqual(ready.execution?.cursor);
    expect(restored.execution?.attempts).toEqual(ready.execution?.attempts);
    expect(restored.evidence.slice(0, ready.evidence.length)).toEqual(ready.evidence);
    expect(restored.evidence.at(-1)?.action).toBe('voiceClarificationCancelled');
    await fireEvent.press(screen.getByRole('button', { name: '안내 반복' }));
    expect(screen.getByText(/안내: /)).toBeTruthy();
  });

  test('15/15 완료 후 마지막 유효 응답과 근거를 보존하고 측정을 다시 시작하지 않는다', async () => {
    const { screen, repository, session, view } = await setup();
    await act(async () => {
      for (let count = 0; count < 15; count++) {
        let current = await repository.getSession(session.sessionId);
        const cursorId = current.execution!.cursor!.cursorId;
        await repository.executeCommand(
          current.sessionId,
          { type: 'requestExecutionSample', cursorId },
          { requestId: `finish-${current.revision}`, expectedRevision: current.revision },
        );
        await waitFor(async () =>
          expect(
            (await repository.getSession(session.sessionId)).execution!.attempts.at(-1)?.status,
          ).toBe('ready'),
        );
        current = await repository.getSession(session.sessionId);
        await repository.executeCommand(
          current.sessionId,
          {
            type: 'completeExecutionStep',
            cursorId,
            sampleAttemptId: current.execution!.attempts.at(-1)!.attemptId,
          },
          { requestId: `accept-${current.revision}`, expectedRevision: current.revision },
        );
      }
    });
    await screen.findByText('유효 측정 15 / 15회');
    expect(screen.getByRole('progressbar').props.accessibilityValue.now).toBe(100);
    expect(screen.getByText('마지막 유효 측정값 · 100% 조건 3회차')).toBeTruthy();
    expect(screen.getByLabelText(/BH1750 조도, 810, lx/)).toBeTruthy();
    expect(screen.queryByText('현재 회차 응답 없음')).toBeNull();
    expect(screen.getByRole('button', { name: '완료 요청' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '현재 회차 측정값 확인' })).toBeDisabled();
    const completed = await repository.getSession(session.sessionId);
    expect(completed.execution?.cursor).toBeNull();
    expect(
      completed.execution?.attempts.filter((attempt) => attempt.status === 'valid'),
    ).toHaveLength(15);
    const last = completed.execution!.attempts.at(-1)!;
    expect(
      completed.events.find(
        (event) => event.type === 'measurementAccepted' && event.attemptId === last.attemptId,
      )?.cursor,
    ).toEqual(last.cursor);
    await screen.unmount();
    const reopened = await render(view());
    await reopened.findByText('마지막 유효 측정값 · 100% 조건 3회차');
    expect(await repository.getSession(session.sessionId)).toEqual(completed);
  });
});
