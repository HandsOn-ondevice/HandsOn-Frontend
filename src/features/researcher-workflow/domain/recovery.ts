import type { DiagnosticIssue } from './device-check';
import {
  executionSampleIssue,
  selectExecution,
  type ExecutionCursor,
  type MeasurementAttempt,
} from './execution';
import type { ExperimentSession } from './models';

export interface RecoveryAttempt {
  readonly recoveryId: string;
  readonly blockedAttemptId: string;
  readonly sampleAttemptId: string;
  readonly cursor: ExecutionCursor;
  readonly requestedAt: string;
  readonly completedAt?: string;
  readonly status: 'checking' | 'failed' | 'recovered';
  readonly issue?: DiagnosticIssue;
}

/** TTL 없이 현재 복구 요청과 응답의 식별자·시각·진단 형식만 검사한다. */
export function recoverySampleIssue(
  session: ExperimentSession,
  attempt: MeasurementAttempt,
  receivedAt: string,
): DiagnosticIssue | undefined {
  const report = attempt.report;
  if (report?.attemptId !== attempt.attemptId)
    return { code: 'RECOVERY_ATTEMPT_MISMATCH', message: '현재 재확인 요청과 다른 응답입니다.' };
  const start = Date.parse(attempt.requestedAt);
  const end = Date.parse(receivedAt);
  const times = [
    report.diagnostics.checkedAt,
    ...report.diagnostics.sensors.flatMap((sensor) => [
      sensor.checkedAt,
      ...sensor.readings.map((reading) => reading.observedAt),
    ]),
  ];
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    end < start ||
    times.some(
      (time) =>
        !Number.isFinite(Date.parse(time)) || Date.parse(time) < start || Date.parse(time) > end,
    )
  )
    return { code: 'INVALID_RECOVERY_TIME', message: '현재 재확인 기간의 새 응답이 필요합니다.' };
  return executionSampleIssue(session, attempt);
}

export function selectRecovery(session: ExperimentSession) {
  const state = selectExecution(session);
  const latestRecovery =
    state.recovery &&
    state.recovery.cursor.cursorId === state.cursor?.cursorId &&
    (state.recovery.status !== 'recovered' ||
      state.recovery.sampleAttemptId === state.latest?.attemptId)
      ? state.recovery
      : undefined;
  const blocked =
    session.execution?.attempts.find(
      (attempt) => attempt.attemptId === latestRecovery?.blockedAttemptId,
    ) ?? (state.requiresRecovery ? state.latest : undefined);
  const checking = latestRecovery?.status === 'checking';
  const recovered =
    latestRecovery?.status === 'recovered' &&
    state.latest?.attemptId === latestRecovery.sampleAttemptId &&
    state.canComplete;
  const attempt = latestRecovery ? state.latest : blocked;
  const sensor =
    attempt?.report?.diagnostics.sensors.find((item) => item.status !== 'passed' || item.issue) ??
    attempt?.report?.diagnostics.sensors.find((item) => item.sensorId === 'bh1750');
  const requirement = session.procedure.deviceCheck?.sensors.find(
    (item) => item.sensorId === sensor?.sensorId,
  );
  return {
    ...state,
    blocked,
    checking,
    recovered,
    attempt,
    sensor,
    requirement,
    available: !!blocked && state.authorized && !!state.cursor,
    failed: latestRecovery?.status === 'failed',
    title: checking
      ? '새 센서 응답을 확인하고 있습니다'
      : recovered
        ? '새 센서값이 수신되었습니다'
        : latestRecovery?.status === 'failed'
          ? '센서 상태를 다시 확인해 주세요'
          : sensor?.status === 'stale'
            ? `${requirement?.metrics[0]?.label ?? requirement?.title ?? ''} 센서 값이\n오래되었습니다`
            : '센서 오류로 작업을 보류했습니다',
  };
}
