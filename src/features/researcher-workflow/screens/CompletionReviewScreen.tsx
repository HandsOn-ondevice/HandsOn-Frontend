import { useState } from 'react';
import { View } from 'react-native';
import { AppText, FeedbackPanel, Icon, MetricTile, StatusBadge, colors } from '@/design-system';
import {
  acceptedMeasurement,
  measurementReading,
  selectCompletionReview,
} from '../domain/completion';
import { useWorkflowSession } from '../state/useWorkflowSession';
import {
  ActionShelf,
  CompletionConditions,
  CompletionScaffold,
  CompletionTimeline,
  UnavailableCompletion,
  completionStep,
  completionStyles,
  recordedTime,
} from './CompletionParts';

export function CompletionReviewScreen({
  sessionId,
  onBack,
  onExecution,
  onCleanup,
}: {
  sessionId: string;
  onBack: () => void;
  onExecution: () => void;
  onCleanup: () => void;
}) {
  const resource = useWorkflowSession(sessionId);
  const { session, loading, pending, execute } = resource;
  const state = session ? selectCompletionReview(session) : null;
  const [selected, setSelected] = useState<string | null>(null);
  const conditionId =
    selected ??
    state?.issues[0]?.conditionId ??
    session?.completion?.reviewRequests.at(-1)?.cursor.conditionId ??
    session?.procedure.execution?.conditions[0]?.id;
  const condition = session?.procedure.execution?.conditions.find(
    (item) => item.id === conditionId,
  );
  const conditionIssue = state?.issues.find((slot) => slot.conditionId === conditionId);
  const target = conditionIssue ?? state?.issues[0];
  const history =
    session?.execution?.attempts.filter(
      (attempt) =>
        attempt.cursor.conditionId === conditionId && attempt.purpose !== 'recoveryCheck',
    ) ?? [];
  const next = async () => {
    if (!state || !session) return;
    if (session.phase === 'cleaningUp') {
      onCleanup();
      return;
    }
    if (state.activeRequest) {
      onExecution();
      return;
    }
    if (state.canCleanup) {
      const nextSession = await execute({ type: 'startCleanup' });
      if (nextSession?.phase === 'cleaningUp') onCleanup();
    } else if (target && state.canRemeasure) {
      const nextSession = await execute({
        type: 'requestReviewMeasurement',
        conditionId: target.conditionId,
        trialIndex: target.trialIndex,
      });
      if (nextSession?.execution?.cursor) onExecution();
    }
  };
  return (
    <CompletionScaffold
      title="누락·이상 검토"
      {...resource}
      onBack={onBack}
      action={
        <ActionShelf
          safeArea
          layout="single"
          primary={
            state?.allValid
              ? '장치 정리로 이동'
              : state?.activeRequest
                ? '현재 재측정으로 돌아가기'
                : target
                  ? `${target.label} 조건 ${target.trialIndex}회차 재측정`
                  : '필수 측정 확인'
          }
          disabled={
            loading ||
            !state?.available ||
            (!state.canCleanup &&
              !state.canRemeasure &&
              !state.activeRequest &&
              session?.phase !== 'cleaningUp')
          }
          loading={pending}
          onPrimary={() => {
            void next();
          }}
        />
      }
    >
      {session && state?.available ? (
        <>
          <View style={completionStyles.identity}>
            <AppText variant="caption" color={colors.text.secondary}>
              {completionStep(session, 14)}
            </AppText>
            <StatusBadge
              label={state.allValid ? '검사 완료' : `${state.issues.length}건 확인`}
              tone={state.allValid ? 'success' : 'warning'}
            />
          </View>
          <AppText variant="heading" accessibilityRole="header">
            {'종료 전에 누락과\n재측정을 확인하세요'}
          </AppText>
          <AppText color={colors.text.secondary}>
            유효한 {state.required}회 측정이 있어야 정리 단계로 이동할 수 있습니다.
          </AppText>
          <CompletionConditions
            items={state.conditions}
            state={state.allValid ? 'complete' : 'issue'}
            currentIndex={session.procedure.execution?.conditions.findIndex(
              (item) => item.id === target?.conditionId,
            )}
            onSelect={(index) => setSelected(session.procedure.execution!.conditions[index].id)}
          />
          <FeedbackPanel
            title={
              state.allValid
                ? `유효 측정 ${state.required}회가 확인되었습니다`
                : conditionIssue
                  ? `${conditionIssue.label} 조건 ${conditionIssue.trialIndex}회차가 부족해요`
                  : `${condition?.label} 조건의 유효 측정이 확인되었습니다`
            }
            subtitle={
              state.allValid
                ? '새 측정 근거를 확인했습니다. 장치 정리 단계로 이동하세요.'
                : `유효 측정 ${state.slots.filter((slot) => slot.conditionId === conditionId && slot.valid).length}건 · 무효 ${history.filter((attempt) => ['held', 'error', 'superseded'].includes(attempt.status)).length}건${conditionIssue ? ' · 필수' : ''}`
            }
            tone={state.allValid || !conditionIssue ? 'success' : 'warning'}
            icon={state.allValid || !conditionIssue ? 'check' : 'alert'}
          />
          {history.map((attempt) => {
            const valid = acceptedMeasurement(session, attempt);
            const reading = measurementReading(attempt, 'illuminance');
            const replaced =
              !valid &&
              (session.completion?.reviewRequests.some(
                (request) =>
                  request.replacesAttemptIds.includes(attempt.attemptId) &&
                  history.some(
                    (item) =>
                      item.attemptId === request.acceptedAttemptId &&
                      acceptedMeasurement(session, item),
                  ),
              ) ||
                session.execution?.recoveries?.some(
                  (recovery) =>
                    recovery.blockedAttemptId === attempt.attemptId &&
                    history.some(
                      (item) =>
                        item.recoveryId === recovery.recoveryId &&
                        acceptedMeasurement(session, item),
                    ),
                ));
            return (
              <CompletionTimeline
                key={attempt.attemptId}
                title={`${replaced ? '이전 ' : ''}${attempt.cursor.trialIndex}회차${attempt.purpose === 'remeasurement' ? ' 재측정' : ''} · ${valid ? `${reading?.value ?? '—'} ${reading?.unit ?? 'lx'} · 유효` : ['error', 'held', 'superseded', 'valid'].includes(attempt.status) ? (replaced ? '무효 기록 보존' : '무효') : '미확인'}`}
                subtitle={`${recordedTime(attempt.confirmedAt ?? attempt.receivedAt ?? attempt.requestedAt)} · ${valid ? '작업자 확인과 센서 근거 기록' : (attempt.issue?.message ?? '새 유효 측정이 필요합니다.')}`}
                state={valid ? 'valid' : 'invalid'}
              />
            );
          })}
          {state.slots
            .filter((slot) => slot.conditionId === conditionId && slot.history.length === 0)
            .map((slot) => (
              <CompletionTimeline
                key={slot.trialIndex}
                title={`${slot.trialIndex}회차 · 누락`}
                subtitle="아직 확인된 측정 기록이 없습니다."
                state="pending"
              />
            ))}
          <View style={completionStyles.row}>
            <MetricTile
              style={[completionStyles.flex, completionStyles.metric]}
              title="유효 측정"
              value={`${state.validCount} / ${state.required}`}
              tone={state.allValid ? 'success' : 'warning'}
            />
            <MetricTile
              style={[completionStyles.flex, completionStyles.metric]}
              title="보류·재측정"
              value={`${state.heldCount + state.remeasurementCount}`}
              meta="건"
              tone="neutral"
            />
          </View>
          <View style={completionStyles.note}>
            <Icon name="lock" size={15} color={colors.text.secondary} />
            <AppText variant="caption" color={colors.text.secondary} style={completionStyles.flex}>
              무효 기록은 삭제하지 않고 새 측정 결과와 연결합니다.
            </AppText>
          </View>
        </>
      ) : !loading && session ? (
        <UnavailableCompletion />
      ) : null}
    </CompletionScaffold>
  );
}
