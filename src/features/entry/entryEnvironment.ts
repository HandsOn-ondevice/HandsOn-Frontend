import type { UserRole } from '@/design-system';
import { createEdgeApi, EdgeApiError } from '@/lib/edgeApi';

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

type EdgeWorkProfile = WorkEnvironment & { environmentId: string; profileVersion: string };

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

function isWorkEnvironment(value: unknown): value is WorkEnvironment {
  if (!value || typeof value !== 'object') return false;
  const { id, name, workType, deviceName } = value as Partial<WorkEnvironment>;
  return [id, name, workType, deviceName].every(
    (field) => typeof field === 'string' && field.trim().length > 0,
  );
}

function isEdgeWorkProfile(value: unknown): value is EdgeWorkProfile {
  if (!isWorkEnvironment(value)) return false;
  const { environmentId, profileVersion } = value as Partial<EdgeWorkProfile>;
  return [environmentId, profileVersion].every(
    (field) => typeof field === 'string' && field.trim().length > 0,
  );
}

export const loadWorkEnvironments: LoadWorkEnvironments = async (options) => {
  const baseUrl = process.env.EXPO_PUBLIC_HANDSON_EDGE_BASE_URL?.trim();
  if (process.env.EXPO_PUBLIC_HANDSON_MAESTRO === '1' || (__DEV__ && !baseUrl)) {
    return demoEnvironments;
  }
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
  if (!Array.isArray(profiles) || !profiles.every(isEdgeWorkProfile)) {
    throw new EdgeApiError({ kind: 'invalid-response' });
  }
  if (new Set(profiles.map(({ id }) => id)).size !== profiles.length) {
    throw new EdgeApiError({ kind: 'invalid-response' });
  }

  const environments = await edge.get('/environments', signal);
  if (!Array.isArray(environments) || !environments.every(isWorkEnvironment)) {
    throw new EdgeApiError({ kind: 'invalid-response' });
  }
  if (new Set(environments.map(({ id }) => id)).size !== environments.length) {
    throw new EdgeApiError({ kind: 'invalid-response' });
  }

  // Edge v0.1.0 accepts this work profile for session creation and kit-lab for drafts.
  const profile = profiles.find(
    ({ id, environmentId }) => id === kitWorkProfileId && environmentId === kitEnvironmentId,
  );
  const environment = environments.find(({ id }) => id === kitEnvironmentId);
  if (!profile || !environment) return [];
  const { id, name, workType, deviceName } = environment;
  return [
    {
      id,
      name,
      workType,
      deviceName,
      workProfile: { id: profile.id, version: profile.profileVersion },
    },
  ];
}
