import type { DeviceDiagnosticsReport, DiagnosticIssue } from './device-check';
import { validateDiagnostics, selectDeviceCheck } from './device-check';
import type { ExperimentSession } from './models';

/** Mock 초안. 팀의 승인된 전체 단계 번호·안전 기준·API DTO를 뜻하지 않는다. */
export interface ExecutionDefinition {
  readonly provenance: 'mock-draft';
  readonly profileVersion: string;
  readonly settlingSeconds: number;
  readonly conditions: readonly {
    readonly id: string;
    readonly label: string;
    readonly repetitions: number;
  }[];
}

export interface ExecutionCursor {
  readonly cursorId: string;
  readonly stepId: string;
  readonly conditionId: string;
  readonly trialIndex: number;
}

export interface ExecutionSampleReport {
  readonly cursorId: string;
  readonly source: 'mock' | 'api';
  readonly stability: 'waiting' | 'stable';
  readonly diagnostics: DeviceDiagnosticsReport;
  readonly holdReason?: string;
}

export interface MeasurementAttempt {
  readonly attemptId: string;
  readonly cursor: ExecutionCursor;
  readonly status: 'sampling' | 'waiting' | 'ready' | 'held' | 'error' | 'superseded' | 'valid';
  readonly requestedAt: string;
  readonly receivedAt?: string;
  readonly confirmedAt?: string;
  readonly report?: ExecutionSampleReport;
  readonly issue?: DiagnosticIssue;
}

export interface PendingVoiceCommand {
  readonly commandId: string;
  readonly cursor: ExecutionCursor;
  readonly utterance: string;
  readonly createdAt: string;
  readonly source: 'mock' | 'api';
}

export interface ExecutionState {
  readonly cursor: ExecutionCursor | null;
  readonly attempts: readonly MeasurementAttempt[];
  readonly pendingVoice: PendingVoiceCommand | null;
}

export function validExecutionDefinition(definition: ExecutionDefinition | undefined) {
  return (
    !!definition &&
    definition.conditions.length > 0 &&
    definition.conditions.every(
      (item) =>
        !!item.id && !!item.label && Number.isInteger(item.repetitions) && item.repetitions > 0,
    ) &&
    new Set(definition.conditions.map((item) => item.id)).size === definition.conditions.length &&
    Number.isFinite(definition.settlingSeconds) &&
    definition.settlingSeconds >= 0
  );
}

export function executionSampleIssue(
  session: ExperimentSession,
  attempt: MeasurementAttempt,
): DiagnosticIssue | undefined {
  const report = attempt.report;
  if (
    !report ||
    report.cursorId !== attempt.cursor.cursorId ||
    report.source !== session.source ||
    report.diagnostics.source !== session.source
  ) {
    return {
      code: 'INVALID_SAMPLE',
      message: '현재 회차에 해당하는 응답과 데이터 출처가 필요합니다.',
    };
  }
  if (report.holdReason) return { code: 'HELD', message: report.holdReason };
  const issue = validateDiagnostics(session.procedure.deviceCheck, report.diagnostics);
  if (issue) return issue;
  if (report.stability !== 'stable')
    return {
      code: 'WAITING',
      message: '안정화 대기 상태입니다. 준비된 응답으로 다시 확인해 주세요.',
    };
  if (
    report.diagnostics.sensors.some((sensor) =>
      sensor.readings.some(
        (reading) => Date.parse(reading.observedAt) < Date.parse(attempt.requestedAt),
      ),
    )
  ) {
    return {
      code: 'STALE_SAMPLE',
      message: '현재 회차의 응답 요청보다 이전 측정값입니다. 새 응답을 확인해 주세요.',
    };
  }
}

export function selectExecution(session: ExperimentSession) {
  const definition = session.procedure.execution;
  const execution = session.execution;
  const authorized = selectDeviceCheck(session).executionStarted;
  const configured = validExecutionDefinition(definition);
  const cursor = execution?.cursor ?? null;
  const latest = execution?.attempts
    .slice()
    .reverse()
    .find((attempt) => attempt.cursor.cursorId === cursor?.cursorId);
  const valid = execution?.attempts.filter((attempt) => attempt.status === 'valid') ?? [];
  const total = definition?.conditions.reduce((sum, item) => sum + item.repetitions, 0) ?? 0;
  const completed = authorized && configured && !!execution && !cursor && valid.length === total;
  const sampling = latest?.status === 'sampling';
  const pendingVoice = execution?.pendingVoice ?? null;
  const reason = !authorized
    ? 'S05 점검·시작 요청이 필요합니다'
    : !configured || !execution
      ? '절차의 실행 정의가 없습니다. 담당자와 실행 계약을 확인해 주세요.'
      : completed
        ? 'Mock 반복 측정을 마쳤습니다. 종료 검토·장치 정리·제출은 후속 화면에서 진행합니다.'
        : pendingVoice
          ? '모호한 음성은 실행하지 않았습니다. S07 연결 안내에서 돌아와 주세요.'
          : sampling
            ? 'Mock 응답을 기다리고 있습니다. 완료 요청은 아직 할 수 없습니다.'
            : (latest?.issue?.message ??
              (latest?.status === 'ready'
                ? 'Mock 응답을 확인했습니다. 작업을 확인한 뒤 완료를 요청하세요.'
                : '현재 회차의 Mock 응답을 먼저 확인해 주세요.'));
  return {
    authorized,
    configured,
    cursor,
    latest,
    completed,
    sampling,
    pendingVoice,
    reason,
    completedCount: valid.length,
    total,
    percentage: total ? Math.round((valid.length / total) * 100) : 0,
    condition: definition?.conditions.find((item) => item.id === cursor?.conditionId),
    conditions:
      definition?.conditions.map((item) => ({
        label: item.label,
        value: `${valid.filter((attempt) => attempt.cursor.conditionId === item.id).length}/${item.repetitions}`,
      })) ?? [],
    currentIndex: definition?.conditions.findIndex((item) => item.id === cursor?.conditionId),
    canSample: authorized && configured && !!cursor && !sampling && !pendingVoice,
    canComplete:
      authorized &&
      configured &&
      !!cursor &&
      !pendingVoice &&
      latest?.status === 'ready' &&
      !executionSampleIssue(session, latest),
    canClarify: authorized && configured && !!cursor && !sampling && !pendingVoice,
  };
}
