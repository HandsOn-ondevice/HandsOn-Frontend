import { WorkflowError, type ExperimentSession } from '../../domain/models';
import { selectVoiceClarification, type VoiceChoice } from '../../domain/voice-clarification';
import type { TransitionMetadata } from './transition-engine';

/** 사용자 확인과 Mock 효과를 기록한다. 실제 장치 명령이나 측정 완료는 수행하지 않는다. */
export function resolveVoiceClarification(
  session: ExperimentSession,
  commandId: string,
  choice: VoiceChoice | 'cancel',
  replacementAttemptId: string | undefined,
  meta: TransitionMetadata,
): ExperimentSession {
  const state = selectVoiceClarification(session);
  const execution = session.execution;
  const previous = execution?.voiceResolutions?.find((item) => item.commandId === commandId);
  if (previous) {
    if (previous.choice === choice) return session;
    throw new WorkflowError('REQUEST_CONFLICT', '이미 다른 선택으로 처리한 음성 확인 요청입니다.');
  }
  if (
    !execution ||
    !state.request ||
    state.request.commandId !== commandId ||
    (choice === 'cancel' ? !state.canCancel : !state.valid) ||
    !['repeatGuidance', 'remeasure', 'doNothing', 'cancel'].includes(choice) ||
    (choice === 'remeasure' && !replacementAttemptId)
  )
    throw new WorkflowError('INVALID_STATE', state.reason);
  const request = state.request;
  return {
    ...session,
    revision: session.revision + 1,
    updatedAt: meta.now,
    execution: {
      ...execution,
      pendingVoice: null,
      voiceResolutions: [
        ...(execution.voiceResolutions ?? []),
        {
          commandId,
          choice,
          cursor: request.cursor,
          utterance: request.utterance,
          resolvedAt: meta.now,
          source: 'mock',
          evidenceId: meta.evidenceId,
          sampleAttemptId: request.sampleAttemptId,
          replacementAttemptId,
        },
      ],
    },
    evidence: [
      ...session.evidence,
      {
        evidenceId: meta.evidenceId,
        sessionId: session.sessionId,
        kind: 'human',
        actorId: session.operatorId,
        action: choice === 'cancel' ? 'voiceClarificationCancelled' : 'voiceClarificationConfirmed',
        recordedAt: meta.now,
        source: 'mock',
        cursor: request.cursor,
        commandId,
        voiceChoice: choice,
      },
    ],
    events: [
      ...session.events,
      {
        eventId: meta.eventId,
        requestId: meta.requestId,
        type: choice === 'cancel' ? 'voiceClarificationDismissed' : 'voiceClarificationResolved',
        occurredAt: meta.now,
        cursor: request.cursor,
        commandId,
        voiceChoice: choice,
        evidenceId: meta.evidenceId,
      },
    ],
  };
}
