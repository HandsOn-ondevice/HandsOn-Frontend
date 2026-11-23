import type { UserRole } from '@/design-system';
import { EdgeApiError, getEdge, isEdgeDataEnabled } from '@/lib/edgeApi';

const kitEnvironmentId = 'kit-lab';
const kitWorkProfileId = 'kit-distance-v1';

export interface WorkEnvironment {
  id: string;
  name: string;
  workType: string;
  deviceName: string;
  workProfile?: { id: string; version: string };
}

export interface EntrySelection {
  role: UserRole;
  environment: WorkEnvironment;
  edgeToken?: string;
}

export type LoadWorkEnvironments = (token?: string) => Promise<readonly WorkEnvironment[]>;

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

export const loadWorkEnvironments: LoadWorkEnvironments = async (token) => {
  if (isEdgeDataEnabled()) {
    const [environments, profiles] = await Promise.all([
      getEdge<readonly WorkEnvironment[]>('/environments', undefined, token),
      getEdge<readonly { id: string; profileVersion: string; environmentId: string }[]>(
        '/work-profiles',
        undefined,
        token,
      ),
    ]);
    if (!Array.isArray(environments) || !Array.isArray(profiles)) {
      throw new EdgeApiError('invalid-response');
    }
    // Edge v0.1.0 restricts session creation to this work profile and draft creation to kit-lab.
    const environment = environments.find(({ id }) => id === kitEnvironmentId);
    const profile = profiles.find(
      ({ id, environmentId }) => id === kitWorkProfileId && environmentId === kitEnvironmentId,
    );
    return environment && profile
      ? [{ ...environment, workProfile: { id: profile.id, version: profile.profileVersion } }]
      : [];
  }
  if (__DEV__ || process.env.EXPO_PUBLIC_HANDSON_MAESTRO === '1') return demoEnvironments;
  throw new Error('작업 환경 조회가 아직 연결되지 않았습니다.');
};
