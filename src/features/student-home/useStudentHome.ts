import { useCallback, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';

import type { WorkEnvironment } from '../entry/entryEnvironment';
import { loadStudentHome, type LoadStudentHome, type StudentHomeData } from './studentHomeData';

export type StudentHomeLookup =
  { status: 'loading' | 'error' } | { status: 'ready'; data: StudentHomeData };

interface HomeSnapshot {
  environment: WorkEnvironment;
  loadHome: LoadStudentHome;
  attempt: number;
  lookup: StudentHomeLookup;
}

export function useStudentHome(
  environment: WorkEnvironment,
  loadHome: LoadStudentHome = loadStudentHome,
) {
  const [attempt, setAttempt] = useState(0);
  const [snapshot, setSnapshot] = useState<HomeSnapshot>();

  useFocusEffect(
    useCallback(() => {
      let active = true;
      let requestNumber = 0;
      let appState = AppState.currentState;

      async function refresh() {
        const request = ++requestNumber;
        const setLookup = (lookup: StudentHomeLookup) => {
          if (active && request === requestNumber) {
            setSnapshot({ environment, loadHome, attempt, lookup });
          }
        };

        setLookup({ status: 'loading' });
        try {
          const data = await loadHome(environment);
          setLookup({ status: 'ready', data });
        } catch {
          setLookup({ status: 'error' });
        }
      }

      void refresh();
      const subscription = AppState.addEventListener('change', (nextState) => {
        if (nextState === 'active' && appState !== 'active') void refresh();
        appState = nextState;
      });

      return () => {
        active = false;
        subscription.remove();
      };
    }, [attempt, environment, loadHome]),
  );

  const reload = useCallback(() => setAttempt((previous) => previous + 1), []);
  const lookup: StudentHomeLookup =
    snapshot?.environment === environment &&
    snapshot.loadHome === loadHome &&
    snapshot.attempt === attempt
      ? snapshot.lookup
      : { status: 'loading' };

  return { lookup, reload };
}
