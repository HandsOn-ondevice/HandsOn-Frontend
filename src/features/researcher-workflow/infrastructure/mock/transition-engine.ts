import { WorkflowError, type ExperimentSession, type WorkflowCommand } from '../../domain/models';
import { selectPreparation } from '../../domain/preparation';

export interface TransitionMetadata {
  readonly requestId: string;
  readonly now: string;
  readonly eventId: string;
  readonly evidenceId: string;
}

/** Mock 전용 규칙. 센서 안전 판정이나 실제 절차 승인을 수행하지 않는다. */
export function transitionPreparation(
  session: ExperimentSession,
  command: WorkflowCommand,
  metadata: TransitionMetadata,
): ExperimentSession {
  if (command.type === 'completePreparation' && session.phase === 'awaitingDeviceCheck') {
    return session;
  }
  if (session.phase !== 'preparing') {
    throw new WorkflowError('INVALID_STATE', '준비 확인이 제출되어 변경할 수 없습니다.');
  }
  if (command.type === 'completePreparation') {
    if (!selectPreparation(session).canContinue) {
      throw new WorkflowError(
        'PREPARATION_INCOMPLETE',
        '필수 작업자 확인 5개를 먼저 완료해 주세요.',
      );
    }
    return {
      ...session,
      phase: 'awaitingDeviceCheck',
      revision: session.revision + 1,
      updatedAt: metadata.now,
      evidence: [
        ...session.evidence,
        {
          evidenceId: metadata.evidenceId,
          sessionId: session.sessionId,
          kind: 'program',
          actorId: 'mock-workflow',
          action: 'preparationCompleted',
          recordedAt: metadata.now,
          source: 'mock',
        },
      ],
      events: [
        ...session.events,
        {
          eventId: metadata.eventId,
          requestId: metadata.requestId,
          type: 'preparationCompleted',
          occurredAt: metadata.now,
          evidenceId: metadata.evidenceId,
        },
      ],
    };
  }
  const requirement = session.procedure.preparation.find((item) => item.id === command.checkId);
  if (!requirement || requirement.owner !== 'operator' || requirement.verifiedAt !== 'S04') {
    throw new WorkflowError('CHECK_NOT_EDITABLE', '이 항목은 S05의 시스템 근거로 확인합니다.');
  }
  const check = session.checks.find((item) => item.id === command.checkId);
  if (!check) throw new WorkflowError('NOT_FOUND', '준비 항목을 찾을 수 없습니다.');
  if (check.checked === command.checked) return session;
  return {
    ...session,
    revision: session.revision + 1,
    updatedAt: metadata.now,
    checks: session.checks.map((item) =>
      item.id === command.checkId
        ? {
            ...item,
            checked: command.checked,
            confirmedAt: command.checked ? metadata.now : null,
            evidenceId: command.checked ? metadata.evidenceId : null,
          }
        : item,
    ),
    evidence: [
      ...session.evidence,
      {
        evidenceId: metadata.evidenceId,
        sessionId: session.sessionId,
        checkId: command.checkId,
        kind: 'human',
        actorId: session.operatorId,
        action: command.checked ? 'confirmed' : 'revoked',
        recordedAt: metadata.now,
        source: 'mock',
      },
    ],
    events: [
      ...session.events,
      {
        eventId: metadata.eventId,
        requestId: metadata.requestId,
        type: command.checked ? 'checkConfirmed' : 'checkRevoked',
        occurredAt: metadata.now,
        evidenceId: metadata.evidenceId,
        checkId: command.checkId,
      },
    ],
  };
}
