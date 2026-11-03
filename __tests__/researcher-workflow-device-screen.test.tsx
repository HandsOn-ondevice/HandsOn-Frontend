import { describe, expect, jest, test } from '@jest/globals';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import type { WorkflowRepository } from '../src/features/researcher-workflow/application/WorkflowRepository';
import type { DeviceDiagnosticsReport } from '../src/features/researcher-workflow/domain/device-check';
import { MockWorkflowRepository } from '../src/features/researcher-workflow/infrastructure/mock/MockWorkflowRepository';
import { mockProcedure } from '../src/features/researcher-workflow/infrastructure/mock/fixtures';
import {
  buildMockDiagnostics,
  type MockDiagnosticsRunner,
} from '../src/features/researcher-workflow/infrastructure/mock/device-check-scenarios';
import { DeviceCheckConnectionScreen } from '../src/features/researcher-workflow/screens/DeviceCheckConnectionScreen';
import { PreparationScreen } from '../src/features/researcher-workflow/screens/PreparationScreen';
import { ExecutionConnectionScreen } from '../src/features/researcher-workflow/screens/ExecutionConnectionScreen';
import { WorkflowProvider } from '../src/features/researcher-workflow/state/WorkflowProvider';

async function createReady(repository: MockWorkflowRepository) {
  let session = await repository.createSession({
    requestId: 'create',
    operatorId: 'researcher',
    procedure: mockProcedure,
  });
  for (const requirement of mockProcedure.preparation.filter((item) => item.owner === 'operator')) {
    session = await repository.executeCommand(
      session.sessionId,
      { type: 'setPreparationCheck', checkId: requirement.id, checked: true },
      { requestId: `check-${requirement.id}`, expectedRevision: session.revision },
    );
  }
  return repository.executeCommand(
    session.sessionId,
    { type: 'completePreparation' },
    { requestId: 'prepare', expectedRevision: session.revision },
  );
}
async function setup(
  inspect: MockDiagnosticsRunner = async (input) => buildMockDiagnostics(input),
) {
  const repository = new MockWorkflowRepository({ inspect });
  const session = await createReady(repository);
  const onExecution = jest.fn();
  const onBack = jest.fn();
  const view = () => (
    <WorkflowProvider repository={repository}>
      <DeviceCheckConnectionScreen
        sessionId={session.sessionId}
        onBack={onBack}
        onExecution={onExecution}
      />
    </WorkflowProvider>
  );
  const screen = await render(view());
  await screen.findByText('장치·센서 점검을 시작해 주세요');
  return { repository, session, onExecution, onBack, view, screen };
}

