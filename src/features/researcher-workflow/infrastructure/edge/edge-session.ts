import type { DeviceCheckAttempt } from '../../domain/device-check';
import type { ExecutionCursor, ExecutionDefinition } from '../../domain/execution';
import { WorkflowError, type ExperimentSession } from '../../domain/models';
import { cleanupRequirements } from '../../domain/completion';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isList(value: unknown, check: (item: unknown) => boolean) {
  return Array.isArray(value) && value.every(check);
}

function isIssue(value: unknown) {
  return isRecord(value) && isText(value.code) && isText(value.message);
}

function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function isDiagnostics(value: unknown) {
  return (
    isRecord(value) &&
    isText(value.deviceId) &&
    isTimestamp(value.checkedAt) &&
    value.source === 'api' &&
    isList(
      value.sensors,
      (sensor) =>
        isRecord(sensor) &&
        isText(sensor.sensorId) &&
        isText(sensor.status) &&
        isList(
          sensor.readings,
          (reading) =>
            isRecord(reading) &&
            isText(reading.metricId) &&
            (reading.value === null || Number.isFinite(reading.value)) &&
            isText(reading.unit) &&
            isTimestamp(reading.observedAt) &&
            reading.source === 'api',
        ) &&
        (sensor.issue == null || isIssue(sensor.issue)),
    )
  );
}

function isCheckAttempt(value: unknown): value is DeviceCheckAttempt {
  if (
    !isRecord(value) ||
    !isText(value.attemptId) ||
    !isText(value.startedAt) ||
    (value.status !== 'checking' && value.status !== 'passed' && value.status !== 'failed') ||
    (value.issue !== undefined && !isIssue(value.issue))
  ) {
    return false;
  }
  if (value.status === 'checking') return value.report === undefined;
  return (
    isText(value.completedAt) &&
    // A failed asynchronous job can end before the device produces a report.
    ((value.report === undefined && value.status === 'failed') || isDiagnostics(value.report))
  );
}

function isExecutionDefinition(value: unknown): value is ExecutionDefinition {
  return (
    isRecord(value) &&
    value.provenance === 'approved' &&
    isText(value.profileVersion) &&
    typeof value.settlingSeconds === 'number' &&
    isList(
      value.conditions,
      (condition) =>
        isRecord(condition) &&
        isText(condition.id) &&
        isText(condition.label) &&
        typeof condition.repetitions === 'number',
    )
  );
}

function isCursor(value: unknown): value is ExecutionCursor {
  return (
    isRecord(value) &&
    isText(value.cursorId) &&
    isText(value.stepId) &&
    isText(value.conditionId) &&
    Number.isInteger(value.trialIndex) &&
    Number(value.trialIndex) > 0
  );
}

function isMeasurementAttempt(value: unknown) {
  if (
    !isRecord(value) ||
    !isText(value.attemptId) ||
    !isCursor(value.cursor) ||
    !isTimestamp(value.requestedAt) ||
    !['sampling', 'waiting', 'ready', 'held', 'error', 'superseded', 'valid'].includes(
      String(value.status),
    ) ||
    (value.issue != null && !isIssue(value.issue))
  ) {
    return false;
  }

  if (value.status === 'valid' && !isTimestamp(value.confirmedAt)) return false;
  const report = value.report;
  if (report == null) return value.status !== 'ready' && value.status !== 'valid';

  return (
    isTimestamp(value.receivedAt) &&
    isRecord(report) &&
    report.attemptId === value.attemptId &&
    report.cursorId === value.cursor.cursorId &&
    report.source === 'api' &&
    (report.stability === 'stable' || report.stability === 'waiting') &&
    isDiagnostics(report.diagnostics)
  );
}

function isCleanupAttempt(value: unknown, dataOrigin: unknown) {
  if (
    !isRecord(value) ||
    !isText(value.attemptId) ||
    !isTimestamp(value.requestedAt) ||
    !isTimestamp(value.completedAt) ||
    !isTimestamp(value.validUntil) ||
    !isText(value.bootId) ||
    !isText(value.evidenceId) ||
    !isRecord(value.response) ||
    value.response.dataOrigin !== dataOrigin ||
    typeof value.response.success !== 'boolean' ||
    !['off', 'on', 'unknown'].includes(String(value.response.state))
  ) {
    return false;
  }
  const passed = value.response.success && value.response.state === 'off';
  return passed
    ? value.status === 'passed' && value.issue == null
    : value.status === 'failed' && isIssue(value.issue);
}

function hasValidCompletion(value: Record<string, unknown>) {
  const { cleanup, phase, execution, submission, measurementCompletedAt } = value;
  if (
    !isRecord(cleanup) ||
    !Array.isArray(cleanup.checks) ||
    cleanup.checks.length !== cleanupRequirements.length ||
    !isList(cleanup.attempts, (attempt) => isCleanupAttempt(attempt, value.dataOrigin)) ||
    !isRecord(submission) ||
    (execution != null &&
      (!isRecord(execution) || !isList(execution.attempts, isMeasurementAttempt)))
  ) {
    return false;
  }

  let confirmed = 0;
  for (const [index, requirement] of cleanupRequirements.entries()) {
    const check: unknown = cleanup.checks[index];
    if (!isRecord(check) || check.id !== requirement.id) return false;
    if (check.checked === true) {
      if (confirmed !== index || !isTimestamp(check.confirmedAt) || !isText(check.evidenceId))
        return false;
      confirmed += 1;
    } else if (check.checked !== false || check.confirmedAt !== null || check.evidenceId !== null) {
      return false;
    }
  }

  if (confirmed > 0 ? !isTimestamp(cleanup.deviceReleasedAt) : cleanup.deviceReleasedAt !== null)
    return false;

  const measurementFinished = ['awaitingCleanup', 'readyToSubmit', 'completed'].includes(
    String(phase),
  );
  if (measurementFinished && (!isTimestamp(measurementCompletedAt) || execution?.cursor !== null))
    return false;

  if (phase === 'completed') {
    return (
      confirmed === cleanupRequirements.length &&
      submission.status === 'submitted' &&
      submission.sessionId === value.sessionId &&
      submission.resultId === value.sessionId &&
      value.resultId === submission.resultId &&
      isTimestamp(submission.submittedAt) &&
      value.submittedAt === submission.submittedAt
    );
  }

  return (
    submission.status === 'not_submitted' &&
    submission.resultId === null &&
    submission.submittedAt === null &&
    value.resultId == null &&
    value.submittedAt == null &&
    (phase === 'readyToSubmit'
      ? confirmed === cleanupRequirements.length
      : phase !== 'awaitingCleanup' || confirmed < cleanupRequirements.length)
  );
}

