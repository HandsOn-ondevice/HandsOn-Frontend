import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  AppBar,
  AppText,
  Button,
  FeedbackPanel,
  StatusBar,
  colors,
  spacing,
} from '@/design-system';
import { useWorkflowSession } from '../state/useWorkflowSession';

export function EdgeExecutionScreen({
  sessionId,
  onBack,
}: {
  sessionId: string;
  onBack: () => void;
}) {
  const { session, loading, error, refresh } = useWorkflowSession(sessionId);
  const cursor = session?.phase === 'running' ? session.execution?.cursor : null;
  const conditions = session?.procedure.execution?.conditions;
  const condition = conditions?.find((item) => item.id === cursor?.conditionId);
  const first = cursor?.trialIndex === 1 && cursor.conditionId === conditions?.[0]?.id;

  return (
    <SafeAreaView style={styles.root} edges={['top']} testID="execution-screen">
      <StatusBar tone="light" />
      <AppBar title="핵심 실행 화면" mode="back" onBack={onBack} />
      <ScrollView contentContainerStyle={styles.content}>
        {session ? <AppText variant="title">{session.procedure.title}</AppText> : null}
        {loading ? (
          <AppText accessibilityLiveRegion="polite">실험 상태를 불러오고 있습니다.</AppText>
        ) : null}
        {error ? (
          <>
            <FeedbackPanel title="실험 상태를 불러오지 못했어요" subtitle={error} tone="danger" />
            <Button label="실험 상태 다시 불러오기" variant="secondary" onPress={refresh} />
          </>
        ) : null}
        {cursor ? (
          <>
            <AppText variant="heading" accessibilityRole="header">
              {first ? '첫 측정 회차' : '현재 측정 회차'}
            </AppText>
            <AppText>
              조건 {condition?.label ?? cursor.conditionId} · {cursor.trialIndex}회차
            </AppText>
            <AppText variant="caption">회차 ID {cursor.cursorId}</AppText>
          </>
        ) : session ? (
          <FeedbackPanel
            title="진행 중인 회차가 없습니다"
            subtitle="장치 점검 화면에서 실험 상태를 확인해 주세요."
          />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface.canvas },
  content: { padding: spacing[24], gap: spacing[12] },
});
