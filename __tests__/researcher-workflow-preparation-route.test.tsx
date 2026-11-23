import { beforeEach, expect, jest, test } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';
import PreparationRoute from '../src/app/researcher-workflow/[sessionId]/preparation';
import { MockWorkflowRepository } from '../src/features/researcher-workflow/infrastructure/mock/MockWorkflowRepository';
import { WorkflowProvider } from '../src/features/researcher-workflow/state/WorkflowProvider';
import { loadWorkEnvironments } from '../src/features/entry/entryEnvironment';
import { loadStudentHome } from '../src/features/student-home/studentHomeData';
import { getStudentHomeDestination } from '../src/features/student-home/studentHomeRoutes';
import { StudentHomeScreen } from '../src/features/student-home/StudentHomeScreen';

jest.mock('expo-router', () => ({
  useLocalSearchParams: jest.fn(() => ({ sessionId: 'demo-session-led-m03' })),
  router: {
    canGoBack: jest.fn(() => false),
    back: jest.fn(),
    replace: jest.fn(),
    push: jest.fn(),
    dismissTo: jest.fn(),
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useLocalSearchParams).mockReturnValue({ sessionId: 'demo-session-led-m03' });
});

test('S01의 이어하기 ID로 S04 준비 체크를 열고 기존 세션을 보존하며 S05로 이동한다', async () => {
  const [environment] = await loadWorkEnvironments();
  const home = await loadStudentHome(environment);
  const onNavigate = jest.fn();
  const screen = await render(
    <StudentHomeScreen
      environment={environment}
      lookup={{ status: 'ready', data: home }}
      onReload={() => {}}
      onNavigate={onNavigate}
      onChangeEnvironment={() => {}}
    />,
  );
  await fireEvent.press(screen.getByRole('button', { name: '이어서 진행' }));
  expect(onNavigate).toHaveBeenCalledWith({ type: 'resume', sessionId: home.ongoingSession!.id });
  const destination = getStudentHomeDestination({
    type: 'resume',
    sessionId: home.ongoingSession!.id,
  });
  expect(destination).toEqual({
    pathname: '/researcher-workflow/[sessionId]/preparation',
    params: { sessionId: 'demo-session-led-m03' },
  });
  const repository = new MockWorkflowRepository();
  const getSession = jest.spyOn(repository, 'getSession');
  const createSession = jest.spyOn(repository, 'createSession');
  await screen.rerender(
    <WorkflowProvider repository={repository}>
      <PreparationRoute />
    </WorkflowProvider>,
  );

  await screen.findByText('준비 진행도 · 0 / 6 항목 완료');
  expect(getSession).toHaveBeenCalledWith(home.ongoingSession!.id);
  expect(screen.queryByText('실험 세션을 찾을 수 없습니다')).toBeNull();
  expect(screen.getByRole('button', { name: '확인 완료' })).toBeDisabled();
  for (const name of [
    '필수 준비물 7개 확인',
    '장치 ID LED-M03 확인',
    '전원 차단 확인',
    '센서 배선 연결',
    'LED와 BH1750 거리 20cm',
  ]) {
    await fireEvent.press(screen.getByRole('checkbox', { name }));
  }
  await screen.findByText('준비 진행도 · 5 / 6 항목 완료');
  await fireEvent.press(screen.getByRole('button', { name: '확인 완료' }));
  expect(router.push).toHaveBeenCalledWith({
    pathname: '/researcher-workflow/[sessionId]/device-check',
    params: { sessionId: 'demo-session-led-m03' },
  });
  expect((await repository.getSession(home.ongoingSession!.id)).phase).toBe('awaitingDeviceCheck');
  expect(createSession).not.toHaveBeenCalled();
});

test('실제로 없는 ID는 명시적으로 연구생 홈으로 돌아가며 대체 세션을 만들지 않는다', async () => {
  jest.mocked(useLocalSearchParams).mockReturnValue({ sessionId: 'missing-session' });
  const repository = new MockWorkflowRepository();
  const getSession = jest.spyOn(repository, 'getSession');
  const createSession = jest.spyOn(repository, 'createSession');
  const screen = await render(
    <WorkflowProvider repository={repository}>
      <PreparationRoute />
    </WorkflowProvider>,
  );

  await screen.findByText('실험 세션을 찾을 수 없습니다');
  expect(getSession).toHaveBeenCalledWith('missing-session');
  await fireEvent.press(screen.getByRole('button', { name: '연구생 홈으로' }));
  expect(router.dismissTo).toHaveBeenCalledTimes(1);
  expect(router.dismissTo).toHaveBeenCalledWith('/student');
  expect(router.push).not.toHaveBeenCalled();
  expect(createSession).not.toHaveBeenCalled();
});
