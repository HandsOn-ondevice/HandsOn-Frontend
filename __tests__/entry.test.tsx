import { expect, jest, test } from '@jest/globals';
import { act, fireEvent, render } from '@testing-library/react-native';

import { EntryScreen } from '../src/features/entry/EntryScreen';
import type { LoadWorkEnvironments, WorkEnvironment } from '../src/features/entry/entryEnvironment';

const environment: WorkEnvironment = {
  id: 'iot-lab',
  name: 'IoT 연구실',
  workType: '특성 측정',
  deviceName: 'Orange Pi 5+',
};

test('작업 환경과 역할을 모두 선택해야 선택값을 전달한다', async () => {
  const onContinue = jest.fn();
  const loadEnvironments: LoadWorkEnvironments = async () => [environment];
  const screen = await render(
    <EntryScreen onContinue={onContinue} loadEnvironments={loadEnvironments} />,
  );
  const action = () => screen.getByRole('button', { name: '설정하고 계속' });
  expect(action()).toBeDisabled();

  await fireEvent.press(screen.getByRole('button', { name: '연구실: 연구실을 선택해 주세요' }));
  await fireEvent.press(screen.getByRole('radio', { name: environment.name }));
  expect(screen.getByText('실행 장치 · Orange Pi 5+')).toBeVisible();
  await fireEvent.press(action());
  expect(onContinue).not.toHaveBeenCalled();

  await fireEvent.press(screen.getByRole('radio', { name: /^신규 연구생/ }));
  await fireEvent.press(action());
  expect(onContinue).toHaveBeenCalledWith({ role: 'student', environment });
});

test('조회 실패와 재시도 중에는 진행을 막고 성공 후 환경 선택을 받는다', async () => {
  const onContinue = jest.fn();
  const { promise: retryResult, resolve: resolveRetry } =
    Promise.withResolvers<readonly WorkEnvironment[]>();
  const loadEnvironments = jest
    .fn<LoadWorkEnvironments>()
    .mockRejectedValueOnce(new Error('조회 실패'))
    .mockReturnValueOnce(retryResult);
  const screen = await render(
    <EntryScreen onContinue={onContinue} loadEnvironments={loadEnvironments} />,
  );
  const action = () => screen.getByRole('button', { name: '설정하고 계속' });

  await fireEvent.press(screen.getByRole('radio', { name: /^숙련 연구생/ }));
  expect(screen.getByText('작업 환경을 불러오지 못했어요.')).toBeVisible();
  expect(action()).toBeDisabled();
  await fireEvent.press(action());
  expect(onContinue).not.toHaveBeenCalled();

  await fireEvent.press(screen.getByRole('button', { name: '다시 시도' }));
  expect(screen.getByText('작업 환경을 불러오는 중')).toBeVisible();
  expect(action()).toBeDisabled();
  await act(async () => resolveRetry([environment]));
  expect(screen.queryByText('작업 환경을 불러오지 못했어요.')).toBeNull();
  expect(action()).toBeDisabled();
  expect(loadEnvironments).toHaveBeenCalledTimes(2);

  await fireEvent.press(screen.getByRole('button', { name: '연구실: 연구실을 선택해 주세요' }));
  await fireEvent.press(screen.getByRole('radio', { name: environment.name }));
  await fireEvent.press(action());
  expect(onContinue).toHaveBeenCalledWith({ role: 'expert', environment });
});
