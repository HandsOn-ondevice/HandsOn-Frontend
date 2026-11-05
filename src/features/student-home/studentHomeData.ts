import type { WorkEnvironment } from '../entry/entryEnvironment';

export interface StudentHomeData {
  researcherName: string;
  deviceStatus: 'connected' | 'disconnected' | 'unknown';
  ongoingSession: {
    id: string;
    title: string;
    procedureVersion: string;
    environmentId: string;
    deviceId: string;
    status: 'running' | 'paused' | 'held';
    savedAtLabel: string;
    conditionProgress: number;
    completedCycles: number;
    totalCycles: number;
  } | null;
  approvedProcedures: readonly {
    id: string;
    title: string;
    version: string;
    equipmentLabel: string;
    stepCount: number;
  }[];
  recentResults: readonly {
    id: string;
    sessionId: string;
    title: string;
    completedAtLabel: string;
    status: 'complete' | 'submitted';
  }[];
}

export type LoadStudentHome = (environment: WorkEnvironment) => Promise<StudentHomeData>;

export const loadStudentHome: LoadStudentHome = async (environment) => {
  // Replace this loader when the home response and device/session API contracts are agreed.
  if (!__DEV__ && process.env.EXPO_PUBLIC_HANDSON_MAESTRO !== '1') {
    throw new Error('연구생 홈 조회가 아직 연결되지 않았습니다.');
  }

  if (environment.id === 'demo-circuits') {
    return {
      researcherName: '준혁',
      deviceStatus: 'unknown',
      ongoingSession: null,
      approvedProcedures: [],
      recentResults: [],
    };
  }

  return {
    researcherName: '준혁',
    deviceStatus: 'connected',
    ongoingSession: {
      id: 'demo-session-led-m03',
      title: 'LED 출력 단계별\n조도·소비전력 측정',
      procedureVersion: 'v1.2',
      environmentId: environment.id,
      deviceId: 'demo-orange-pi-5-plus',
      status: 'paused',
      savedAtLabel: '09:34',
      conditionProgress: 50,
      completedCycles: 2,
      totalCycles: 3,
    },
    approvedProcedures: [
      {
        id: 'demo-procedure-led-output',
        title: 'LED 출력 특성 측정',
        version: 'v1.2',
        equipmentLabel: 'LED-M03',
        stepCount: 16,
      },
    ],
    recentResults: [
      {
        id: 'demo-result-led-m02',
        sessionId: 'demo-session-led-m02',
        title: 'LED-M02 특성 측정',
        completedAtLabel: '어제 16:48',
        status: 'submitted',
      },
    ],
  };
};
