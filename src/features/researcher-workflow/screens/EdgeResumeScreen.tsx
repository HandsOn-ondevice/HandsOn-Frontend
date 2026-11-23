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
import { currentEdgeHold } from '../domain/edge-hold';
import type { ExperimentSession } from '../domain/models';
import { useWorkflowSession } from '../state/useWorkflowSession';
import { EdgeHoldConfirmation, useEdgeHoldConfirmation } from './EdgeHoldConfirmation';

export function EdgeResumeScreen({
  sessionId,
  onBack,
  onContinue,
  onOtherHold,
}: {
  sessionId: string;
  onBack: () => void;
  onContinue: (session: ExperimentSession) => void;
  onOtherHold: () => void;
}) {
  const { session, loading, error, pending, execute, refresh, canRetryCommand, retryCommand } =
    useWorkflowSession(sessionId);
  const confirmation = useEdgeHoldConfirmation(session);
  const [confirmedRevision, setConfirmedRevision] = useState<number | null>(null);
  const hold = currentEdgeHold(session);
  const cursor = session?.execution?.cursor;
  const legacy = session?.resumePolicyVersion !== '2.0';
  const paused =
    session?.phase === 'held' && (hold?.reasonCode ?? session.holdReason?.code) === 'USER_PAUSED';
  const canResume = paused && (hold?.allowedCommands.includes('resume') ?? legacy);
  const confirmed = confirmedRevision === session?.revision;
  const canSend = canResume && !!cursor && (legacy ? confirmed : confirmation.ready);
  const condition = session?.procedure.execution?.conditions.find(
    (item) => item.id === cursor?.conditionId,
  );

  const resume = async () => {
    if (pending) return;
    if (canRetryCommand) {
      const next = await retryCommand();
      if (next?.phase === 'running') onContinue(next);
      return;
    }
    if (!canSend || !cursor) return;
    const operatorConfirmation = confirmation.take();
    if (confirmation.required && !operatorConfirmation) return;
    setConfirmedRevision(null);
    const next = await execute({
      type: 'resumePausedExecution',
      cursorId: cursor.cursorId,
      ...(operatorConfirmation && { confirmation: operatorConfirmation }),
    });
    if (next?.phase === 'running' && next.execution?.cursor?.cursorId === cursor.cursorId) {
      onContinue(next);
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
        {error || canRetryCommand ? (
          <FeedbackPanel
            title="실험을 재개하지 못했어요"
            subtitle={error ?? '같은 요청을 다시 시도해 주세요.'}
            tone="danger"
          />
        ) : null}
        {pending ? (
          <AppText accessibilityLiveRegion="polite">
            장치와 센서 상태를 다시 확인하고 있습니다.
          </AppText>
        ) : null}
        {paused && cursor ? (
          <>
            <AppText variant="heading" accessibilityRole="header">
              {condition?.label ?? cursor.conditionId} 조건 · {cursor.trialIndex}회차부터 재개
            </AppText>
            <AppText>서버가 현재 장치와 센서 상태를 확인하고, 점검을 통과하면 재개합니다.</AppText>
            {canResume ? (
              legacy ? (
                <CheckboxRow
                  title="작업 환경을 재확인했어요"
                  subtitle="현재 회차의 실험 조건과 장치 설치 상태를 확인해 주세요."
                  checked={confirmed}
                  disabled={pending || canRetryCommand}
                  onChange={(checked) => setConfirmedRevision(checked ? session.revision : null)}
                />
              ) : (
                <EdgeHoldConfirmation value={confirmation} disabled={pending || canRetryCommand} />
              )
            ) : (
              <FeedbackPanel title="현재 보류 상태에서 실행할 수 있는 동작이 없어요" />
            )}
          </>
        ) : !loading && !canRetryCommand && session ? (
          session.phase === 'held' ? (
            <Button label="현재 보류 상태 확인" variant="secondary" onPress={onOtherHold} />
          ) : (
            <Button
              label="현재 실험으로 이동"
              variant="secondary"
              onPress={() => onContinue(session)}
            />
          )
        ) : null}
        {!loading && !pending && !canRetryCommand && (error || !session) ? (
          <Button label="재개 상태 다시 불러오기" variant="secondary" onPress={refresh} />
        ) : null}
      </ScrollView>
      <ActionShelf
        safeArea
        primary={canRetryCommand ? '재개 요청 다시 시도' : '장치 점검하고 재개'}
        loading={pending}
        disabled={loading || pending || (!canRetryCommand && !canSend)}
        onPrimary={() => void resume()}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface.canvas },
  content: { padding: spacing[24], gap: spacing[12] },
});
