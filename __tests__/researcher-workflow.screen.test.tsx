import { describe, expect, jest, test } from '@jest/globals';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Gallery } from '../src/dev/Gallery';
import type { WorkflowRepository } from '../src/features/researcher-workflow/application/WorkflowRepository';
import { MockWorkflowRepository } from '../src/features/researcher-workflow/infrastructure/mock/MockWorkflowRepository';
import { mockProcedure } from '../src/features/researcher-workflow/infrastructure/mock/fixtures';
import { DevelopmentEntryScreen } from '../src/features/researcher-workflow/screens/DevelopmentEntryScreen';
import { PreparationScreen } from '../src/features/researcher-workflow/screens/PreparationScreen';
import { DeviceCheckConnectionScreen } from '../src/features/researcher-workflow/screens/DeviceCheckConnectionScreen';
import { WorkflowProvider } from '../src/features/researcher-workflow/state/WorkflowProvider';

async function setup() {
  const repository = new MockWorkflowRepository({ now: () => '2026-11-02T00:42:00.000Z' });
  const session = await repository.createSession({
    requestId: 'create',
    operatorId: 'researcher',
    procedure: mockProcedure,
  });
  const onDeviceCheck = jest.fn();
  const screen = await render(
    <WorkflowProvider repository={repository}>
      <PreparationScreen
        sessionId={session.sessionId}
        onBack={() => {}}
        onDeviceCheck={onDeviceCheck}
      />
    </WorkflowProvider>,
  );
  await screen.findByText('준비 진행도 · 0 / 6 항목 완료');
  return { screen, repository, session, onDeviceCheck };
}

