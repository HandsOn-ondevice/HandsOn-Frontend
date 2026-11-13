import { WorkflowError, type ExperimentSession, type WorkflowCommand } from '../../domain/models';
import { selectRecovery } from '../../domain/recovery';
import { beginExecutionSample } from './execution-transitions';
import type { TransitionMetadata } from './transition-engine';

export function beginRecovery(
  session: ExperimentSession,
  command: Extract<WorkflowCommand, { type: 'requestRecovery' }>,
  sampleAttemptId: string,
  meta: TransitionMetadata,
): ExperimentSession {
  const state = selectRecovery(session);
  if (
    !state.canRecover ||
    state.cursor?.cursorId !== command.cursorId ||
    state.blocked?.attemptId !== command.blockedAttemptId ||
    !session.execution
  )
    throw new WorkflowError('INVALID_STATE', '현재 보류된 회차에서 센서를 다시 확인해 주세요.');
  const next = beginExecutionSample(
    session,
    command.cursorId,
    sampleAttemptId,
    meta,
    'recoveryCheck',
  );
  return {
    ...next,
    execution: {
      ...next.execution!,
      recoveries: [
        ...(session.execution.recoveries ?? []),
        {
          recoveryId: meta.eventId,
          blockedAttemptId: command.blockedAttemptId,
          sampleAttemptId,
          cursor: state.cursor,
          requestedAt: meta.now,
          status: 'checking',
        },
      ],
    },
    // 사용자 재확인 요청을 기록한다. 실제 배선·전원 상태가 확인됐다는 근거는 아니다.
    evidence: [
      ...next.evidence,
      {
        evidenceId: meta.evidenceId,
        sessionId: session.sessionId,
        kind: 'human',
        actorId: session.operatorId,
        action: 'recoveryRequested',
        recordedAt: meta.now,
        source: session.source,
        attemptId: sampleAttemptId,
        cursor: state.cursor,
      },
    ],
    events: next.events.map((event) =>
      event.eventId === meta.eventId
        ? { ...event, type: 'recoveryRequested', evidenceId: meta.evidenceId }
        : event,
    ),
  };
}
