import { describe, expect, jest, test } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react-native';
import { AppText } from '../src/design-system';
import type { WorkflowRepository } from '../src/features/researcher-workflow/application/WorkflowRepository';
import { MockWorkflowRepository } from '../src/features/researcher-workflow/infrastructure/mock/MockWorkflowRepository';
import { mockProcedure } from '../src/features/researcher-workflow/infrastructure/mock/fixtures';
import { PreviewTools } from '../src/features/researcher-workflow/screens/PreviewTools';
import { MockDeviceScenarioControl } from '../src/features/researcher-workflow/screens/MockDeviceScenarioControl';
import { WorkflowProvider } from '../src/features/researcher-workflow/state/WorkflowProvider';

const environment = globalThis as unknown as { __DEV__: boolean };

describe('연구자 워크플로 실행 환경 경계', () => {
  test('배포 환경에서는 기본 Repository와 명시적으로 주입한 Mock 실행을 차단한다', async () => {
    const repository = new MockWorkflowRepository();
    const session = await repository.createSession({
      requestId: 'create',
      operatorId: 'researcher',
      procedure: mockProcedure,
    });
    const previous = __DEV__;
    environment.__DEV__ = false;
    try {
      await expect(
        repository.createSession({
          requestId: 'blocked',
          operatorId: 'researcher',
          procedure: mockProcedure,
        }),
      ).rejects.toMatchObject({ code: 'INVALID_STATE' });
      await expect(repository.getSession(session.sessionId)).rejects.toMatchObject({
        code: 'INVALID_STATE',
      });
      await expect(
        repository.executeCommand(
          session.sessionId,
          { type: 'completePreparation' },
          { requestId: 'blocked', expectedRevision: session.revision },
        ),
      ).rejects.toMatchObject({ code: 'INVALID_STATE' });
      expect(() => repository.subscribe(session.sessionId, () => {})).toThrow(
        '장치 서비스가 준비되지 않아',
      );
      const screen = await render(
        <WorkflowProvider>
          <AppText>작업 화면</AppText>
        </WorkflowProvider>,
      );
      expect(screen.getByText('실험 서비스를 준비하고 있습니다.')).toBeTruthy();
      expect(screen.queryByText('작업 화면')).toBeNull();
      await screen.rerender(
        <WorkflowProvider repository={repository}>
          <AppText>작업 화면</AppText>
        </WorkflowProvider>,
      );
      expect(screen.queryByText('작업 화면')).toBeNull();
      expect(screen.queryAllByText(/Mock|시뮬레이션|테스트용/)).toHaveLength(0);
      await screen.unmount();
    } finally {
      environment.__DEV__ = previous;
    }
  });

  test('배포 환경의 실제 Repository 주입은 차단하지 않는다', async () => {
    const repository: WorkflowRepository = {
      createSession: jest.fn<WorkflowRepository['createSession']>(),
      getSession: jest.fn<WorkflowRepository['getSession']>(),
      executeCommand: jest.fn<WorkflowRepository['executeCommand']>(),
      subscribe: () => () => {},
    };
    const previous = __DEV__;
    environment.__DEV__ = false;
    try {
      const screen = await render(
        <WorkflowProvider repository={repository}>
          <AppText>작업 화면</AppText>
        </WorkflowProvider>,
      );
      expect(screen.getByText('작업 화면')).toBeTruthy();
      await screen.unmount();
    } finally {
      environment.__DEV__ = previous;
    }
  });

  test('하단 시트 포털은 feature Context 밖에서도 전달받은 제어기로 동작한다', async () => {
    const controls = new MockWorkflowRepository();
    const session = await controls.createSession({
      requestId: 'preview',
      operatorId: 'researcher',
      procedure: mockProcedure,
    });
    const screen = await render(
      <PreviewTools available>
        <MockDeviceScenarioControl
          controls={controls}
          sessionId={session.sessionId}
          disabled={false}
        />
      </PreviewTools>,
    );
    expect(screen.queryByRole('button', { name: '점검 응답 조건: 정상 연결' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: '미리보기 설정' }));
    await fireEvent.press(screen.getByRole('button', { name: '점검 응답 조건: 정상 연결' }));
    await fireEvent.press(screen.getByRole('radio', { name: '센서 통신 오류' }));
    expect(controls.getDeviceCheckScenario(session.sessionId)).toBe('sensorError');
    expect(screen.queryAllByText(/Mock|시뮬레이션|테스트용/)).toHaveLength(0);
  });
});