function isVoiceRequest(value: unknown) {
  return (
    isRecord(value) &&
    isText(value.commandId) &&
    isText(value.utterance) &&
    isText(value.createdAt) &&
    value.source === 'api' &&
    isCursor(value.cursor) &&
    (value.sampleAttemptId === null || isText(value.sampleAttemptId))
  );
}

function isVoiceResolution(value: unknown) {
  return (
    isRecord(value) &&
    isVoiceRequest(value) &&
    (value.choice === 'repeatGuidance' ||
      value.choice === 'remeasure' ||
      value.choice === 'doNothing' ||
      value.choice === 'cancel') &&
    isText(value.resolvedAt) &&
    isText(value.evidenceId)
  );
}

const phases = new Set([
  'preparing',
  'awaitingDeviceCheck',
  'readyToExecute',
  'running',
  'held',
  'awaitingCleanup',
  'readyToSubmit',
  'completed',
  'cancelled',
]);

export function parseEdgeSession(value: unknown, sessionId?: string): ExperimentSession {
  const invalid = () => new WorkflowError('EDGE_REJECTED', 'Edge 세션 응답 형식을 확인해 주세요.');

  if (
    !isRecord(value) ||
    !isText(value.sessionId) ||
    (sessionId !== undefined && value.sessionId !== sessionId) ||
    value.source !== 'api' ||
    (value.dataOrigin !== 'simulation' && value.dataOrigin !== 'hardware') ||
    !isText(value.operatorId) ||
    !isText(value.createdAt) ||
    !isText(value.updatedAt) ||
    !isText(value.phase) ||
    !phases.has(value.phase) ||
    (value.workflowVersion !== undefined &&
      value.workflowVersion !== '1.0' &&
      value.workflowVersion !== '2.0') ||
    (value.holdReason != null && !isIssue(value.holdReason)) ||
    !Number.isInteger(value.revision) ||
    Number(value.revision) < 0 ||
    (value.pendingJob !== null &&
      (!isRecord(value.pendingJob) ||
        !isText(value.pendingJob.kind) ||
        !isText(value.pendingJob.attemptId))) ||
    !isList(value.evidence, isRecord) ||
    !isList(value.events, isRecord) ||
    !isList(value.deviceChecks, isCheckAttempt) ||
    !isList(
      value.checks,
      (check) =>
        isRecord(check) &&
        isText(check.id) &&
        typeof check.checked === 'boolean' &&
        (check.confirmedAt === null || isText(check.confirmedAt)) &&
        (check.evidenceId === null || isText(check.evidenceId)),
    )
  ) {
    throw invalid();
  }

  const { procedure, execution } = value;
  if (
    !isRecord(procedure) ||
    procedure.approval !== 'approved' ||
    !isText(procedure.procedureId) ||
    !isText(procedure.version) ||
    !isText(procedure.title) ||
    !isText(procedure.deviceId) ||
    !isList(
      procedure.preparation,
      (item) =>
        isRecord(item) &&
        isText(item.id) &&
        isText(item.title) &&
        typeof item.description === 'string' &&
        typeof item.guidance === 'string' &&
        (item.owner === 'operator' || item.owner === 'system') &&
        (item.verifiedAt === 'S04' || item.verifiedAt === 'S05') &&
        typeof item.requiredForDeviceCheck === 'boolean',
    ) ||
    !isRecord(procedure.deviceCheck) ||
    !isText(procedure.deviceCheck.deviceId) ||
    !isText(procedure.deviceCheck.title) ||
    !isList(
      procedure.deviceCheck.sensors,
      (sensor) =>
        isRecord(sensor) &&
        isText(sensor.sensorId) &&
        isText(sensor.title) &&
        typeof sensor.description === 'string' &&
        typeof sensor.required === 'boolean' &&
        isList(
          sensor.metrics,
          (metric) =>
            isRecord(metric) && isText(metric.id) && isText(metric.label) && isText(metric.unit),
        ),
    ) ||
    !isExecutionDefinition(procedure.execution)
  ) {
    throw invalid();
  }

  if (
    (execution != null &&
      (!isRecord(execution) ||
        !Array.isArray(execution.attempts) ||
        (execution.pendingVoice != null && !isVoiceRequest(execution.pendingVoice)) ||
        (execution.voiceResolutions !== undefined &&
          !isList(execution.voiceResolutions, isVoiceResolution)) ||
        (execution.cursor !== null && !isCursor(execution.cursor)))) ||
    (value.phase === 'running' && (!isRecord(execution) || !isCursor(execution.cursor))) ||
    (value.workflowVersion === '2.0'
      ? !hasValidCompletion(value)
      : value.phase === 'awaitingCleanup' || value.phase === 'readyToSubmit')
  ) {
    throw invalid();
  }

  return value as unknown as ExperimentSession;
}
