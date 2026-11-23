import { useCallback } from 'react';
import { AppState, Platform } from 'react-native';
import { useFocusEffect } from 'expo-router';

const heartbeatIntervalMs = 10_000;

export function useEdgeExecutionHeartbeat(
  running: boolean,
  heartbeat: (signal?: AbortSignal) => Promise<void>,
) {
  useFocusEffect(
    useCallback(() => {
      if (!running) return;

      let timer: ReturnType<typeof setTimeout> | undefined;
      let activeRequest: AbortController | undefined;
      const visible = () =>
        AppState.currentState === 'active' &&
        (Platform.OS !== 'web' || document.visibilityState === 'visible');

      const stop = () => {
        clearTimeout(timer);
        activeRequest?.abort();
        activeRequest = undefined;
      };

      const send = async () => {
        if (!visible()) return;
        const request = new AbortController();
        activeRequest = request;
        // The server reports any disconnection and hold through the session read.
        await heartbeat(request.signal).catch(() => undefined);
        if (activeRequest === request && visible()) timer = setTimeout(send, heartbeatIntervalMs);
      };

      const update = () => {
        stop();
        if (visible()) void send();
      };

      const subscription = AppState.addEventListener('change', update);
      if (Platform.OS === 'web') document.addEventListener('visibilitychange', update);
      update();

      return () => {
        stop();
        subscription.remove();
        if (Platform.OS === 'web') document.removeEventListener('visibilitychange', update);
      };
    }, [running, heartbeat]),
  );
}
