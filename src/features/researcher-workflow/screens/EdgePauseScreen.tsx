import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ActionShelf,
  AppBar,
  AppText,
  Button,
  FeedbackPanel,
  StatusBar,
  SurfaceCard,
  colors,
  spacing,
} from '@/design-system';
import { currentEdgeHold } from '../domain/edge-hold';
import { useWorkflowSession } from '../state/useWorkflowSession';
import { procedureVersionLabel } from './procedure-version-label';

export function EdgePauseScreen({
  sessionId,
  onHome,
  onResume,
}: {
  sessionId: string;
  onHome: () => void;
  onResume: () => void;
}) {
  const { session, loading, error, refresh } = useWorkflowSession(sessionId);
  const hold = currentEdgeHold(session);
  const holdReason = session?.holdReason;
  const paused =
    session?.phase === 'held' && (hold?.reasonCode ?? holdReason?.code) === 'USER_PAUSED';
  const canResume =
    paused && (hold?.allowedCommands.includes('resume') ?? session.resumePolicyVersion !== '2.0');
  const cursor = session?.execution?.cursor;
  const condition = session?.procedure.execution?.conditions.find(
    (item) => item.id === cursor?.conditionId,
  );
  const completedCount = session?.execution?.attempts.filter(
    (attempt) => attempt?.status === 'valid',
  ).length;

  return (
    <SafeAreaView style={styles.root} edges={['top']} testID="pause-screen">
      <StatusBar tone="light" />
      <AppBar title="일시정지 확인" mode="back" onBack={onHome} />
      <ScrollView contentContainerStyle={styles.content}>
        <AppText variant="heading" accessibilityRole="header">
          실험 일시정지
        </AppText>
        {loading ? (
          <AppText accessibilityLiveRegion="polite">일시정지 상태를 불러오고 있습니다.</AppText>
        ) : error ? (
          <>
            <FeedbackPanel
              title="일시정지 기록을 확인할 수 없습니다"
              subtitle={error}
              tone="danger"
            />
            <Button label="상태 다시 불러오기" variant="secondary" onPress={refresh} />
          </>
        ) : paused ? (
          <>
            <FeedbackPanel
              title={holdReason?.message ?? '작업자가 실험을 일시정지했어요.'}
              subtitle={session.procedure.title}
            />
            <SurfaceCard>
              <AppText variant="caption">세션 {session.sessionId}</AppText>
              <AppText variant="caption">
                승인 버전 {procedureVersionLabel(session.procedure.version)}
              </AppText>
              {cursor ? (
                <AppText variant="label">
                  다음 작업 · {condition?.label ?? cursor.conditionId} {cursor.trialIndex}회차
                </AppText>
              ) : null}
              {completedCount !== undefined ? (
                <AppText variant="caption">완료한 측정 {completedCount}회</AppText>
              ) : null}
            </SurfaceCard>
          </>
        ) : (
          <FeedbackPanel
            title="작업자가 일시정지한 실험이 아닙니다"
            subtitle="연구생 홈에서 실험 상태를 다시 확인해 주세요."
          />
        )}
      </ScrollView>
      <ActionShelf
        safeArea
        primary="바로 재개"
        secondary="홈으로"
        disabled={loading || !!error || !canResume || !cursor}
        onPrimary={onResume}
        onSecondary={onHome}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface.canvas },
  content: { padding: spacing[24], gap: spacing[12] },
});
