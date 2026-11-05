import type { UserRole } from '@/design-system';

export interface WorkEnvironment {
  id: string;
  name: string;
  workType: string;
  deviceName: string;
}

export interface EntrySelection {
  role: UserRole;
  environment: WorkEnvironment;
}

export type LoadWorkEnvironments = () => Promise<readonly WorkEnvironment[]>;

const demoEnvironments: readonly WorkEnvironment[] = [
  {
    id: 'demo-embedded-iot',
    name: '지능형 임베디드·IoT 센서 연구실',
    workType: '특성 측정',
    deviceName: 'Orange Pi 5+',
  },
  {
    id: 'demo-circuits',
    name: '전자회로 실험실',
    workType: '회로 검증',
    deviceName: 'Orange Pi 5',
  },
];

export const loadWorkEnvironments: LoadWorkEnvironments = async () => {
  // Replace this loader when the environment and device API contract is agreed.
  if (__DEV__) return demoEnvironments;
  throw new Error('작업 환경 조회가 아직 연결되지 않았습니다.');
};
