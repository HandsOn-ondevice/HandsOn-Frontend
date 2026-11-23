import { listDemoProcedureReleases } from '@/features/procedure-draft/procedureDraftRepository';
import { demoLedProcedure } from '@/features/procedures/demoProcedures';
import type { WorkEnvironment } from '../entry/entryEnvironment';
import { EdgeApiError, getEdge, isEdgeDataEnabled } from '@/lib/edgeApi';
import type { ExperimentSession } from '@/features/researcher-workflow/domain/models';
import { selectExecution } from '@/features/researcher-workflow/domain/execution';
import { isMockWorkflowEnabled } from '@/features/researcher-workflow/infrastructure/mock/mock-environment';
import { developmentRepository } from '@/features/researcher-workflow/state/workflow-repository';

export interface StudentHomeData {
  dataOrigin?: 'simulation' | 'hardware';
  researcherName: string;
  deviceStatus: 'connected' | 'disconnected' | 'unknown';
  ongoingSession: {
    id: string;
    title: string;
    procedureVersion: string;
    environmentId: string;
    deviceId: string;
    status: 'preparing' | 'running' | 'paused' | 'held';
    phase?: ExperimentSession['phase'];
    savedAtLabel: string;
    conditionProgress: number;
    completedCycles: number;
    totalCycles: number;
  } | null;
  pendingSessions?: readonly { sessionId: string; phase: ExperimentSession['phase'] }[];
  approvedProcedures: readonly {
    id: string;
    title: string;
    version: string;
    equipmentLabel: string;
    stepCount?: number;
  }[];
  recentResults: readonly {
    id: string;
    sessionId: string;
    title: string;
    completedAtLabel: string;
    status: 'complete' | 'submitted';
  }[];
}

export type LoadStudentHome = (
  environment: WorkEnvironment,
  edgeToken?: string,
) => Promise<StudentHomeData>;

export const loadStudentHome: LoadStudentHome = async (environment, edgeToken) => {
  if (isEdgeDataEnabled()) {
    const data = await getEdge<StudentHomeData>(
      '/home/student',
      { environmentId: environment.id },
      edgeToken,
    );
    if (
      typeof data?.researcherName !== 'string' ||
      !Object.hasOwn(deviceStatuses, data.deviceStatus) ||
      !Array.isArray(data.approvedProcedures) ||
      !Array.isArray(data.recentResults) ||
      (data.pendingSessions !== undefined &&
        (!Array.isArray(data.pendingSessions) ||
          data.pendingSessions.some((session) => typeof session?.sessionId !== 'string'))) ||
      (data.ongoingSession !== null && data.ongoingSession?.environmentId !== environment.id)
    ) {
      throw new EdgeApiError({ kind: 'invalid-response' });
    }
    return data;
  }
  if (!isMockWorkflowEnabled()) {
    throw new Error('연구생 홈 조회가 아직 연결되지 않았습니다.');
  }

  const released = listDemoProcedureReleases(environment.id).map(({ procedure }) => ({
    id: procedure.id,
    title: procedure.title,
    version: procedure.approvedVersion,
    equipmentLabel: procedure.code,
    stepCount: procedure.stepCount ?? procedure.steps.length,
  }));

  if (environment.id === 'demo-circuits') {
    return {
      researcherName: '준혁',
      deviceStatus: 'unknown',
      ongoingSession: null,
      approvedProcedures: released,
      recentResults: [],
    };
  }

  const session = developmentRepository.getOngoingSession();
  return {
    researcherName: '준혁',
    deviceStatus: 'connected',
    ongoingSession: session ? toMockOngoingSession(environment.id, session) : null,
    approvedProcedures: released.some(({ id }) => id === demoLedProcedure.id)
      ? released
      : [
          ...released,
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

function toMockOngoingSession(
  environmentId: string,
  session: ExperimentSession,
): NonNullable<StudentHomeData['ongoingSession']> {
  const execution = selectExecution(session);
  const { phase, procedure } = session;
  const attempts = session.execution?.attempts ?? [];
  const lastConditionId = attempts.at(-1)?.cursor.conditionId;
  const condition =
    execution.condition ??
    procedure.execution?.conditions.find((item) => item.id === lastConditionId);
  let status: NonNullable<StudentHomeData['ongoingSession']>['status'] = 'running';
  if (phase === 'preparing' || phase === 'awaitingDeviceCheck' || phase === 'readyToExecute') {
    status = 'preparing';
  } else if (phase === 'paused') {
    status = 'paused';
  } else if (phase === 'held' || execution.requiresRecovery || execution.requiresRemeasurement) {
    status = 'held';
  }

  return {
    id: session.sessionId,
    title: procedure.title,
    procedureVersion: procedure.version.startsWith('v')
      ? procedure.version
      : `v${procedure.version}`,
    environmentId,
    deviceId: procedure.deviceCheck?.deviceId ?? procedure.deviceId,
    status,
    phase,
    savedAtLabel: new Date(session.updatedAt).toLocaleTimeString('ko-KR', {
      timeZone: 'Asia/Seoul',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }),
    conditionProgress: Number.parseFloat(condition?.label ?? '') || 0,
    completedCycles: attempts.filter(
      (attempt) => attempt.status === 'valid' && attempt.cursor.conditionId === condition?.id,
    ).length,
    totalCycles: condition?.repetitions ?? 0,
  };
}

const deviceStatuses = { connected: true, disconnected: true, unknown: true };