describe('S04 사용자 흐름', () => {
  test('화면을 나갔다 돌아와도 같은 Repository의 세션을 복원한다', async () => {
    const { screen, repository, session } = await setup();
    await fireEvent.press(screen.getByRole('checkbox', { name: '필수 준비물 7개 확인' }));
    await screen.findByText('준비 진행도 · 1 / 6 항목 완료');
    await screen.unmount();
    const reopened = await render(
      <WorkflowProvider repository={repository}>
        <PreparationScreen
          sessionId={session.sessionId}
          onBack={() => {}}
          onDeviceCheck={() => {}}
        />
      </WorkflowProvider>,
    );
    await reopened.findByText('준비 진행도 · 1 / 6 항목 완료');
    expect(reopened.getByRole('checkbox', { name: '필수 준비물 7개 확인' })).toBeChecked();
  });

  test('명령 실패를 표시하고 재조회한 상태에서 다시 조작할 수 있다', async () => {
    const underlying = new MockWorkflowRepository();
    const session = await underlying.createSession({
      requestId: 'create',
      operatorId: 'researcher',
      procedure: mockProcedure,
    });
    let failed = false;
    const repository: WorkflowRepository = {
      createSession: (input) => underlying.createSession(input),
      getSession: (id) => underlying.getSession(id),
      // API가 아직 구독 이벤트를 보내지 않아도 명령 응답을 화면에 반영해야 한다.
      subscribe: () => () => {},
      executeCommand: (id, command, context) => {
        if (!failed) {
          failed = true;
          return Promise.reject(new Error('명령 실패 시뮬레이션'));
        }
        return underlying.executeCommand(id, command, context);
      },
    };
    const screen = await render(
      <WorkflowProvider repository={repository}>
        <PreparationScreen
          sessionId={session.sessionId}
          onBack={() => {}}
          onDeviceCheck={() => {}}
        />
      </WorkflowProvider>,
    );
    await screen.findByText('준비 진행도 · 0 / 6 항목 완료');
    await fireEvent.press(screen.getByRole('checkbox', { name: '필수 준비물 7개 확인' }));
    await screen.findByText('명령 실패 시뮬레이션');
    expect(screen.getByRole('checkbox', { name: '필수 준비물 7개 확인' })).not.toBeChecked();
    await fireEvent.press(screen.getByRole('button', { name: '상태 다시 불러오기' }));
    await screen.findByText('준비 진행도 · 0 / 6 항목 완료');
    await fireEvent.press(screen.getByRole('checkbox', { name: '필수 준비물 7개 확인' }));
    await screen.findByText('준비 진행도 · 1 / 6 항목 완료');
  });

  test('Mock 표시·체크·해제·진행 차단·안내 시뮬레이션을 제공한다', async () => {
    const { screen, onDeviceCheck } = await setup();
    expect(screen.getByText('Mock 환경 · 실제 장비·음성 연동 없음')).toBeTruthy();
    expect(screen.getByRole('button', { name: '확인 완료' })).toBeDisabled();
    const materials = screen.getByRole('checkbox', { name: '필수 준비물 7개 확인' });
    await fireEvent.press(materials);
    await screen.findByText('준비 진행도 · 1 / 6 항목 완료');
    expect(screen.getByRole('progressbar').props.accessibilityValue.now).toBe(17);
    expect(screen.getByRole('checkbox', { name: '필수 준비물 7개 확인' })).toBeChecked();
    await fireEvent.press(screen.getByRole('checkbox', { name: '필수 준비물 7개 확인' }));
    await screen.findByText('준비 진행도 · 0 / 6 항목 완료');
    await fireEvent.press(screen.getByRole('button', { name: '확인 완료' }));
    expect(onDeviceCheck).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: '안내 다시 듣기' }));
    expect(screen.getByText(/안내 재생 시뮬레이션 · 실제 TTS/)).toBeTruthy();
  });

  test('작업자 확인 5개 뒤 통신 점검을 남긴 채 연결 지점으로 진행한다', async () => {
    const { screen, repository, session, onDeviceCheck } = await setup();
    expect(screen.getByRole('checkbox', { name: '전원·센서 통신 점검' })).toBeDisabled();
    for (const item of mockProcedure.preparation.filter((item) => item.owner === 'operator')) {
      await fireEvent.press(screen.getByRole('checkbox', { name: item.title }));
      await waitFor(() => expect(screen.getByRole('checkbox', { name: item.title })).toBeChecked());
    }
    await screen.findByText('준비 진행도 · 5 / 6 항목 완료');
    expect(screen.getByRole('button', { name: '확인 완료' })).toBeEnabled();
    await fireEvent.press(screen.getByRole('button', { name: '확인 완료' }));
    await waitFor(() => expect(onDeviceCheck).toHaveBeenCalledTimes(1));
    expect((await repository.getSession(session.sessionId)).phase).toBe('awaitingDeviceCheck');
  });

  test('조회 실패에서 재조회할 수 있고 로딩 중 진행은 차단된다', async () => {
    const underlying = new MockWorkflowRepository();
    const session = await underlying.createSession({
      requestId: 'create',
      operatorId: 'researcher',
      procedure: mockProcedure,
    });
    let attempts = 0;
    const repository: WorkflowRepository = {
      createSession: (input) => underlying.createSession(input),
      getSession: async (id) => {
        if (++attempts === 1) throw new Error('조회 실패 시뮬레이션');
        return underlying.getSession(id);
      },
      executeCommand: (id, command, context) => underlying.executeCommand(id, command, context),
      subscribe: (id, listener) => underlying.subscribe(id, listener),
    };
    const screen = await render(
      <WorkflowProvider repository={repository}>
        <PreparationScreen
          sessionId={session.sessionId}
          onBack={() => {}}
          onDeviceCheck={() => {}}
        />
      </WorkflowProvider>,
    );
    await screen.findByText('조회 실패 시뮬레이션');
    expect(screen.getByRole('button', { name: '확인 완료' })).toBeDisabled();
    await fireEvent.press(screen.getByRole('button', { name: '상태 다시 불러오기' }));
    await screen.findByText('준비 진행도 · 0 / 6 항목 완료');
  });

  test('새 실험과 Figma 2/6 상태는 독립된 세션이다', async () => {
    const repository = new MockWorkflowRepository();
    const opened: string[] = [];
    const screen = await render(
      <WorkflowProvider repository={repository}>
        <DevelopmentEntryScreen onOpen={(id) => opened.push(id)} />
      </WorkflowProvider>,
    );
    await fireEvent.press(screen.getByRole('button', { name: '새 Mock 실험 준비 시작' }));
    await waitFor(() => expect(opened).toHaveLength(1));
    expect(
      (await repository.getSession(opened[0])).checks.filter((item) => item.checked),
    ).toHaveLength(0);
    await fireEvent.press(screen.getByRole('button', { name: 'Figma 검증용 2/6 상태 열기' }));
    await waitFor(() => expect(opened).toHaveLength(2));
    expect(
      (await repository.getSession(opened[1])).checks.filter((item) => item.checked),
    ).toHaveLength(2);
    expect(opened[0]).not.toBe(opened[1]);
  });

  test('S05 안내는 직접 진입해도 통신 완료로 표시하지 않는다', async () => {
    const repo = new MockWorkflowRepository();
    const session = await repo.createSession({
      requestId: 'create',
      operatorId: 'researcher',
      procedure: mockProcedure,
    });
    const screen = await render(
      <WorkflowProvider repository={repo}>
        <DeviceCheckConnectionScreen
          sessionId={session.sessionId}
          onBack={() => {}}
          onExecution={() => {}}
        />
      </WorkflowProvider>,
    );
    await screen.findByText('S04 준비 확인이 필요합니다');
    expect(screen.getByRole('button', { name: '실험 측정 시작' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '장치·센서 점검 시작' })).toBeDisabled();
    expect(screen.getByText('Mock 환경 · 실제 장비 연결·측정 아님')).toBeTruthy();
  });

  test('기존 갤러리에서 S06 예제를 열고 돌아올 수 있다', async () => {
    const screen = await render(<Gallery />);
    await fireEvent.press(screen.getByRole('button', { name: 'S06 조합 예제 보기' }));
    expect(screen.getByText('핵심 실행 화면')).toBeTruthy();
    expect(screen.getByText(/가상의 합성 데이터/)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: '뒤로가기' }));
    expect(screen.getByText('컴포넌트 갤러리')).toBeTruthy();
  });
});
