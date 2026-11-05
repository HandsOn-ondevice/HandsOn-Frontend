import { expect, jest, test } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react-native';

import type { WorkEnvironment } from '../src/features/entry/entryEnvironment';
import { StudentHomeScreen } from '../src/features/student-home/StudentHomeScreen';
import { loadStudentHome } from '../src/features/student-home/studentHomeData';

const environment: WorkEnvironment = {
  id: 'demo-embedded-iot',
  name: 'IoT 연구실',
  workType: '특성 측정',
  deviceName: 'Orange Pi 5+',
};

function callbacks() {
  return {
    onReload: jest.fn(),
    onNavigate: jest.fn(),
    onChangeEnvironment: jest.fn(),
  };
}

test('진행 중인 세션의 식별자만 이어하기에 전달하고 고정된 설정은 변경하지 않는다', async () => {
  const data = await loadStudentHome(environment);
  data.ongoingSession = {
    ...data.ongoingSession!,
    id: 'session-fixed',
    procedureVersion: 'v1.0',
    environmentId: 'original-lab',
    deviceId: 'original-device',
  };
  const originalSession = { ...data.ongoingSession };
  const actions = callbacks();
  const screen = await render(
    <StudentHomeScreen environment={environment} lookup={{ status: 'ready', data }} {...actions} />,
  );

  expect(screen.getByText('실험을 이어갈까요?')).toBeVisible();
  expect(screen.getByText('일시정지 · 09:34 저장\n50% 조건 · 2 / 3회차')).toBeVisible();
  await fireEvent.press(screen.getByRole('button', { name: '이어서 진행' }));
  expect(actions.onNavigate).toHaveBeenCalledWith({ type: 'resume', sessionId: 'session-fixed' });
  expect(data.ongoingSession).toEqual(originalSession);
});

test('진행 중 작업과 목록이 없으면 새 실험 안내와 빈 목록을 표시한다', async () => {
  const data = await loadStudentHome({ ...environment, id: 'demo-circuits' });
  const actions = callbacks();
  const screen = await render(
    <StudentHomeScreen environment={environment} lookup={{ status: 'ready', data }} {...actions} />,
  );

  expect(screen.queryByRole('button', { name: '이어서 진행' })).toBeNull();
  expect(screen.getByText('새 실험을 시작할까요?')).toBeVisible();
  expect(screen.getByText('승인된 절차가 없어요.')).toBeVisible();
  expect(screen.getByText('아직 완료한 실험이 없어요.')).toBeVisible();
  expect(screen.getByText('장치 확인 필요')).toBeVisible();
  await fireEvent.press(screen.getByRole('button', { name: '승인 절차 선택' }));
  expect(actions.onNavigate).toHaveBeenCalledWith({
    type: 'procedures',
    environmentId: environment.id,
  });
});

test('로딩과 조회 실패를 구분하며 재시도를 요청한다', async () => {
  const actions = callbacks();
  const screen = await render(
    <StudentHomeScreen environment={environment} lookup={{ status: 'loading' }} {...actions} />,
  );
  expect(screen.getByText('홈을 불러오는 중')).toBeVisible();
  expect(screen.queryByRole('button', { name: '이어서 진행' })).toBeNull();

  await screen.rerender(
    <StudentHomeScreen environment={environment} lookup={{ status: 'error' }} {...actions} />,
  );
  expect(screen.getByText('홈을 불러오지 못했어요.')).toBeVisible();
  await fireEvent.press(screen.getByRole('button', { name: '다시 시도' }));
  expect(actions.onReload).toHaveBeenCalledTimes(1);
  await fireEvent.press(screen.getByRole('button', { name: '승인 절차 선택' }));
  expect(actions.onNavigate).toHaveBeenCalledWith({
    type: 'procedures',
    environmentId: environment.id,
  });
});

test('최근 결과의 식별자를 유지하고 하단 내비게이션을 각 진입으로 연결한다', async () => {
  const data = await loadStudentHome(environment);
  const result = data.recentResults[0];
  const actions = callbacks();
  const screen = await render(
    <StudentHomeScreen environment={environment} lookup={{ status: 'ready', data }} {...actions} />,
  );
  await fireEvent.press(screen.getByRole('button', { name: `${result.title}, 결과 보기` }));
  expect(actions.onNavigate).toHaveBeenLastCalledWith({
    type: 'result',
    resultId: result.id,
    sessionId: result.sessionId,
  });

  await fireEvent.press(screen.getByRole('tab', { name: '실험' }));
  expect(actions.onNavigate).toHaveBeenLastCalledWith({
    type: 'procedures',
    environmentId: environment.id,
  });
  await fireEvent.press(screen.getByRole('tab', { name: '장치' }));
  expect(actions.onNavigate).toHaveBeenLastCalledWith({ type: 'devices' });
  await fireEvent.press(screen.getByRole('tab', { name: '이력' }));
  expect(actions.onNavigate).toHaveBeenLastCalledWith({ type: 'history' });
  await fireEvent.press(screen.getByRole('tab', { name: '홈' }));
  expect(actions.onReload).toHaveBeenCalledTimes(1);
});

test('프로필에서 선택한 환경을 확인하고 환경 선택 화면으로 돌아간다', async () => {
  const actions = callbacks();
  const screen = await render(
    <StudentHomeScreen environment={environment} lookup={{ status: 'loading' }} {...actions} />,
  );
  await fireEvent.press(screen.getByRole('button', { name: '프로필' }));
  expect(screen.getByText('특성 측정 · Orange Pi 5+')).toBeVisible();
  await fireEvent.press(screen.getByRole('button', { name: '뒤로가기' }));
  expect(actions.onChangeEnvironment).toHaveBeenCalledTimes(1);
});
