import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ActionShelf,
  AppBar,
  AppText,
  BottomSheet,
  Button,
  ConditionProgress,
  FeedbackPanel,
  StatusBar,
  StepProgress,
  VoicePanel,
  colors,
  spacing,
} from '@/design-system';
import { selectExecution } from '../domain/execution';
import { useWorkflowSession } from '../state/useWorkflowSession';
import { ExecutionMetrics } from './ExecutionMetrics';
import { MockExecutionScenarioControl } from './MockExecutionScenarioControl';

export function ExecutionScreen({
  sessionId,
  onBack,
  onClarification,
}: {
  sessionId: string;
  onBack: () => void;
  onClarification: () => void;
}) {
  const { session, loading, pending, error, refresh, execute } = useWorkflowSession(sessionId);
  const [menu, setMenu] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const state = session ? selectExecution(session) : null;
  const guidance = state?.cursor
    ? `${state.condition?.label ?? ''} 출력 · ${state.cursor.trialIndex}회차\n측정을 진행하세요`
    : 'Mock 반복 측정 상태';
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
    <SafeAreaView style={styles.root} edges={['top']}>
      <StatusBar tone="light" />
      <AppBar title="핵심 실행 화면" mode="back" onBack={onBack} onMore={() => setMenu(true)} />
      <ScrollView contentContainerStyle={styles.content}>
        <AppText variant="title" accessibilityRole="header">
          {session?.procedure.title ?? '실험 진행'}
        </AppText>
        <AppText variant="caption">Mock 초안 절차 · 실제 측정·출력 제어·음성 동작 없음</AppText>
        {loading ? (
          <AppText accessibilityLiveRegion="polite">실험 상태를 불러오고 있습니다.</AppText>
        ) : null}
        {error ? (
          <>
            <FeedbackPanel
              title="요청을 처리하지 못했습니다"
              subtitle={error}
              tone="danger"
              icon="alert"
            />
            <Button
              label="실험 상태 다시 불러오기"
              onPress={refresh}
              disabled={pending}
              variant="secondary"
            />
          </>
        ) : null}
        {session && state ? (
          <>
            <AppText variant="caption">
              세션 {session.sessionId} · v{session.procedure.version}
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
                !state.authorized
                  ? '실험 진행이 잠겨 있습니다'
                  : state.completed
                    ? 'Mock 반복 측정 완료'
                    : guidance
              }
              subtitle={state.reason}
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
            {state.authorized && state.configured ? (
              <>
                <ExecutionMetrics attempt={state.latest} />
                <VoicePanel
                  title={
                    state.pendingVoice ? '모호한 음성 확인 대기 · Mock' : '음성 명령 시뮬레이션'
                  }
                  subtitle="눌러서 ‘다시 해줘’ 예시를 확인합니다. 실제 녹음·STT는 실행하지 않습니다."
                  state={state.pendingVoice ? 'clarify' : 'idle'}
                  onPress={
                    !pending && (state.canClarify || !!state.pendingVoice)
                      ? () => {
                          void clarify();
                        }
                      : undefined
                  }
                />
                <MockExecutionScenarioControl
                  key={sessionId}
                  sessionId={sessionId}
                  disabled={pending || state.sampling || !!state.pendingVoice || state.completed}
                />
                <Button
                  label={state.sampling ? 'Mock 응답 확인 중' : '현재 회차 Mock 응답 확인'}
                  variant="secondary"
                  loading={state.sampling}
                  disabled={pending || !state.canSample}
                  onPress={() => {
                    if (state.cursor)
                      void execute({
                        type: 'requestExecutionSample',
                        cursorId: state.cursor.cursorId,
                      });
                  }}
                />
                <AppText variant="caption">
                  안정화 {session.procedure.execution?.settlingSeconds}초는 시나리오 초안입니다.
                  대기·완료를 Mock 결과로 재현하며 실제 타이머 안전 판정을 하지 않습니다.
                </AppText>
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
        onSecondary={() =>
          setNotice(
            `안내 반복 시뮬레이션 · 실제 TTS 없음. ${state?.reason ?? '세션을 확인해 주세요.'}`,
          )
        }
      />
      <BottomSheet open={menu} onClose={() => setMenu(false)} title="현재 작업 정보" icon="flask">
        <AppText>
          일시정지·재개는 S10~S11, 오류 복구 절차는 S08~S09, 종료 검토는 S12 이후 작업입니다. 아직
          구현하지 않았습니다.
        </AppText>
        <AppText>
          화면을 나갔다 돌아와도 현재 회차는 유지됩니다. 앱 재시작·새로고침 시 메모리 Mock 세션은
          초기화됩니다.
        </AppText>
        <Button
          label="S05 장치 점검으로 돌아가기"
          variant="secondary"
          onPress={() => {
            setMenu(false);
            onBack();
          }}
        />
      </BottomSheet>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface.canvas },
  content: { paddingHorizontal: spacing[24], paddingVertical: spacing[16], gap: spacing[8] },
});
