import { useEffect, useMemo, useState } from 'react';
import { useIsFocused } from 'expo-router';
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
import { useEntrySelection } from '@/features/entry/EntrySelectionProvider';
import type { WorkflowRepository } from '../application/WorkflowRepository';
import { selectEdgeRecovery } from '../domain/edge-recovery';
import { withEdgeMeasurement } from '../infrastructure/edge/edge-measurement';
import { createEdgeSessionRequest } from '../infrastructure/edge/edge-session-request';
import { WorkflowProvider, useWorkflowRepository } from '../state/WorkflowProvider';
import { useWorkflowSession } from '../state/useWorkflowSession';

type Props = { sessionId: string; onBack: () => void };
type Deadline = { attemptId: string; expiresAt: number };
const deadlines = new WeakMap<WorkflowRepository, Map<string, Deadline>>();
const POLL_INTERVAL_MS = 600;
const POLL_LIMIT_MS = 45_000;

export function EdgeRecoveryScreen(props: Props) {
  const base = useWorkflowRepository();
  const { selection } = useEntrySelection();
  const token =
    selection && 'edgeToken' in selection && typeof selection.edgeToken === 'string'
      ? selection.edgeToken
      : undefined;
  const repository = useMemo(
    () =>
      withEdgeMeasurement(
        base,
        createEdgeSessionRequest(
          process.env.EXPO_PUBLIC_HANDSON_EDGE_BASE_URL?.trim() ?? '',
          token,
        ),
      ),
    [base, token],
  );
  return (
    <WorkflowProvider repository={repository}>
      <RecoveryContent {...props} base={base} />
    </WorkflowProvider>
  );
}

function RecoveryContent({ sessionId, onBack, base }: Props & { base: WorkflowRepository }) {
  const { session, loading, error, pending, execute, refresh, canRetryCommand, retryCommand } =
    useWorkflowSession(sessionId);
  const repository = useWorkflowRepository();
  const focused = useIsFocused();
  const state = selectEdgeRecovery(session);
  const attemptId = state?.checking ? state.recovery?.sampleAttemptId : undefined;
  const finishedAttemptId =
    state?.recovery && state.recovery.status !== 'checking'
      ? state.recovery.sampleAttemptId
      : undefined;
  const [readFailure, setReadFailure] = useState<{ attemptId: string; message: string }>();
  const readError = readFailure?.attemptId === attemptId ? readFailure?.message : undefined;

  useEffect(() => {
    const stored = deadlines.get(base);
    if (finishedAttemptId && stored?.get(sessionId)?.attemptId === finishedAttemptId) {
      stored.delete(sessionId);
    }
  }, [base, sessionId, finishedAttemptId]);

  useEffect(() => {
    if (!focused || !attemptId || pending || canRetryCommand || readError) return;
    const id = attemptId;
    const stored = deadlines.get(base) ?? new Map<string, Deadline>();
    const existing = stored.get(sessionId);
    const expiresAt = existing?.attemptId === id ? existing.expiresAt : Date.now() + POLL_LIMIT_MS;
    stored.set(sessionId, { attemptId: id, expiresAt });
    deadlines.set(base, stored);
    let active = true;
    let timer = setTimeout(poll, POLL_INTERVAL_MS);
    const deadline = setTimeout(timeout, Math.max(0, expiresAt - Date.now()));

    function cleanup() {
      active = false;
      clearTimeout(timer);
      clearTimeout(deadline);
    }
    function stop(message: string) {
      cleanup();
      setReadFailure({ attemptId: id, message });
    }
    function timeout() {
      stop('센서 재확인 결과 대기 시간이 지났습니다.');
    }
    async function poll() {
      if (!active) return;
      if (Date.now() >= expiresAt) {
        timeout();
        return;
      }
      try {
        await repository.getSession(sessionId);
        if (active) timer = setTimeout(poll, POLL_INTERVAL_MS);
      } catch {
        if (active) stop('센서 재확인 결과를 불러오지 못했습니다.');
      }
    }
    return cleanup;
  }, [base, focused, attemptId, pending, canRetryCommand, readError, repository, sessionId]);

  const condition = session?.procedure.execution?.conditions.find(
    (item) => item.id === state?.cursor.conditionId,
  );
  const reload = () => {
    deadlines.get(base)?.delete(sessionId);
    setReadFailure(undefined);
    refresh();
  };
  return (
    <SafeAreaView style={styles.root} edges={['top']} testID="edge-recovery-screen">
      <StatusBar tone="light" />
      <AppBar title="센서 오류와 작업 보류" mode="back" onBack={onBack} />
      <ScrollView contentContainerStyle={styles.content}>
        {loading ? (
          <AppText accessibilityLiveRegion="polite">작업 상태를 불러오고 있습니다.</AppText>
        ) : null}
        {error || readError || canRetryCommand ? (
          <>
            <FeedbackPanel
              title="센서 재확인 상태를 확인해 주세요"
              subtitle={readError ?? error ?? '같은 요청을 다시 시도해 주세요.'}
              tone="danger"
            />
            <Button
              label={canRetryCommand ? '같은 요청 다시 시도' : '복구 결과 다시 조회'}
              variant="secondary"
              disabled={pending}
              onPress={canRetryCommand ? retryCommand : reload}
            />
          </>
        ) : null}
        {state ? (
          <>
            <AppText variant="heading">
              {condition?.label ?? state.cursor.conditionId} 조건 · {state.cursor.trialIndex}회차
            </AppText>
            <AppText variant="caption">회차 ID {state.cursor.cursorId}</AppText>
            <AppText variant="caption">차단된 측정 시도 ID {state.blocked.attemptId}</AppText>
            <FeedbackPanel
              title="측정 오류"
              subtitle={state.blocked.issue?.message}
              tone="danger"
            />
            {state.recovery ? (
              <>
                <AppText variant="caption">복구 ID {state.recovery.recoveryId}</AppText>
                <AppText variant="caption">재확인 시도 ID {state.recovery.sampleAttemptId}</AppText>
              </>
            ) : null}
            {state.checking && !readError ? (
              <AppText accessibilityLiveRegion="polite">
                센서 재확인 결과를 기다리고 있습니다.
              </AppText>
            ) : null}
            {state.recovery?.status === 'failed' ? (
              <FeedbackPanel
                title="센서 재확인 실패"
                subtitle={state.recovery.issue?.message}
                tone="danger"
              />
            ) : null}
            {state.recovered ? (
              <FeedbackPanel
                title="센서 재확인 완료"
                subtitle="현재 회차에서 새 측정을 해야 완료할 수 있습니다."
                tone="success"
              />
            ) : (
              <Button
                label="센서 다시 확인"
                loading={pending || (state.checking && !readError)}
                disabled={!state.canRecover || pending || canRetryCommand}
                onPress={() =>
                  void execute({
                    type: 'requestRecovery',
                    cursorId: state.cursor.cursorId,
                    blockedAttemptId: state.blocked.attemptId,
                  })
                }
              />
            )}
          </>
        ) : session ? (
          <FeedbackPanel title="복구할 측정 오류가 없습니다" />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface.canvas },
  content: { padding: spacing[24], gap: spacing[12] },
});
