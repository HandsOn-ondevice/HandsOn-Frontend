import { procedureVersionLabel } from './procedure-version-label';
import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ActionShelf,
  AppBar,
  AppText,
  Button,
  ConditionProgress,
  FeedbackPanel,
  StatusBar,
  StepProgress,
  VoicePanel,
  colors,
  spacing,
} from '@/design-system';
import { selectExecution, selectLastValidMeasurement } from '../domain/execution';
import { voiceChoiceLabels } from '../domain/voice-clarification';
import { procedureDisplayTitle } from './procedure-display-title';
import { ExecutionMetrics } from './ExecutionMetrics';
import { ExecutionInfoSheet } from './ExecutionInfoSheet';
import { useExecutionSession } from './useExecutionSession';

export function ExecutionScreen({
  sessionId,
  onDeviceCheck,
  onClarification,
  onRecovery,
  onRemeasurement,
  onPause,
  onMenu,
}: {
  sessionId: string;
  onDeviceCheck: () => void;
  onClarification: () => void;
  onRecovery?: () => void;
  onRemeasurement?: () => void;
  onPause: () => void;
  onMenu?: () => void;
}) {
  const { session, loading, pending, error, refresh, execute, onHeaderBack, retryPause } =
    useExecutionSession(sessionId, onDeviceCheck, onPause);
  const [menu, setMenu] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const state = session ? selectExecution(session) : null;
  const guidance = state?.cursor
    ? `${state.condition?.label ?? ''} 출력 · ${state.cursor.trialIndex}회차\n측정을 진행하세요`
    : '반복 측정 상태';
  const clarify = async () => {
    if (state?.pendingVoice) {
      onClarification();
      return;
    }
    if (!state?.cursor) return;
    const next = await execute({
      type: 'requestVoiceClarification',
      cursorId: state.cursor.cursorId,
      utterance: '다시 해줘',
    });
    if (next?.execution?.pendingVoice) onClarification();
  };
  const complete = () => {
    if (!state?.cursor || !state.latest) return;
    void execute({
      type: 'completeExecutionStep',
      cursorId: state.cursor.cursorId,
      sampleAttemptId: state.latest.attemptId,
    });
  };
  return (
    <SafeAreaView style={styles.root} edges={['top']} testID="execution-screen">
      <StatusBar tone="light" />
      <AppBar
        title="핵심 실행 화면"
        mode="back"
        onBack={onHeaderBack}
        onMore={onMenu ?? (() => setMenu(true))}
        navigationDisabled={loading || pending}
      />
      <ScrollView contentContainerStyle={styles.content}>
        <AppText variant="title" accessibilityRole="header">
          {procedureDisplayTitle(session?.procedure)}
        </AppText>
        {session?.execution?.voiceResolutions?.slice(-1).map((result) => (
          <AppText key={result.commandId} variant="caption" accessibilityLiveRegion="polite">
            선택한 명령: {voiceChoiceLabels[result.choice]} ·{' '}
            {result.choice === 'repeatGuidance'
              ? '안내를 화면에 표시했습니다'
              : result.choice === 'remeasure'
                ? '같은 회차의 측정값 확인 요청'
                : '측정 상태 유지'}
          </AppText>
        ))}
        {loading ? (
          <AppText accessibilityLiveRegion="polite">실험 상태를 불러오고 있습니다.</AppText>
        ) : null}
        {error || retryPause ? (
          <>
            <FeedbackPanel
              title="요청을 처리하지 못했습니다"
              subtitle={error ?? '같은 요청을 다시 시도해 저장 상태를 확인해 주세요.'}
              tone="danger"
              icon="alert"
            />
            <Button
              label={retryPause ? '같은 요청 다시 시도' : '실험 상태 다시 불러오기'}
              onPress={retryPause ?? refresh}
              disabled={pending}
              variant="secondary"
            />
          </>
        ) : null}
        {session && state ? (
          <>
            <AppText variant="caption">
              절차 {procedureVersionLabel(session.procedure.version)}
            </AppText>
            {state.authorized && state.configured ? (
              <>
                <StepProgress
                  title={`유효 측정 ${state.completedCount} / ${state.total}회`}
                  value={state.percentage}
                  state={
                    state.completed
                      ? 'complete'
                      : state.latest?.status === 'held'
                        ? 'paused'
                        : 'running'
                  }
                />
                <ConditionProgress
                  items={state.conditions}
                  currentIndex={state.currentIndex}
                  state={
                    state.completed
                      ? 'complete'
                      : state.latest?.status === 'held' || state.latest?.status === 'error'
                        ? 'issue'
                        : 'running'
                  }
                />
              </>
            ) : null}
            <FeedbackPanel
              title={
                session.phase === 'paused'
                  ? '실험이 일시정지되어 있습니다'
                  : !state.authorized
                    ? '실험 진행이 잠겨 있습니다'
                    : state.completed
                      ? '반복 측정 완료'
                      : guidance
              }
              subtitle={
                session.phase === 'paused'
                  ? '재개 전 확인을 완료한 뒤 같은 회차를 이어갈 수 있습니다.'
                  : state.reason
              }
              icon={state.latest?.status === 'error' ? 'alert' : 'guidance'}
              tone={
                state.latest?.status === 'error'
                  ? 'danger'
                  : state.latest?.status === 'held'
                    ? 'warning'
                    : state.completed
                      ? 'success'
                      : 'info'
              }
            />
            {session.phase === 'paused' ? (
              <Button label="일시정지 기록 확인" variant="secondary" onPress={onPause} />
            ) : null}
            {state.authorized && state.configured ? (
              <>
                <ExecutionMetrics
                  attempt={state.completed ? selectLastValidMeasurement(session) : state.latest}
                  completed={state.completed}
                  conditions={session.procedure.execution?.conditions}
                />
                <VoicePanel
                  title={state.pendingVoice ? '음성 명령 확인 대기' : '말씀하세요'}
                  subtitle={
                    state.pendingVoice
                      ? '눌러서 ‘다시 해줘’의 뜻을 선택해 주세요.'
                      : state.cursor && state.condition
                        ? `“${state.condition.label} 조건 ${state.cursor.trialIndex}회차 완료했어”`
                        : '현재 측정 회차가 없습니다.'
                  }
                  state={state.pendingVoice ? 'clarify' : 'idle'}
                  onPress={
                    !pending && (state.canClarify || !!state.pendingVoice)
                      ? () => {
                          void clarify();
                        }
                      : undefined
                  }
                />
                <Button
                  label={
                    state.sampling
                      ? '측정값 확인 중'
                      : state.requiresRecovery
                        ? '센서 오류와 작업 보류 확인'
                        : state.requiresRemeasurement
                          ? '복구 후 재측정 안내'
                          : '현재 회차 측정값 확인'
                  }
                  variant="secondary"
                  loading={state.sampling}
                  disabled={
                    pending ||
                    (state.requiresRecovery
                      ? !onRecovery || state.sampling
                      : state.requiresRemeasurement
                        ? !onRemeasurement
                        : !state.canSample)
                  }
                  onPress={() => {
                    if (state.requiresRemeasurement) {
                      onRemeasurement?.();
                      return;
                    }
                    if (state.requiresRecovery) {
                      onRecovery?.();
                      return;
                    }
                    if (state.cursor)
                      void execute({
                        type: 'requestExecutionSample',
                        cursorId: state.cursor.cursorId,
                      });
                  }}
                />
                <AppText variant="caption">
                  센서 응답 확인만으로 작업자 완료가 기록되지 않습니다. 완료 요청은 현재 회차의
                  작업자 확인을 뜻합니다.
                </AppText>
              </>
            ) : null}
          </>
        ) : null}
        {notice ? <AppText accessibilityLiveRegion="polite">{notice}</AppText> : null}
      </ScrollView>
      <ActionShelf
        safeArea
        primary="완료 요청"
        secondary="안내 반복"
        layout="dual"
        loading={pending}
        disabled={loading || !state?.canComplete}
        onPrimary={complete}
        onSecondary={() => setNotice(`안내: ${state?.reason ?? '세션을 확인해 주세요.'}`)}
      />
      <ExecutionInfoSheet
        session={session}
        pending={pending}
        open={menu}
        onClose={() => setMenu(false)}
        onDeviceCheck={onDeviceCheck}
      />
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface.canvas },
  content: { padding: spacing[24], gap: spacing[12] },
});
