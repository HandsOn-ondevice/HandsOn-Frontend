import { afterEach, expect, jest, test } from '@jest/globals';
import { renderHook } from '@testing-library/react-native';
import { useFocusEffect } from 'expo-router';
import { AppState, type AppStateStatus } from 'react-native';
import { useEdgeExecutionHeartbeat } from '@/features/researcher-workflow/screens/useEdgeExecutionHeartbeat';

jest.mock('expo-router', () => ({ useFocusEffect: jest.fn() }));

const originalAppState = AppState.currentState;

afterEach(() => {
  AppState.currentState = originalAppState;
  jest.clearAllMocks();
  jest.restoreAllMocks();
  jest.useRealTimers();
});

test('실행 화면이 보일 때만 heartbeat를 보내고 비활성화되면 중단한다', async () => {
  jest.useFakeTimers();
  AppState.currentState = 'active';
  const removeSubscription = jest.fn();
  let onAppStateChange: (state: AppStateStatus) => void = () => {};
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_, listener) => {
    onAppStateChange = listener;
    return { remove: removeSubscription };
  });
  const heartbeat = jest.fn<(signal?: AbortSignal) => Promise<void>>().mockResolvedValue(undefined);
  await renderHook(() => useEdgeExecutionHeartbeat(true, heartbeat));

  const leaveScreen = jest.mocked(useFocusEffect).mock.calls[0][0]();
  await jest.advanceTimersByTimeAsync(10_000);
  expect(heartbeat).toHaveBeenCalledTimes(2);

  AppState.currentState = 'background';
  onAppStateChange('background');
  expect(heartbeat.mock.calls.at(-1)?.[0]?.aborted).toBe(true);
  await jest.advanceTimersByTimeAsync(20_000);
  expect(heartbeat).toHaveBeenCalledTimes(2);

  AppState.currentState = 'active';
  onAppStateChange('active');
  expect(heartbeat).toHaveBeenCalledTimes(3);
  leaveScreen?.();
  expect(heartbeat.mock.calls.at(-1)?.[0]?.aborted).toBe(true);
  expect(removeSubscription).toHaveBeenCalledTimes(1);
  await jest.advanceTimersByTimeAsync(20_000);
  expect(heartbeat).toHaveBeenCalledTimes(3);
});
