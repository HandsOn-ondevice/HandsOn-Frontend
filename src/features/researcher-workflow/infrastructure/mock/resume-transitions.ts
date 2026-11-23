import { WorkflowError, type ExperimentSession, type WorkflowCommand } from '../../domain/models';
import type { DeviceDiagnosticsReport } from '../../domain/device-check';
import { selectExecution } from '../../domain/execution';
import { selectResume, resumeReportIssue } from '../../domain/resume';
import type { TransitionMetadata } from './transition-engine';

export function pauseMockExecution(
  session: ExperimentSession,
  cursorId: string,
  meta: TransitionMetadata,
): ExperimentSession {
  const cursor = session.execution?.cursor;
  if (!cursor || cursor.cursorId !== cursorId) {
    throw new WorkflowError('INVALID_STATE', '일시정지할 현재 회차를 확인해 주세요.');
  }
  if (session.phase === 'paused') return session;
  if (!selectExecution(session).authorized) {
    throw new WorkflowError('INVALID_STATE', '진행 중인 실험만 일시정지할 수 있습니다.');
  }
  return {
    ...session,
    phase: 'paused',
    revision: session.revision + 1,
    updatedAt: meta.now,
    events: [
      ...session.events,
      {
        eventId: meta.eventId,
        requestId: meta.requestId,
        type: 'executionPaused',
        occurredAt: meta.now,
        cursor,
      },
    ],
  };
}

function requirePause(session: ExperimentSession, pauseEventId: string, cursorId?: string) {
  const state = selectResume(session);
  if (
    !state.paused ||
    state.pause?.eventId !== pauseEventId ||
    (cursorId && state.cursor?.cursorId !== cursorId)
  ) {
    throw new WorkflowError('INVALID_STATE', '현재 일시정지 기록과 회차를 다시 확인해 주세요.');
  }
  return state;
}

export function beginResumeCheck(
  session: ExperimentSession,
  command: Extract<WorkflowCommand, { type: 'checkResume' }>,
  attemptId: string,
  meta: TransitionMetadata,
): ExperimentSession {
  const state = requirePause(session, command.pauseEventId, command.cursorId);
  if (
    !['connection', 'voltage'].includes(command.target) ||
    (command.target === 'connection' ? state.connection : state.voltageCheck).checking ||
    !session.procedure.deviceCheck
  )
    throw new WorkflowError('INVALID_STATE', '재확인 응답을 기다리거나 장치 정의를 확인해 주세요.');
  return {
    ...session,
    revision: session.revision + 1,
    updatedAt: meta.now,
    resumeChecks: [
      ...(session.resumeChecks ?? []),
      {
        attemptId,
        target: command.target,
        pauseEventId: command.pauseEventId,
        cursorId: command.cursorId,
        status: 'checking',
        startedAt: meta.now,
        operatorConfirmed: false,
      },
    ],
    events: [
      ...session.events,
      {
        eventId: meta.eventId,
        requestId: meta.requestId,
        type: 'resumeCheckRequested',
        occurredAt: meta.now,
        attemptId,
        cursor: state.cursor!,
      },
    ],
  };
}

export function finishResumeCheck(
  session: ExperimentSession,
  attemptId: string,
  report: DeviceDiagnosticsReport,
  meta: TransitionMetadata,
): ExperimentSession {
  const state = selectResume(session);
  const attempt = session.resumeChecks?.find((item) => item.attemptId === attemptId);
  const card = attempt?.target === 'connection' ? state.connection : state.voltageCheck;
  if (
    !state.paused ||
    !attempt ||
    card.attempt?.attemptId !== attemptId ||
    attempt.status !== 'checking'
  )
    return session;
  const issue = resumeReportIssue(session, attempt, report, meta.now);
  return {
    ...session,
    revision: session.revision + 1,
    updatedAt: meta.now,
    resumeChecks: session.resumeChecks!.map((item) =>
      item.attemptId === attemptId
        ? {
            ...item,
            status: issue ? ('failed' as const) : ('passed' as const),
            completedAt: meta.now,
            report,
            issue,
          }
        : item,
    ),
    evidence: [
      ...session.evidence,
      {
        evidenceId: meta.evidenceId,
        sessionId: session.sessionId,
        kind: 'program',
        actorId: 'mock-resume-check',
        action: 'resumeChecked',
        source: session.source,
        recordedAt: meta.now,
        attemptId,
        diagnostics: report,
        issue,
      },
    ],
    events: [
      ...session.events,
      {
        eventId: meta.eventId,
        requestId: meta.requestId,
        type: issue ? 'resumeCheckFailed' : 'resumeCheckPassed',
        occurredAt: meta.now,
        attemptId,
        cursor: state.cursor!,
      },
    ],
  };
}

