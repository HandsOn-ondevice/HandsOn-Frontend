import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { getEdgeErrorMessage } from '@/lib/edgeApi';

import { loadExpertHome, type ExpertHomeData, type LoadExpertHome } from './expertHomeData';

export type ExpertHomeState =
  | { status: 'loading' }
  | { status: 'error'; detail?: string }
  | { status: 'ready'; data: ExpertHomeData };

export function useExpertHome(environmentId: string, loadHome: LoadExpertHome = loadExpertHome) {
  const [lookup, setLookup] = useState({
    environmentId,
    loadHome,
    state: { status: 'loading' } as ExpertHomeState,
  });
  const focused = useRef(false);
  const request = useRef(0);

  const refresh = useCallback(() => {
    if (!focused.current) return;
    const currentRequest = ++request.current;
    setLookup({ environmentId, loadHome, state: { status: 'loading' } });

    void Promise.resolve()
      .then(() => loadHome(environmentId))
      .then(
        (data) => {
          if (focused.current && request.current === currentRequest) {
            setLookup({ environmentId, loadHome, state: { status: 'ready', data } });
          }
        },
        (error: unknown) => {
          if (focused.current && request.current === currentRequest) {
            setLookup({
              environmentId,
              loadHome,
              state: { status: 'error', detail: getEdgeErrorMessage(error) },
            });
          }
        },
      );
  }, [environmentId, loadHome]);

  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      refresh();
      return () => {
        focused.current = false;
        request.current += 1;
      };
    }, [refresh]),
  );

  const state: ExpertHomeState =
    lookup.environmentId === environmentId && lookup.loadHome === loadHome
      ? lookup.state
      : { status: 'loading' };

  return { state, refresh };
}
