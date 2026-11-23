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
import type { ExperimentSession } from '../domain/models';
import { useWorkflowSession } from '../state/useWorkflowSession';
import { ExecutionInfoSheet } from './ExecutionInfoSheet';

function isPaused(session: ExperimentSession | undefined | null) {
  return session?.source === 'api'
    ? session.phase === 'held' && session.holdReason?.code === 'USER_PAUSED'
    : session?.phase === 'paused';
}

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
  const { session, loading, pending, error, execute, canRetryCommand, retryCommand, refresh } =
    useWorkflowSession(sessionId);
  const mock = session?.source === 'mock';
  const cursor = session?.execution?.cursor;
  const condition = session?.procedure.execution?.conditions.find(
    (item) => item.id === cursor?.conditionId,
  );
  const canPause = mock ? selectExecution(session).authorized : session?.phase === 'running';
  const [info, setInfo] = useState(false);
  const pause = async () => {
    if (loading || pending) return;
    if (canRetryCommand) {
      if (isPaused(await retryCommand())) onPause();
    } else if (canPause && cursor) {
      if (isPaused(await execute({ type: 'pauseExecution', cursorId: cursor.cursorId }))) onPause();
    }
  };
  return (
    <SafeAreaView style={styles.root} edges={['top']} testID="session-menu-screen">
      <StatusBar tone="light" />
      <AppBar
        title="처리 결과"
        mode="back"
        onBack={onExecution}
        onMore={mock ? () => setInfo(true) : undefined}
      />
      <ScrollView contentContainerStyle={styles.content}>
        <FeedbackPanel
          title="실험 작업 메뉴"
          subtitle="현재 단계와 측정 회차를 유지합니다."
          icon="guidance"
        />
        {loading ? <AppText>세션을 불러오고 있습니다.</AppText> : null}
        {error ? (
          <>
            <FeedbackPanel title="세션 상태를 확인해 주세요" subtitle={error} tone="danger" />
            {!session && !canRetryCommand ? (
              <Button label="세션 상태 다시 불러오기" variant="secondary" onPress={refresh} />
            ) : null}
          </>
        ) : null}
        {session ? (
          <>
            <Button
              label={canRetryCommand ? '이전 요청 다시 시도' : '실험 일시정지'}
              icon="pause"
              variant="secondary"
              disabled={loading || pending || (!canRetryCommand && (!canPause || !cursor))}
              loading={pending}
              onPress={() => {
                void pause();
              }}
            />
            {mock ? (
              <Button
                label="장치 상태 확인"
                icon="device"
                variant="secondary"
                onPress={onDeviceStatus}
              />
            ) : null}
            {cursor ? (
              <AppText variant="caption" color={colors.text.secondary}>
                {condition?.label ?? cursor.conditionId} 조건 · {cursor.trialIndex}회차 · 절차{' '}
                {procedureVersionLabel(session.procedure.version)}
              </AppText>
            ) : null}
            {mock ? (
              <AppText variant="caption" color={colors.text.secondary}>
                시뮬레이션 · 일시정지는 앱 상태를 보관하며 실제 장치를 제어하지 않습니다.
              </AppText>
            ) : null}
            {isPaused(session) ? (
              <Button label="일시정지 기록 확인" variant="secondary" onPress={onPause} />
            ) : null}
          </>
        ) : null}
      </ScrollView>
      <ActionShelf safeArea primary="현재 작업으로 돌아가기" onPrimary={onExecution} />
      {mock ? (
        <ExecutionInfoSheet
          session={session}
          pending={pending}
          open={info}
          onClose={() => setInfo(false)}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface.canvas },
  content: { padding: spacing[24], paddingTop: spacing[32], gap: spacing[20] },
});