export function confirmResumeSetup(
  session: ExperimentSession,
  command: Extract<WorkflowCommand, { type: 'confirmResumeSetup' }>,
  meta: TransitionMetadata,
): ExperimentSession {
  const state = requirePause(session, command.pauseEventId);
  if (!state.passed || state.attempt?.attemptId !== command.attemptId)
    throw new WorkflowError(
      'INVALID_STATE',
      '이번 장치 재확인에 성공한 뒤 거리와 지그를 확인해 주세요.',
    );
  if (state.attempt.operatorConfirmed === command.confirmed) return session;
  return {
    ...session,
    revision: session.revision + 1,
    updatedAt: meta.now,
    resumeChecks: session.resumeChecks!.map((item) =>
      item.attemptId === command.attemptId
        ? { ...item, operatorConfirmed: command.confirmed }
        : item,
    ),
    evidence: [
      ...session.evidence,
      {
        evidenceId: meta.evidenceId,
        sessionId: session.sessionId,
        kind: 'human',
        actorId: session.operatorId,
        action: command.confirmed ? 'resumeSetupConfirmed' : 'resumeSetupRevoked',
        source: session.source,
        recordedAt: meta.now,
        attemptId: command.attemptId,
      },
    ],
    events: [
      ...session.events,
      {
        eventId: meta.eventId,
        requestId: meta.requestId,
        type: command.confirmed ? 'resumeSetupConfirmed' : 'resumeSetupRevoked',
        occurredAt: meta.now,
        attemptId: command.attemptId,
        cursor: state.cursor!,
      },
    ],
  };
}

export function resumeExecution(
  session: ExperimentSession,
  command: Extract<WorkflowCommand, { type: 'resumeExecution' }>,
  meta: TransitionMetadata,
): ExperimentSession {
  const state = requirePause(session, command.pauseEventId, command.cursorId);
  if (!state.canResume)
    throw new WorkflowError(
      'INVALID_STATE',
      '장치·센서 재확인과 작업자 확인을 완료한 뒤 재개해 주세요.',
    );
  return {
    ...session,
    phase: 'running',
    revision: session.revision + 1,
    updatedAt: meta.now,
    execution: {
      ...session.execution!,
      recoveries: session.execution!.recoveries?.map((item) =>
        item.cursor.cursorId === command.cursorId && item.status === 'checking'
          ? {
              ...item,
              status: 'failed' as const,
              completedAt: meta.now,
              issue: {
                code: 'PAUSE_INTERRUPTED',
                message: '일시정지 전 복구 응답은 사용하지 않습니다. 센서를 다시 확인해 주세요.',
              },
            }
          : item,
      ),
      attempts: session.execution!.attempts.map((attempt) => {
        if (
          attempt.cursor.cursorId !== command.cursorId ||
          !['sampling', 'waiting', 'ready'].includes(attempt.status)
        )
          return attempt;
        // 완료로 사용할 수 없는 복구 성공 응답은 S09 새 측정의 연결 근거로 유지한다.
        if (attempt.purpose === 'recoveryCheck' && attempt.status === 'ready') return attempt;
        if (attempt.purpose === 'recoveryCheck' || attempt.purpose === 'remeasurement')
          return {
            ...attempt,
            status: 'held' as const,
            issue: {
              code: 'PAUSE_INTERRUPTED',
              message: '일시정지 전 측정은 사용하지 않습니다. 센서 복구 후 새로 측정해 주세요.',
            },
          };
        return { ...attempt, status: 'superseded' as const };
      }),
    },
    evidence: [
      ...session.evidence,
      {
        evidenceId: meta.evidenceId,
        sessionId: session.sessionId,
        kind: 'program',
        actorId: 'mock-workflow',
        action: 'executionResumed',
        source: session.source,
        recordedAt: meta.now,
        attemptId: state.attempt!.attemptId,
        cursor: state.cursor!,
      },
    ],
    events: [
      ...session.events,
      {
        eventId: meta.eventId,
        requestId: meta.requestId,
        type: 'executionResumed',
        occurredAt: meta.now,
        attemptId: state.attempt!.attemptId,
        cursor: state.cursor!,
      },
    ],
  };
}
