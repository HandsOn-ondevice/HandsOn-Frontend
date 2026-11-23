import { expect, jest, test } from '@jest/globals';
import { act, fireEvent, render } from '@testing-library/react-native';

import { EntryScreen } from '../src/features/entry/EntryScreen';
import type { LoadWorkEnvironments, WorkEnvironment } from '../src/features/entry/entryEnvironment';
import * as edgeApi from '../src/lib/edgeApi';
import { EdgeApiError } from '../src/lib/edgeApi';

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
  expect(screen.getByText(`프로필 ID · ${environment.id}`)).toBeVisible();
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

test('인증 재시도에 성공한 토큰을 선택한 역할에 전달한다', async () => {
  const edgeEnabled = jest.spyOn(edgeApi, 'isEdgeDataEnabled').mockReturnValue(true);
  try {
    const onContinue = jest.fn();
    const loadEnvironments = jest
      .fn<LoadWorkEnvironments>()
      .mockRejectedValueOnce(
        new EdgeApiError({ kind: 'server', status: 401, code: 'UNAUTHORIZED' }),
      )
      .mockRejectedValueOnce(new EdgeApiError({ kind: 'network' }))
      .mockResolvedValueOnce([environment]);
    const screen = await render(
      <EntryScreen onContinue={onContinue} loadEnvironments={loadEnvironments} />,
    );
    const retry = () => screen.getByRole('button', { name: '다시 시도' });
    const environmentButton = () =>
      screen.getByRole('button', { name: '연구실: 연구실을 선택해 주세요' });

    await fireEvent.press(screen.getByRole('radio', { name: /^숙련 연구생/ }));
    await fireEvent.changeText(screen.getByLabelText('Edge 접속 토큰'), 'wrong-token');
    await fireEvent.press(screen.getByRole('button', { name: '작업 환경 불러오기' }));

    expect(await screen.findByText('Edge 서버 인증을 확인해 주세요.')).toBeVisible();
    expect(screen.getByText('HTTP 401 · UNAUTHORIZED')).toBeVisible();
    expect(retry()).toBeDisabled();
    const tokenField = screen.getByLabelText('Edge 접속 토큰');
    expect(tokenField).toHaveProp('secureTextEntry', true);
    await fireEvent.changeText(tokenField, ' test-token ');
    await fireEvent.press(retry());

    expect(await screen.findByText('Edge 서버에 연결할 수 없어요.')).toBeVisible();
    expect(screen.queryByLabelText('Edge 접속 토큰')).toBeNull();
    expect(screen.queryByText('HTTP 401 · UNAUTHORIZED')).toBeNull();
    await fireEvent.press(retry());

    expect(environmentButton()).toBeEnabled();
    expect(loadEnvironments.mock.calls.map(([options]) => options?.token)).toEqual([
      'wrong-token',
      'test-token',
      'test-token',
    ]);
    expect(loadEnvironments.mock.calls[0][0]?.signal?.aborted).toBe(true);
    await fireEvent.press(environmentButton());
    await fireEvent.press(screen.getByRole('radio', { name: environment.name }));
    await fireEvent.press(screen.getByRole('button', { name: '설정하고 계속' }));
    expect(onContinue).toHaveBeenCalledWith({
      role: 'expert',
      environment,
      edgeToken: 'test-token',
    });
  } finally {
    edgeEnabled.mockRestore();
  }
});

test('인증 이외 HTTP 오류는 토큰 입력 없이 응답 상태와 오류 코드를 안내한다', async () => {
  const screen = await render(
    <EntryScreen
      onContinue={jest.fn()}
      loadEnvironments={async () => {
        throw new EdgeApiError({ kind: 'server', status: 503, code: 'SERVICE_UNAVAILABLE' });
      }}
    />,
  );

  expect(await screen.findByText('Edge 서버에서 작업 환경을 조회하지 못했어요.')).toBeVisible();
  expect(screen.getByText('HTTP 503 · SERVICE_UNAVAILABLE')).toBeVisible();
  expect(screen.queryByLabelText('Edge 접속 토큰')).toBeNull();
  expect(screen.getByRole('button', { name: '다시 시도' })).toBeEnabled();
});

test('Edge 역할을 바꾸면 이전 환경 조회를 취소하고 새 역할의 토큰을 전달한다', async () => {
  const edgeEnabled = jest.spyOn(edgeApi, 'isEdgeDataEnabled').mockReturnValue(true);
  try {
    const first = Promise.withResolvers<readonly WorkEnvironment[]>();
    const loadEnvironments = jest
      .fn<LoadWorkEnvironments>()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce([environment]);
    const onContinue = jest.fn();
    const screen = await render(
      <EntryScreen onContinue={onContinue} loadEnvironments={loadEnvironments} />,
    );
    const submitToken = async (token: string) => {
      await fireEvent.changeText(screen.getByLabelText('Edge 접속 토큰'), token);
      await fireEvent.press(screen.getByRole('button', { name: '작업 환경 불러오기' }));
    };

    await fireEvent.press(screen.getByRole('radio', { name: /^신규 연구생/ }));
    await submitToken('student-token');
    await fireEvent.press(screen.getByRole('radio', { name: /^숙련 연구생/ }));
    expect(loadEnvironments.mock.calls[0][0]?.signal?.aborted).toBe(true);
    await act(async () => first.resolve([environment]));
    expect(screen.getByRole('button', { name: '설정하고 계속' })).toBeDisabled();

    await submitToken('expert-token');
    await fireEvent.press(screen.getByRole('button', { name: '연구실: 연구실을 선택해 주세요' }));
    await fireEvent.press(screen.getByRole('radio', { name: environment.name }));
    await fireEvent.press(screen.getByRole('button', { name: '설정하고 계속' }));
    expect(loadEnvironments.mock.calls.map(([options]) => options?.token)).toEqual([
      'student-token',
      'expert-token',
    ]);
    expect(onContinue).toHaveBeenCalledWith({
      role: 'expert',
      environment,
      edgeToken: 'expert-token',
    });
  } finally {
    edgeEnabled.mockRestore();
  }
});
