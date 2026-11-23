import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import { loadExpertHome, type ExpertHomeData, type LoadExpertHome } from './expertHomeData';

export type ExpertHomeState =
  { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: ExpertHomeData };

export function useExpertHome(
  environmentId: string,
  loadHome: LoadExpertHome = loadExpertHome,
  edgeToken?: string,
) {
  const [lookup, setLookup] = useState({
    environmentId,
    loadHome,
    edgeToken,
    state: { status: 'loading' } as ExpertHomeState,
  });
  const focused = useRef(false);
  const request = useRef(0);

  const refresh = useCallback(() => {
    if (!focused.current) return;
    const currentRequest = ++request.current;
    setLookup({ environmentId, loadHome, edgeToken, state: { status: 'loading' } });

    void Promise.resolve()
      .then(() => (edgeToken ? loadHome(environmentId, edgeToken) : loadHome(environmentId)))
      .then(
        (data) => {
          if (focused.current && request.current === currentRequest) {
            setLookup({ environmentId, loadHome, edgeToken, state: { status: 'ready', data } });
          }
        },
        () => {
          if (focused.current && request.current === currentRequest) {
            setLookup({ environmentId, loadHome, edgeToken, state: { status: 'error' } });
          }
        },
      );
  }, [edgeToken, environmentId, loadHome]);

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
    lookup.environmentId === environmentId &&
    lookup.loadHome === loadHome &&
    lookup.edgeToken === edgeToken
      ? lookup.state
      : { status: 'loading' };

  return { state, refresh };
}
