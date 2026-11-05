import { expect, jest, test } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react-native';

import { RecordingView, type RecordingViewProps } from '../src/features/recording/RecordingView';

function props(overrides: Partial<RecordingViewProps> = {}): RecordingViewProps {
  return {
    status: 'idle',
    durationMs: 0,
    metering: [],
    title: 'LED 출력 측정',
    onTitleChange: jest.fn(),
    environmentName: 'IoT 연구실',
    onStart: jest.fn(),
    onPause: jest.fn(),
    onResume: jest.fn(),
    onFinish: jest.fn(),
    onBack: jest.fn(),
    onSettings: jest.fn(),
    onHelp: jest.fn(),
    ...overrides,
  };
}

test('빈 절차 이름으로는 녹음을 시작하지 않는다', async () => {
  const callbacks = props({ title: '   ' });
  const screen = await render(<RecordingView {...callbacks} />);
  const start = screen.getByRole('button', { name: '녹음 시작' });
  expect(start).toBeDisabled();
  await fireEvent.press(start);
  expect(callbacks.onStart).not.toHaveBeenCalled();
});

test('일시정지 화면은 원본 시간을 유지하고 재개와 종료 조작을 전달한다', async () => {
  const callbacks = props({ status: 'paused', durationMs: 138000, metering: [-50, -10, -35] });
  const screen = await render(<RecordingView {...callbacks} />);
  expect(screen.getByLabelText('녹음 시간 02:18')).toBeVisible();
  expect(screen.getByText('녹음을 일시정지했어요')).toBeVisible();
  expect(screen.getByLabelText('절차 이름')).toBeDisabled();
  await fireEvent.press(screen.getByRole('button', { name: '녹음 재개' }));
  await fireEvent.press(screen.getByRole('button', { name: '녹음 종료' }));
  expect(callbacks.onResume).toHaveBeenCalledTimes(1);
  expect(callbacks.onFinish).toHaveBeenCalledTimes(1);
  expect(callbacks.onPause).not.toHaveBeenCalled();
});

test('저장 중에는 재개와 중복 종료를 막는다', async () => {
  const callbacks = props({ status: 'saving', durationMs: 4000 });
  const screen = await render(<RecordingView {...callbacks} />);
  const pause = screen.getByRole('button', { name: '일시정지' });
  const finish = screen.getByRole('button', { name: '녹음 종료' });
  expect(pause).toBeDisabled();
  expect(finish).toBeDisabled();
  await fireEvent.press(pause);
  await fireEvent.press(finish);
  expect(callbacks.onPause).not.toHaveBeenCalled();
  expect(callbacks.onFinish).not.toHaveBeenCalled();
});

test('다시 요청할 수 없는 권한 거부는 설정으로 안내한다', async () => {
  const callbacks = props({ status: 'permissionDenied', canAskAgain: false });
  const screen = await render(<RecordingView {...callbacks} />);
  expect(screen.getByText('마이크 권한이 필요해요')).toBeVisible();
  expect(screen.queryByRole('button', { name: '녹음 시작' })).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: '설정 열기' }));
  expect(callbacks.onSettings).toHaveBeenCalledTimes(1);
  expect(callbacks.onStart).not.toHaveBeenCalled();
});
