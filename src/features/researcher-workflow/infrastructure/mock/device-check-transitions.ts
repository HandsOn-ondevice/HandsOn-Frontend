import { WorkflowError, type ExperimentSession, type Evidence } from '../../domain/models';
import {
  selectDeviceCheck,
  validateDiagnostics,
  type DeviceDiagnosticsReport,
} from '../../domain/device-check';
import type { TransitionMetadata } from './transition-engine';
import { initialExecution } from './execution-transitions';

export function beginDeviceCheck(
  session: ExperimentSession,
  attemptId: string,
  meta: TransitionMetadata,
): ExperimentSession {
  if (!selectDeviceCheck(session).canInspect) {
    throw new WorkflowError(
      'INVALID_STATE',
      'S04 확인 완료 후에만 점검할 수 있습니다. 진행 중이거나 실험을 시작한 뒤에는 다시 요청할 수 없습니다.',
    );
  }
  return {
    ...session,
    phase: 'awaitingDeviceCheck',
    revision: session.revision + 1,
    updatedAt: meta.now,
    checks: session.checks.map((check) =>
      check.id === 'communication'
        ? { ...check, checked: false, confirmedAt: null, evidenceId: null }
        : check,
    ),
    deviceChecks: [...session.deviceChecks, { attemptId, status: 'checking', startedAt: meta.now }],
    events: [
      ...session.events,
      {
        eventId: meta.eventId,
        requestId: meta.requestId,
        type: 'deviceCheckStarted',
        occurredAt: meta.now,
        attemptId,
      },
    ],
  };
}

/** 비동기 응답은 요청 중인 최신 attempt에만 적용된다. 이전 성공은 새 점검의 근거가 될 수 없다. */
export function finishDeviceCheck(
  session: ExperimentSession,
  attemptId: string,
  report: DeviceDiagnosticsReport,
  meta: TransitionMetadata,
): ExperimentSession {
  const latest = session.deviceChecks.at(-1);
  if (
    latest?.attemptId !== attemptId ||
    latest.status !== 'checking' ||
    session.phase !== 'awaitingDeviceCheck'
  )
    return session;
  const issue =
    report.source !== 'mock'
      ? { code: 'INVALID_SOURCE', message: 'Mock 점검에 실제 데이터 출처를 사용할 수 없습니다.' }
      : validateDiagnostics(session.procedure.deviceCheck, report);
  const passed = !issue;
  const action = passed ? 'deviceCheckPassed' : 'deviceCheckFailed';
  const sensorEvidence: Evidence[] = report.sensors.map((sensor, index) => ({
    evidenceId: `${meta.evidenceId}:sensor:${index}`,
    sessionId: session.sessionId,
    attemptId,
    kind: 'sensor',
    actorId: 'mock-diagnostics',
    action: sensor.status === 'passed' ? 'deviceCheckPassed' : 'deviceCheckFailed',
    source: 'mock',
    sensorId: sensor.sensorId,
    readings: sensor.readings,
    issue: sensor.issue,
    recordedAt: meta.now,
  }));
  return {
    ...session,
    phase: passed ? 'readyToExecute' : 'awaitingDeviceCheck',
    revision: session.revision + 1,
    updatedAt: meta.now,
    checks: session.checks.map((check) =>
      check.id === 'communication'
        ? {
            ...check,
            checked: passed,
            confirmedAt: passed ? meta.now : null,
            evidenceId: passed ? meta.evidenceId : null,
          }
        : check,
    ),
    deviceChecks: session.deviceChecks.map((attempt) =>
      attempt.attemptId === attemptId
        ? {
            ...attempt,
            status: passed ? 'passed' : 'failed',
            completedAt: meta.now,
            report,
            issue,
          }
        : attempt,
    ),
    evidence: [
      ...session.evidence,
      ...sensorEvidence,
      {
        evidenceId: meta.evidenceId,
        sessionId: session.sessionId,
        attemptId,
        checkId: 'communication',
        kind: 'program',
        actorId: 'mock-workflow',
        action,
        source: 'mock',
        recordedAt: meta.now,
        diagnostics: report,
        issue,
      },
    ],
    events: [
      ...session.events,
      {
        eventId: meta.eventId,
        requestId: meta.requestId,
        type: action,
        occurredAt: meta.now,
        attemptId,
        evidenceId: meta.evidenceId,
      },
    ],
  };
}

export function startMockExecution(
  session: ExperimentSession,
  meta: TransitionMetadata,
): ExperimentSession {
  const state = selectDeviceCheck(session);
  if (state.executionStarted) return session;
  if (!state.canStart) {
    throw new WorkflowError(
      'INVALID_STATE',
      '필수 장치·센서 점검에 성공한 뒤에만 실험 측정 시작을 요청할 수 있습니다.',
    );
  }
  return {
    ...session,
    phase: 'running',
    execution: initialExecution(session, `${meta.eventId}:cursor`),
    revision: session.revision + 1,
    updatedAt: meta.now,
    evidence: [
      ...session.evidence,
      {
        evidenceId: meta.evidenceId,
        sessionId: session.sessionId,
        kind: 'program',
        actorId: 'mock-workflow',
        action: 'executionStarted',
        source: 'mock',
        recordedAt: meta.now,
        attemptId: state.latest?.attemptId,
      },
    ],
    events: [
      ...session.events,
      {
        eventId: meta.eventId,
        requestId: meta.requestId,
        type: 'executionStarted',
        occurredAt: meta.now,
        evidenceId: meta.evidenceId,
        attemptId: state.latest?.attemptId,
      },
    ],
  };
}
