import { WorkflowError, type ExperimentSession } from '../../domain/models';
import {
  selectExecution,
  validExecutionDefinition,
  executionSampleIssue,
  type ExecutionSampleReport,
  type ExecutionState,
  type ExecutionCursor,
} from '../../domain/execution';
import { recoverySampleIssue } from '../../domain/recovery';
import type { TransitionMetadata } from './transition-engine';
import { resolveVoiceClarification } from './voice-clarification-transitions';

export function initialExecution(
  session: ExperimentSession,
  cursorId: string,
): ExecutionState | undefined {
  const definition = session.procedure.execution;
  if (!validExecutionDefinition(definition) || !definition) return undefined;
  return {
    cursor: {
      cursorId,
      stepId: `measure:${definition.conditions[0].id}`,
      conditionId: definition.conditions[0].id,
      trialIndex: 1,
    },
    attempts: [],
    pendingVoice: null,
  };
}

function invalid(message: string): never {
  throw new WorkflowError('INVALID_STATE', message);
}

export function beginExecutionSample(
  session: ExperimentSession,
  cursorId: string,
  attemptId: string,
  meta: TransitionMetadata,
  recovery = false,
): ExperimentSession {
  const state = selectExecution(session);
  if (
    !(recovery ? state.canRecover : state.canSample) ||
    state.cursor?.cursorId !== cursorId ||
    !session.execution
  )
    invalid('현재 회차의 응답을 확인할 수 없습니다.');
  return {
    ...session,
    revision: session.revision + 1,
    updatedAt: meta.now,
    execution: {
      ...session.execution,
      attempts: [
        ...session.execution.attempts.map((attempt) =>
          attempt.cursor.cursorId === cursorId && attempt.status === 'ready'
            ? { ...attempt, status: 'superseded' as const }
            : attempt,
        ),
        { attemptId, cursor: state.cursor, status: 'sampling', requestedAt: meta.now },
      ],
    },
    events: [
      ...session.events,
      {
        eventId: meta.eventId,
        requestId: meta.requestId,
        type: 'executionSampleRequested',
        occurredAt: meta.now,
        attemptId,
        cursor: state.cursor,
      },
    ],
  };
}

export function finishExecutionSample(
  session: ExperimentSession,
  attemptId: string,
  report: ExecutionSampleReport,
  meta: TransitionMetadata,
): ExperimentSession {
  const state = selectExecution(session);
  const latest = state.latest;
  if (
    !session.execution ||
    !state.authorized ||
    latest?.attemptId !== attemptId ||
    latest.status !== 'sampling'
  )
    return session;
  const candidate = { ...latest, report };
  const recovery = session.execution.recoveries?.find(
    (item) => item.sampleAttemptId === attemptId && item.status === 'checking',
  );
  const issue = recovery
    ? recoverySampleIssue(session, candidate, meta.now)
    : executionSampleIssue(session, candidate);
  const status = !issue
    ? 'ready'
    : issue.code === 'WAITING'
      ? 'waiting'
      : issue.code === 'HELD' ||
          report.diagnostics.sensors.some(
            (sensor) => sensor.status === 'stale' || sensor.status === 'disconnected',
          )
        ? 'held'
        : 'error';
  return {
    ...session,
    revision: session.revision + 1,
    updatedAt: meta.now,
    execution: {
      ...session.execution,
      recoveries: session.execution.recoveries?.map((item) =>
        item === recovery
          ? {
              ...item,
              status: issue ? ('failed' as const) : ('recovered' as const),
              completedAt: meta.now,
              issue,
            }
          : item,
      ),
      attempts: session.execution.attempts.map((attempt) =>
        attempt.attemptId === attemptId
          ? { ...candidate, status, receivedAt: meta.now, issue }
          : attempt,
      ),
    },
    evidence: recovery
      ? [
          ...session.evidence,
          {
            evidenceId: meta.evidenceId,
            sessionId: session.sessionId,
            kind: 'program',
            actorId: 'mock-workflow',
            action: 'recoveryChecked',
            source: session.source,
            recordedAt: meta.now,
            attemptId,
            cursor: latest.cursor,
            issue,
            diagnostics: report.diagnostics,
          },
        ]
      : session.evidence,
    events: [
      ...session.events,
      {
        eventId: meta.eventId,
        requestId: meta.requestId,
        type: recovery
          ? issue
            ? 'recoveryFailed'
            : 'recoverySucceeded'
          : issue
            ? 'executionSampleRejected'
            : 'executionSampleReceived',
        occurredAt: meta.now,
        attemptId,
        cursor: latest.cursor,
      },
    ],
  };
}

