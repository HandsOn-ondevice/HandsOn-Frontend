import type { UserRole } from '@/design-system';
import { createEdgeApi, EdgeApiError } from '@/lib/edgeApi';

export interface WorkEnvironment {
  id: string;
  name: string;
  workType: string;
  deviceName: string;
  edgeEnvironmentId?: string;
}

export interface EdgeAccess {
  readonly baseUrl: string;
  readonly token?: string;
}

export interface EntrySelection {
  role: UserRole;
  environment: WorkEnvironment;
  edge?: EdgeAccess;
}

type EnvironmentRequest = {
  token?: string;
  signal?: AbortSignal;
};

export type LoadWorkEnvironments = (
  options?: EnvironmentRequest,
) => Promise<readonly WorkEnvironment[]>;

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

type EdgeWorkProfile = Omit<WorkEnvironment, 'edgeEnvironmentId'> & { environmentId?: string };

function isWorkEnvironment(value: unknown): value is EdgeWorkProfile {
  if (!value || typeof value !== 'object') return false;
  const { id, name, workType, deviceName, environmentId } = value as Partial<EdgeWorkProfile>;
  return [
    id,
    name,
    workType,
    deviceName,
    ...(environmentId === undefined ? [] : [environmentId]),
  ].every((field) => typeof field === 'string' && field.trim().length > 0);
}

export function getEntryEdgeBaseUrl() {
  const baseUrl = process.env.EXPO_PUBLIC_HANDSON_EDGE_BASE_URL?.trim();
  return process.env.EXPO_PUBLIC_HANDSON_MAESTRO === '1' ? undefined : baseUrl;
}

export const loadWorkEnvironments: LoadWorkEnvironments = async (options) => {
  const baseUrl = getEntryEdgeBaseUrl();
  if (process.env.EXPO_PUBLIC_HANDSON_MAESTRO === '1' || (__DEV__ && !baseUrl))
    return demoEnvironments;
  return loadEdgeWorkEnvironments({ baseUrl, ...options });
};

export async function loadEdgeWorkEnvironments({
  baseUrl,
  token,
  signal,
}: EnvironmentRequest & { baseUrl?: string }): Promise<readonly WorkEnvironment[]> {
  const edge = createEdgeApi({ baseUrl, token });
  const health = await edge.get('/system/health', signal);
  if ((health as { api?: unknown } | null)?.api !== 'alive') {
    throw new EdgeApiError({ kind: 'invalid-response' });
  }

  const profiles = await edge.get('/work-profiles', signal);
  if (!Array.isArray(profiles) || !profiles.every(isWorkEnvironment)) {
    throw new EdgeApiError({ kind: 'invalid-response' });
  }
  if (new Set(profiles.map(({ id }) => id)).size !== profiles.length) {
    throw new EdgeApiError({ kind: 'invalid-response' });
  }
  return profiles.map(({ id, name, workType, deviceName, environmentId }) => ({
    id,
    name,
    workType,
    deviceName,
    ...(environmentId && { edgeEnvironmentId: environmentId }),
  }));
}
