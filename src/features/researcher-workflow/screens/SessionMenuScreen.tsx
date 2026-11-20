import { procedureVersionLabel } from './procedure-version-label';
import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ActionShelf,
  AppBar,
  AppText,
  Button,
  FeedbackPanel,
  StatusBar,
  colors,
  spacing,
} from '@/design-system';
import { selectExecution } from '../domain/execution';
import { useWorkflowSession } from '../state/useWorkflowSession';
import { ExecutionInfoSheet } from './ExecutionInfoSheet';

export function SessionMenuScreen({
  sessionId,
  onExecution,
  onDeviceStatus,
  onPause,
}: {
  sessionId: string;
  onExecution: () => void;
  onDeviceStatus: () => void;
  onPause: () => void;
}) {
  const { session, loading, pending, error, execute } = useWorkflowSession(sessionId);
  const state = session ? selectExecution(session) : null;
  const [info, setInfo] = useState(false);
  const pause = async () => {
    if (pending || !state?.authorized || !state.cursor) return;
    const next = await execute({ type: 'pauseExecution', cursorId: state.cursor.cursorId });
    if (next?.phase === 'paused') onPause();
  };
  return (
    <SafeAreaView style={styles.root} edges={['top']} testID="session-menu-screen">
      <StatusBar tone="light" />
      <AppBar title="처리 결과" mode="back" onBack={onExecution} onMore={() => setInfo(true)} />
      <ScrollView contentContainerStyle={styles.content}>
        <FeedbackPanel
          title="실험 작업 메뉴"
          subtitle="현재 단계와 측정 회차를 유지합니다."
          icon="guidance"
        />
        {loading ? <AppText>세션을 불러오고 있습니다.</AppText> : null}
        {error ? (
          <FeedbackPanel title="세션 상태를 확인해 주세요" subtitle={error} tone="danger" />
        ) : null}
        {session ? (
          <>
            <Button
              label="실험 일시정지"
              icon="pause"
              variant="secondary"
              disabled={loading || pending || !state?.authorized || !state.cursor}
              loading={pending}
              onPress={() => {
                void pause();
              }}
            />
            <Button
              label="장치 상태 확인"
              icon="device"
              variant="secondary"
              onPress={onDeviceStatus}
            />
            {state?.cursor ? (
              <AppText variant="caption" color={colors.text.secondary}>
                {state.condition?.label} 조건 · {state.cursor.trialIndex}회차 · 절차{' '}
                {procedureVersionLabel(session.procedure.version)}
              </AppText>
            ) : null}
            {session.source === 'mock' ? (
              <AppText variant="caption" color={colors.text.secondary}>
                시뮬레이션 · 일시정지는 앱 상태를 보관하며 실제 장치를 제어하지 않습니다.
              </AppText>
            ) : null}
            {session.phase === 'paused' ? (
              <Button label="일시정지 기록 확인" variant="secondary" onPress={onPause} />
            ) : null}
          </>
        ) : null}
      </ScrollView>
      <ActionShelf safeArea primary="현재 작업으로 돌아가기" onPrimary={onExecution} />
      <ExecutionInfoSheet
        session={session}
        pending={pending}
        open={info}
        onClose={() => setInfo(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface.canvas },
  content: { padding: spacing[24], paddingTop: spacing[32], gap: spacing[20] },
});
