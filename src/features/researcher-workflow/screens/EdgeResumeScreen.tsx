import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ActionShelf,
  AppBar,
  AppText,
  Button,
  CheckboxRow,
  FeedbackPanel,
  StatusBar,
  colors,
  spacing,
} from '@/design-system';
import { useWorkflowSession } from '../state/useWorkflowSession';

export function EdgeResumeScreen({
  sessionId,
  onBack,
  onExecution,
}: {
  sessionId: string;
  onBack: () => void;
  onExecution: () => void;
}) {
  const { session, loading, error, pending, execute, refresh, canRetryCommand, retryCommand } =
    useWorkflowSession(sessionId);
  const [confirmedRevision, setConfirmedRevision] = useState<number | null>(null);
  const cursor = session?.execution?.cursor;
  const paused = session?.phase === 'held' && session.holdReason?.code === 'USER_PAUSED';
  const confirmed = confirmedRevision === session?.revision;
  const condition = session?.procedure.execution?.conditions.find(
    (item) => item.id === cursor?.conditionId,
  );

  const resume = async () => {
    if (pending || !cursor) return;
    if (!canRetryCommand && (!paused || !confirmed)) return;
    setConfirmedRevision(null);
    const next = canRetryCommand
      ? await retryCommand()
      : await execute({ type: 'resumePausedExecution', cursorId: cursor.cursorId });
    if (next?.phase === 'running' && next.execution?.cursor?.cursorId === cursor.cursorId) {
      onExecution();
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']} testID="resume-screen">
      <StatusBar tone="light" />
      <AppBar title="재개 전 재확인" mode="back" onBack={onBack} />
      <ScrollView contentContainerStyle={styles.content}>
        {loading ? (
          <AppText accessibilityLiveRegion="polite">재개 전 상태를 불러오고 있습니다.</AppText>
        ) : null}
        {error ? (
          <FeedbackPanel title="실험을 재개하지 못했어요" subtitle={error} tone="danger" />
        ) : null}
        {paused && cursor ? (
          <>
            <AppText variant="heading" accessibilityRole="header">
              {condition?.label ?? cursor.conditionId} 조건 · {cursor.trialIndex}회차부터 재개
            </AppText>
            <AppText>서버가 현재 장치와 센서 상태를 확인하고, 점검을 통과하면 재개합니다.</AppText>
            <CheckboxRow
              title="작업 환경을 재확인했어요"
              subtitle="현재 회차의 실험 조건과 장치 설치 상태를 확인해 주세요."
              checked={confirmed}
              disabled={pending || canRetryCommand}
              onChange={(checked) => setConfirmedRevision(checked ? session.revision : null)}
            />
          </>
        ) : !loading && !canRetryCommand ? (
          session ? (
            <FeedbackPanel
              title="재개할 수 있는 일시정지 기록이 없어요"
              subtitle="이전 화면에서 현재 실험 상태를 확인해 주세요."
            />
          ) : (
            <Button label="재개 상태 다시 불러오기" variant="secondary" onPress={refresh} />
          )
        ) : null}
      </ScrollView>
      <ActionShelf
        safeArea
        primary={canRetryCommand ? '재개 요청 다시 시도' : '장치 점검하고 재개'}
        loading={pending}
        disabled={loading || pending || !cursor || (!canRetryCommand && (!paused || !confirmed))}
        onPrimary={() => void resume()}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface.canvas },
  content: { padding: spacing[24], gap: spacing[12] },
});
