import type { ExecutionCursor } from './execution';
import { selectExecution } from './execution';
import type { ExperimentSession } from './models';

/** Figma의 선택지. 의도 추론·장치 명령 DTO가 아닌 내부 사용자 선택 계약이다. */
export type VoiceChoice = 'repeatGuidance' | 'remeasure' | 'doNothing';
export interface VoiceResolution {
  readonly commandId: string;
  readonly cursor: ExecutionCursor;
  readonly utterance: string;
  readonly choice: VoiceChoice | 'cancel';
  readonly source: 'mock' | 'api';
  readonly resolvedAt: string;
  readonly evidenceId: string;
  readonly sampleAttemptId: string | null;
  readonly replacementAttemptId?: string;
}

export const voiceChoiceLabels: Record<VoiceChoice | 'cancel', string> = {
  repeatGuidance: '현재 안내를 다시 듣기',
  remeasure: '같은 조건·회차 다시 측정',
  doNothing: '아무것도 하지 않기',
  cancel: '선택하지 않고 취소',
};

export function selectVoiceClarification(session: ExperimentSession) {
  const state = selectExecution(session);
  const request = state.pendingVoice;
  const cursor = state.cursor;
  const valid = !!(
    state.authorized &&
    state.configured &&
    request &&
    cursor &&
    !state.sampling &&
    !state.requiresRecovery &&
    !state.requiresRemeasurement &&
    request.source === session.source &&
    request.cursor.cursorId === cursor.cursorId &&
    request.cursor.stepId === cursor.stepId &&
    request.cursor.conditionId === cursor.conditionId &&
    request.cursor.trialIndex === cursor.trialIndex &&
    request.sampleAttemptId === (state.latest?.attemptId ?? null) &&
    request.utterance.trim() &&
    request.utterance.length <= 200 &&
    Number.isFinite(Date.parse(request.createdAt)) &&
    !session.execution?.voiceResolutions?.some((item) => item.commandId === request.commandId)
  );
  return {
    request,
    valid,
    condition: state.condition,
    canCancel: state.authorized && !!request,
    lastResolution: session.execution?.voiceResolutions?.slice(-1)[0],
    reason: !state.authorized
      ? '장치 점검을 완료하고 실험을 시작해 주세요.'
      : !request
        ? '처리할 음성 확인 요청이 없습니다. 현재 작업에서 다시 요청해 주세요.'
        : !valid
          ? '현재 작업과 일치하지 않거나 이미 처리된 요청입니다. 취소한 뒤 현재 작업에서 다시 요청해 주세요.'
          : '선택 전에는 명령을 실행하지 않습니다. 뜻을 선택한 뒤 하단 버튼으로 확정해 주세요.',
  };
}