export function completeExecutionStep(
  session: ExperimentSession,
  cursorId: string,
  sampleAttemptId: string,
  nextCursorId: string,
  meta: TransitionMetadata,
): ExperimentSession {
  const state = selectExecution(session);
  if (!state.authorized || !session.execution)
    invalid('장치 점검을 완료하고 실험을 시작해 주세요.');
  // 새 요청 ID라도 이미 수락된 같은 회차·같은 응답을 재완료하지 않는다.
  if (
    session.execution.attempts.some(
      (attempt) =>
        attempt.attemptId === sampleAttemptId &&
        attempt.cursor.cursorId === cursorId &&
        attempt.status === 'valid',
    )
  )
    return session;
  if (
    !state.canComplete ||
    state.cursor?.cursorId !== cursorId ||
    state.latest?.attemptId !== sampleAttemptId
  )
    invalid(state.reason);
  const definition = session.procedure.execution!;
  const currentIndex = definition.conditions.findIndex(
    (condition) => condition.id === state.cursor!.conditionId,
  );
  const current = definition.conditions[currentIndex];
  const next =
    state.cursor.trialIndex < current.repetitions
      ? current
      : definition.conditions[currentIndex + 1];
  const cursor: ExecutionCursor | null = next
    ? {
        cursorId: nextCursorId,
        stepId: `measure:${next.id}`,
        conditionId: next.id,
        trialIndex: next.id === current.id ? state.cursor.trialIndex + 1 : 1,
      }
    : null;
  return {
    ...session,
    revision: session.revision + 1,
    updatedAt: meta.now,
    execution: {
      ...session.execution,
      cursor,
      attempts: session.execution.attempts.map((attempt) =>
        attempt.attemptId === sampleAttemptId
          ? { ...attempt, status: 'valid', confirmedAt: meta.now }
          : attempt,
      ),
    },
    evidence: [
      ...session.evidence,
      {
        evidenceId: `${meta.evidenceId}:human`,
        sessionId: session.sessionId,
        attemptId: sampleAttemptId,
        cursor: state.cursor,
        kind: 'human',
        actorId: session.operatorId,
        action: 'measurementConfirmed',
        source: 'mock',
        recordedAt: meta.now,
      },
      ...state.latest!.report!.diagnostics.sensors.map((sensor, index) => ({
        evidenceId: `${meta.evidenceId}:sensor:${index}`,
        sessionId: session.sessionId,
        attemptId: sampleAttemptId,
        cursor: state.cursor!,
        kind: 'sensor' as const,
        actorId: 'mock-execution',
        action: 'measurementAccepted' as const,
        source: 'mock' as const,
        recordedAt: meta.now,
        sensorId: sensor.sensorId,
        readings: sensor.readings,
      })),
      {
        evidenceId: meta.evidenceId,
        sessionId: session.sessionId,
        attemptId: sampleAttemptId,
        cursor: state.cursor,
        kind: 'program',
        actorId: 'mock-workflow',
        action: 'measurementAccepted',
        source: 'mock',
        recordedAt: meta.now,
      },
    ],
    events: [
      ...session.events,
      {
        eventId: meta.eventId,
        requestId: meta.requestId,
        type: 'measurementAccepted',
        occurredAt: meta.now,
        attemptId: sampleAttemptId,
        cursor: state.cursor,
        evidenceId: meta.evidenceId,
      },
    ],
  };
}

export function requestVoiceClarification(
  session: ExperimentSession,
  cursorId: string,
  utterance: string,
  commandId: string,
  meta: TransitionMetadata,
): ExperimentSession {
  const state = selectExecution(session);
  if (!state.canClarify || state.cursor?.cursorId !== cursorId || !session.execution)
    invalid('현재 단계에서 음성 확인을 요청할 수 없습니다.');
  if (!utterance.trim() || utterance.length > 200) invalid('음성 예시 문구를 확인해 주세요.');
  return {
    ...session,
    revision: session.revision + 1,
    updatedAt: meta.now,
    execution: {
      ...session.execution,
      pendingVoice: {
        commandId,
        cursor: state.cursor,
        utterance,
        createdAt: meta.now,
        source: 'mock',
        sampleAttemptId: state.latest?.attemptId ?? null,
      },
    },
    events: [
      ...session.events,
      {
        eventId: meta.eventId,
        requestId: meta.requestId,
        type: 'voiceClarificationRequested',
        occurredAt: meta.now,
        cursor: state.cursor,
        commandId,
      },
    ],
  };
}

export function dismissVoiceClarification(
  session: ExperimentSession,
  commandId: string,
  meta: TransitionMetadata,
): ExperimentSession {
  return resolveVoiceClarification(session, commandId, 'cancel', undefined, meta);
}
