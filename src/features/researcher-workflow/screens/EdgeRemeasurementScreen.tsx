import { useEffect, useMemo, useState } from 'react';
import { useIsFocused } from 'expo-router';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  AppBar,
  AppText,
  Button,
  FeedbackPanel,
  MetricTile,
  StatusBar,
  colors,
  spacing,
} from '@/design-system';
import { useEntrySelection } from '@/features/entry/EntrySelectionProvider';
import type { WorkflowRepository } from '../application/WorkflowRepository';
import { selectEdgeRemeasurement } from '../domain/edge-remeasurement';
import { withEdgeMeasurement } from '../infrastructure/edge/edge-measurement';
import { createEdgeSessionRequest } from '../infrastructure/edge/edge-session-request';
import { WorkflowProvider, useWorkflowRepository } from '../state/WorkflowProvider';
import { useWorkflowSession } from '../state/useWorkflowSession';

type Props = { sessionId: string; onBack: () => void; onExecution: () => void };
const POLL_INTERVAL_MS = 600;
const POLL_LIMIT_MS = 45_000;
const deadlines = new WeakMap<WorkflowRepository, Map<string, { id: string; expiresAt: number }>>();

function pollingWindow(base: WorkflowRepository, sessionId: string, attemptId: string) {
  const now = Date.now();
  const stored = deadlines.get(base) ?? new Map<string, { id: string; expiresAt: number }>();
  const previous = stored.get(sessionId);
  const expiresAt = previous?.id === attemptId ? previous.expiresAt : now + POLL_LIMIT_MS;
  stored.set(sessionId, { id: attemptId, expiresAt });
  deadlines.set(base, stored);
  return { expiresAt, delay: Math.max(0, expiresAt - now) };
}

export function EdgeRemeasurementScreen(props: Props) {
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
      <RemeasurementContent {...props} base={base} />
    </WorkflowProvider>
  );
}

function RemeasurementContent({
  sessionId,
  onBack,
  onExecution,
  base,
}: Props & { base: WorkflowRepository }) {
  const { session, loading, error, pending, execute, refresh, canRetryCommand, retryCommand } =
    useWorkflowSession(sessionId);
  const repository = useWorkflowRepository();
  const focused = useIsFocused();
  const state = selectEdgeRemeasurement(session);
  const jobId = state?.sampling ? state.attempt?.attemptId : undefined;
  const [failed, setFailed] = useState<{ id: string; message: string }>();
  const readError = failed?.id === jobId ? failed?.message : undefined;
  const finishedId = state?.attempt && !state.sampling ? state.attempt.attemptId : undefined;

  useEffect(() => {
    const stored = deadlines.get(base);
    if (finishedId && stored?.get(sessionId)?.id === finishedId) stored.delete(sessionId);
  }, [base, sessionId, finishedId]);

  useEffect(() => {
    if (!focused || !jobId || pending || canRetryCommand || readError) return;
    const id = jobId;
    const { expiresAt, delay } = pollingWindow(base, sessionId, id);
    let active = true;
    let timer = setTimeout(poll, POLL_INTERVAL_MS);
    const limit = setTimeout(timeout, delay);
    function cleanup() {
      active = false;
      clearTimeout(timer);
      clearTimeout(limit);
    }
    function stop(message: string) {
      cleanup();
      setFailed({ id, message });
    }
    function timeout() {
      stop('재측정 결과 대기 시간이 지났습니다.');
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
        if (active) stop('재측정 결과를 불러오지 못했습니다.');
      }
    }
    return cleanup;
  }, [base, focused, jobId, pending, canRetryCommand, readError, repository, sessionId]);

  const condition = session?.procedure.execution?.conditions.find(
    (item) => item.id === state?.cursor.conditionId,
  );
  const retryRead = () => {
    deadlines.get(base)?.delete(sessionId);
    setFailed(undefined);
    refresh();
  };
  return (
    <SafeAreaView style={styles.root} edges={['top']} testID="edge-remeasurement-screen">
      <StatusBar tone="light" />
      <AppBar title="같은 회차 재측정" mode="back" onBack={onBack} />
      <ScrollView contentContainerStyle={styles.content}>
        {loading ? (
          <AppText accessibilityLiveRegion="polite">실험 상태를 불러오고 있습니다.</AppText>
        ) : null}
        {error || readError || canRetryCommand ? (
          <>
            <FeedbackPanel
              title="재측정 상태를 확인해 주세요"
              subtitle={readError ?? error ?? '같은 요청을 다시 시도해 주세요.'}
              tone="danger"
            />
            <Button
              label={canRetryCommand ? '같은 요청 다시 시도' : '재측정 결과 다시 조회'}
              variant="secondary"
              disabled={pending}
              onPress={canRetryCommand ? retryCommand : retryRead}
            />
          </>
        ) : null}
        {state ? (
          <>
            <AppText variant="heading">
              {condition?.label ?? state.cursor.conditionId} 조건 · {state.cursor.trialIndex}회차
            </AppText>
            <AppText variant="caption">회차 ID {state.cursor.cursorId}</AppText>
            <AppText variant="caption">실패한 측정 시도 ID {state.blocked.attemptId}</AppText>
            {state.blocked.issue ? <AppText>{state.blocked.issue.message}</AppText> : null}
            <AppText variant="caption">복구 ID {state.recovery.recoveryId}</AppText>
            <AppText variant="caption">재확인 시도 ID {state.recovery.sampleAttemptId}</AppText>
            {state.attempt ? (
              <AppText variant="caption">재측정 시도 ID {state.attempt.attemptId}</AppText>
            ) : null}
            {state.attempt?.issue ? (
              <FeedbackPanel
                title="재측정 실패"
                subtitle={state.attempt.issue.message}
                tone="danger"
              />
            ) : null}
            {state.attempt?.report?.diagnostics.sensors.flatMap((sensor) =>
              sensor.readings.map((reading) => {
                const definition = session?.procedure.deviceCheck?.sensors.find(
                  (item) => item.sensorId === sensor.sensorId,
                );
                const metric = definition?.metrics.find((item) => item.id === reading.metricId);
                return (
                  <MetricTile
                    key={sensor.sensorId + ':' + reading.metricId}
                    title={metric?.label ?? reading.metricId}
                    value={reading.value === null ? '—' : String(reading.value)}
                    meta={reading.unit}
                  />
                );
              }),
            )}
            {(state.sampling || pending) && !readError ? (
              <AppText accessibilityLiveRegion="polite">재측정 응답을 기다리고 있습니다.</AppText>
            ) : null}
            <Button
              label="같은 회차 다시 측정"
              loading={pending || (state.sampling && !readError)}
              disabled={!state.canRequest || pending || canRetryCommand}
              onPress={() => {
                if (state.canRequest) {
                  void execute({
                    type: 'requestRecoveryRemeasurement',
                    cursorId: state.cursor.cursorId,
                    recoveryId: state.recovery.recoveryId,
                  });
                }
              }}
            />
            <Button
              label="완료 확인 화면으로 이동"
              disabled={!state.ready || pending || canRetryCommand}
              onPress={onExecution}
            />
          </>
        ) : session ? (
          <FeedbackPanel title="재측정할 회차가 없습니다" />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface.canvas },
  content: { padding: spacing[24], gap: spacing[12] },
});
