import type { DeviceCheckAttempt } from '../../domain/device-check';
import type { ExecutionCursor, ExecutionDefinition } from '../../domain/execution';
import { WorkflowError, type ExperimentSession } from '../../domain/models';

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
  const report = value.report;
  return (
    isText(value.completedAt) &&
    // A failed asynchronous job can end before the device produces a report.
    ((report === undefined && value.status === 'failed') ||
      (isRecord(report) &&
        isText(report.deviceId) &&
        isText(report.checkedAt) &&
        report.source === 'api' &&
        isList(
          report.sensors,
          (sensor) =>
            isRecord(sensor) &&
            isText(sensor.sensorId) &&
            isText(sensor.status) &&
            isList(
              sensor.readings,
              (reading) =>
                isRecord(reading) &&
                isText(reading.metricId) &&
                (reading.value === null || typeof reading.value === 'number') &&
                isText(reading.unit) &&
                isText(reading.observedAt) &&
                reading.source === 'api',
            ) &&
            (sensor.issue === undefined || isIssue(sensor.issue)),
        )))
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

const phases = new Set([
  'preparing',
  'awaitingDeviceCheck',
  'readyToExecute',
  'running',
  'held',
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
        (execution.cursor !== null && !isCursor(execution.cursor)))) ||
    (value.phase === 'running' && (!isRecord(execution) || !isCursor(execution.cursor)))
  ) {
    throw invalid();
  }

  return value as unknown as ExperimentSession;
}
