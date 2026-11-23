import type { UserRole } from '@/design-system';
import { createEdgeApi, EdgeApiError, getEdgeBaseUrl } from '@/lib/edgeApi';

export interface WorkEnvironment {
  id: string;
  name: string;
  workType: string;
  deviceName: string;
}

export interface EntrySelection {
  role: UserRole;
  environment: WorkEnvironment;
  edgeToken?: string;
}

export type LoadWorkEnvironments = (options?: {
  token?: string;
  signal?: AbortSignal;
}) => Promise<readonly WorkEnvironment[]>;

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

function isEnvironment(value: unknown): value is WorkEnvironment {
  if (!value || typeof value !== 'object') return false;
  const { id, name, workType, deviceName } = value as Partial<WorkEnvironment>;
  return [id, name, workType, deviceName].every(
    (field) => typeof field === 'string' && field.trim() !== '',
  );
}

export const loadWorkEnvironments: LoadWorkEnvironments = async ({ token, signal } = {}) => {
  const baseUrl = getEdgeBaseUrl();
  if (baseUrl) {
    const response = await createEdgeApi({ baseUrl, token }).get('/environments', signal);
    if (!Array.isArray(response) || !response.every(isEnvironment)) {
      throw new EdgeApiError({ kind: 'invalid-response' });
    }
    return response.map(({ id, name, workType, deviceName }) => ({
      id,
      name,
      workType,
      deviceName,
    }));
  }
  if (__DEV__ || process.env.EXPO_PUBLIC_HANDSON_MAESTRO === '1') return demoEnvironments;
  throw new EdgeApiError({ kind: 'configuration' });
};