describe('S04~S06 장치 점검 화면 연결', () => {
  test('미점검 상태의 센서를 정상으로 표시하지 않고 시작을 차단한다', async () => {
    const { screen } = await setup();
    expect(screen.getByText('기기 미연결')).toBeTruthy();
    expect(screen.queryByText('Orange Pi 5+ 연결됨')).toBeNull();
    expect(screen.getAllByText('점검 전')).toHaveLength(3);
    expect(screen.getByRole('button', { name: '실험 측정 시작' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '장치·센서 점검 시작' })).toBeEnabled();
  });

  test('점검 중 이탈·재진입 후 같은 점검을 복원하고 성공 뒤 S06으로 이동한다', async () => {
    let resolve!: (report: DeviceDiagnosticsReport) => void;
    const gate = new Promise<DeviceDiagnosticsReport>((done) => {
      resolve = done;
    });
    const { screen, repository, session, onExecution, view } = await setup(async () => gate);
    await fireEvent.press(screen.getByRole('button', { name: '장치·센서 점검 시작' }));
    await screen.findByText('장치 연결 확인 중');
    expect(screen.getByRole('button', { name: '실험 측정 시작' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '장치·센서 점검 중' })).toBeDisabled();
    await screen.unmount();
    const reopened = await render(view());
    await reopened.findByText('장치 연결 확인 중');
    const attempt = (await repository.getSession(session.sessionId)).deviceChecks[0];
    await act(async () =>
      resolve(
        buildMockDiagnostics({
          definition: mockProcedure.deviceCheck!,
          scenario: 'normal',
          attemptId: attempt.attemptId,
          now: () => new Date().toISOString(),
        }),
      ),
    );
    await reopened.findByText('Mock 기기 연결됨');
    expect(reopened.getByRole('button', { name: '실험 측정 시작' })).toBeEnabled();
    await fireEvent.press(reopened.getByRole('button', { name: '실험 측정 시작' }));
    await waitFor(() => expect(onExecution).toHaveBeenCalledTimes(1));
    expect((await repository.getSession(session.sessionId)).phase).toBe('running');
    expect((await repository.getSession(session.sessionId)).deviceChecks).toHaveLength(1);
  });

  test('오류 문구와 미연결 상태를 표시하고 시나리오 선택 후 재시도한다', async () => {
    const { screen, repository, session } = await setup();
    await fireEvent.press(screen.getByRole('button', { name: '더 보기' }));
    await fireEvent.press(screen.getByRole('button', { name: '미리보기 설정' }));
    await fireEvent.press(screen.getByRole('button', { name: '점검 응답 조건: 정상 연결' }));
    await fireEvent.press(screen.getByRole('radio', { name: '센서 통신 오류' }));
    await fireEvent.press(screen.getByRole('button', { name: '하단 시트 닫기' }));
    await fireEvent.press(screen.getByRole('button', { name: '장치·센서 점검 시작' }));
    await screen.findByText('장치 연결 실패');
    expect(screen.getAllByText(/통신 응답을 확인하지 못했습니다/).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: '실험 측정 시작' })).toBeDisabled();
    await fireEvent.press(screen.getByRole('button', { name: '더 보기' }));
    await fireEvent.press(screen.getByRole('button', { name: '미리보기 설정' }));
    await fireEvent.press(screen.getByRole('button', { name: '점검 응답 조건: 센서 통신 오류' }));
    await fireEvent.press(screen.getByRole('radio', { name: '장치 미연결' }));
    await fireEvent.press(screen.getByRole('button', { name: '하단 시트 닫기' }));
    await fireEvent.press(screen.getByRole('button', { name: '장치·센서 다시 점검' }));
    await waitFor(async () =>
      expect((await repository.getSession(session.sessionId)).deviceChecks).toHaveLength(2),
    );
    expect(
      (
        await screen.findAllByText(
          '장치 연결을 확인하지 못했습니다. 연결 상태를 확인한 후 다시 점검해 주세요.',
        )
      ).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText('18.4 lx')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: '더 보기' }));
    await fireEvent.press(screen.getByRole('button', { name: '미리보기 설정' }));
    await fireEvent.press(screen.getByRole('button', { name: '점검 응답 조건: 장치 미연결' }));
    await fireEvent.press(screen.getByRole('radio', { name: '정상 연결' }));
    await fireEvent.press(screen.getByRole('button', { name: '하단 시트 닫기' }));
    await fireEvent.press(screen.getByRole('button', { name: '장치·센서 다시 점검' }));
    await screen.findByText('Mock 기기 연결됨');
    expect(screen.getByRole('button', { name: '실험 측정 시작' })).toBeEnabled();
    expect(
      (await repository.getSession(session.sessionId)).deviceChecks.map(
        (attempt) => attempt.status,
      ),
    ).toEqual(['failed', 'failed', 'passed']);
  });

  test('S05 성공 후 S04 복귀에서는 6/6과 시스템 근거를 표시한다', async () => {
    const { repository, session, screen } = await setup();
    await fireEvent.press(screen.getByRole('button', { name: '장치·센서 점검 시작' }));
    await screen.findByText('Mock 기기 연결됨');
    await screen.rerender(
      <WorkflowProvider repository={repository}>
        <PreparationScreen
          sessionId={session.sessionId}
          onBack={() => {}}
          onDeviceCheck={() => {}}
        />
      </WorkflowProvider>,
    );
    await screen.findByText('준비 진행도 · 6 / 6 항목 완료');
    expect(screen.getByRole('checkbox', { name: '전원·센서 통신 점검' })).toBeChecked();
    expect(screen.getByText(/통신 확인 기록/)).toBeTruthy();
    expect(
      (await repository.getSession(session.sessionId)).evidence.filter(
        (item) => item.kind === 'human',
      ),
    ).toHaveLength(5);
  });

  test('직접 S06 주소로 들어와도 미점검 세션을 완료로 표시하지 않는다', async () => {
    const repository = new MockWorkflowRepository();
    const session = await createReady(repository);
    const screen = await render(
      <WorkflowProvider repository={repository}>
        <ExecutionConnectionScreen
          sessionId={session.sessionId}
          onBack={() => {}}
          onClarification={() => {}}
        />
      </WorkflowProvider>,
    );
    await screen.findByText('장치 점검을 완료하고 실험을 시작해 주세요.');
    expect(screen.getByText('핵심 실행 화면')).toBeTruthy();
    expect(screen.getByRole('button', { name: '완료 요청' })).toBeDisabled();
  });

  test('Repository 교체 시 Mock 시나리오 컨트롤은 노출하지 않는다', async () => {
    const underlying = new MockWorkflowRepository();
    const session = await createReady(underlying);
    const repository: WorkflowRepository = {
      createSession: (input) => underlying.createSession(input),
      getSession: (id) => underlying.getSession(id),
      executeCommand: (id, command, context) => underlying.executeCommand(id, command, context),
      subscribe: (id, listener) => underlying.subscribe(id, listener),
    };
    const screen = await render(
      <WorkflowProvider repository={repository}>
        <DeviceCheckConnectionScreen
          sessionId={session.sessionId}
          onBack={() => {}}
          onExecution={() => {}}
        />
      </WorkflowProvider>,
    );
    await screen.findByText('장치·센서 점검을 시작해 주세요');
    await fireEvent.press(screen.getByRole('button', { name: '더 보기' }));
    expect(screen.queryByRole('button', { name: '미리보기 설정' })).toBeNull();
    expect(screen.queryByRole('button', { name: /점검 응답 조건/ })).toBeNull();
  });

  test('알 수 없는 세션은 오류와 재조회 버튼을 제공하고 진행하지 않는다', async () => {
    const repository = new MockWorkflowRepository();
    const screen = await render(
      <WorkflowProvider repository={repository}>
        <DeviceCheckConnectionScreen sessionId="missing" onBack={() => {}} onExecution={() => {}} />
      </WorkflowProvider>,
    );
    await screen.findByText(/실험 기록을 찾을 수 없습니다/);
    expect(screen.getByRole('button', { name: '점검 상태 다시 불러오기' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '실험 측정 시작' })).toBeDisabled();
  });

  test.each(['unit', 'value', 'time', 'duplicate'])(
    '원본 passed의 %s 검증 실패를 정상 카드나 성공 근거로 표시하지 않는다',
    async (variant) => {
      const { screen, repository, session } = await setup(async (input) => {
        const raw = JSON.parse(JSON.stringify(buildMockDiagnostics(input)));
        if (variant === 'unit') raw.sensors[0].readings[0].unit = 'V';
        if (variant === 'value') raw.sensors[0].readings[0].value = null;
        if (variant === 'time') raw.sensors[0].readings[0].observedAt = 'invalid';
        if (variant === 'duplicate') raw.sensors.push(raw.sensors[0]);
        return raw;
      });
      await fireEvent.press(screen.getByRole('button', { name: '장치·센서 점검 시작' }));
      await screen.findByText('장치 연결 실패');
      expect(screen.getByText('확인 필요')).toBeTruthy();
      expect(screen.queryByLabelText(/BH1750.*정상/)).toBeNull();
      expect(screen.getByRole('button', { name: '실험 측정 시작' })).toBeDisabled();
      const failed = await repository.getSession(session.sessionId);
      const attempt = failed.deviceChecks[0];
      expect(attempt.report?.sensors[0].status).toBe('passed');
      expect(attempt.validation?.sensors[0]).toMatchObject({ valid: false, status: 'error' });
      const evidence = failed.evidence.find(
        (item) => item.attemptId === attempt.attemptId && item.sensorId === 'bh1750',
      );
      expect(evidence).toMatchObject({
        action: 'deviceCheckFailed',
        source: 'mock',
        diagnosticValidation: attempt.validation?.sensors[0],
      });
      expect(evidence?.readings).toEqual(attempt.report?.sensors[0].readings);
      expect(
        failed.evidence.find(
          (item) => item.attemptId === attempt.attemptId && item.sensorId === 'ina219',
        ),
      ).toMatchObject({ action: 'deviceCheckPassed', diagnosticValidation: { valid: true } });
      expect(screen.queryAllByText(/Mock|시뮬레이션|테스트용/)).toHaveLength(0);
    },
  );
});
