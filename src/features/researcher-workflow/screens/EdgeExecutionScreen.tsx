import { useEffect, useMemo, useState, type ReactNode } from 'react';
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
import { currentEdgeHold } from '../domain/edge-hold';
import { selectEdgeRecovery } from '../domain/edge-recovery';
import { needsEdgeRemeasurement } from '../domain/edge-remeasurement';
import { isUserPaused } from '../domain/resume';
import { voiceChoiceLabels } from '../domain/voice-clarification';
import { withEdgeMeasurement } from '../infrastructure/edge/edge-measurement';
import {
  createEdgeSessionRequest,
  type EdgeSessionRequest,
} from '../infrastructure/edge/edge-session-request';
import { WorkflowProvider, useWorkflowRepository } from '../state/WorkflowProvider';
import { EdgeVoiceInput } from './EdgeVoiceInput';
import { useEdgeExecutionHeartbeat } from './useEdgeExecutionHeartbeat';
import { useExecutionSession } from './useExecutionSession';

type Props = {
  sessionId: string;
  onDeviceCheck: () => void;
  onMenu: () => void;
  onPause: () => void;
  onRecovery: () => void;
  onClarification: () => void;
  onHome: () => void;
  renderCompletion: (
    phase: 'awaitingCleanup' | 'readyToSubmit' | 'completed',
    outputFailed: boolean,
  ) => ReactNode;
};

const POLL_INTERVAL_MS = 600;
// Edge allows up to 30 seconds for settling. Leave time for the result read.
const POLL_LIMIT_MS = 45_000;
const deadlines = new WeakMap<
  WorkflowRepository,
  Map<string, { attemptId: string; expiresAt: number }>
>();

function sessionDeadlines(repository: WorkflowRepository) {
  const current = deadlines.get(repository) ?? new Map();
  deadlines.set(repository, current);
  return current;
}

export function EdgeExecutionScreen(props: Props) {
  const base = useWorkflowRepository();
  const { selection } = useEntrySelection();
  const token =
    selection && 'edgeToken' in selection && typeof selection.edgeToken === 'string'
      ? selection.edgeToken
      : undefined;
  const request = useMemo(
    () =>
      createEdgeSessionRequest(process.env.EXPO_PUBLIC_HANDSON_EDGE_BASE_URL?.trim() ?? '', token),
    [token],
  );
  const repository = useMemo(() => withEdgeMeasurement(base, request), [base, request]);
  return (
    <WorkflowProvider repository={repository}>
      <EdgeMeasurementContent {...props} base={base} request={request} />
    </WorkflowProvider>
  );
}

function EdgeMeasurementContent({
  sessionId,
  onDeviceCheck,
  onMenu,
  onPause,
  onRecovery,
  onClarification,
  onHome,
  renderCompletion,
  base,
  request,
}: Props & { base: WorkflowRepository; request: EdgeSessionRequest }) {
  const {
    session,
    loading,
    error,
    refresh,
    execute,
    pending,
    canRetryCommand,
    retryCommand,
    heartbeat,
    onHeaderBack,
    retryPause,
  } = useExecutionSession(sessionId, onDeviceCheck, onPause);
  useEdgeExecutionHeartbeat(session?.phase === 'running', heartbeat);
  const repository = useWorkflowRepository();
  const focused = useIsFocused();
  const [stoppedPoll, setStoppedPoll] = useState<{
    attemptId: string;
    reason: 'error' | 'timeout';
  }>();
  const sampling = session?.phase === 'running' && session.pendingJob?.kind === 'sample';
  const samplingAttemptId = sampling ? session?.pendingJob?.attemptId : undefined;
  const pollStopReason =
    stoppedPoll?.attemptId === samplingAttemptId ? stoppedPoll?.reason : undefined;
  const sessionLoaded = !!session;
  useEffect(() => {
    if (sessionLoaded && !samplingAttemptId) sessionDeadlines(base).delete(sessionId);
  }, [base, sessionId, sessionLoaded, samplingAttemptId]);

  useEffect(() => {
    if (!focused || !samplingAttemptId || pending || canRetryCommand || pollStopReason) return;
    const attemptId = samplingAttemptId;
    const stored = sessionDeadlines(base).get(sessionId);
    const expiresAt =
      stored?.attemptId === attemptId ? stored.expiresAt : Date.now() + POLL_LIMIT_MS;
    sessionDeadlines(base).set(sessionId, { attemptId, expiresAt });
    let active = true;
    let timer = setTimeout(poll, POLL_INTERVAL_MS);
    const deadline = setTimeout(() => stop('timeout'), Math.max(0, expiresAt - Date.now()));

    function cleanup() {
      active = false;
      clearTimeout(timer);
      clearTimeout(deadline);
    }

    function stop(reason: 'error' | 'timeout') {
      cleanup();
      setStoppedPoll({ attemptId, reason });
    }

    async function poll() {
      if (Date.now() >= expiresAt) {
        stop('timeout');
        return;
      }
      try {
        await repository.getSession(sessionId);
        // An unchanged or older snapshot may not produce a subscriber update.
        if (active) timer = setTimeout(poll, POLL_INTERVAL_MS);
      } catch {
        if (active) stop('error');
      }
    }
    return cleanup;
  }, [
    base,
    focused,
    repository,
    sessionId,
    samplingAttemptId,
    pending,
    canRetryCommand,
    pollStopReason,
  ]);

  const cursor = session?.phase === 'running' ? session.execution?.cursor : null;
  const activeCursor = session?.execution?.cursor;
  const attempt = session?.execution?.attempts
    .slice()
    .reverse()
    .find((item) =>
      session.phase === 'completed'
        ? item.status === 'valid'
        : item.cursor.cursorId === activeCursor?.cursorId,
    );
  const needsFreshSample =
    !!cursor &&
    !!session?.hold?.resolvedAt &&
    session.hold.cursorId === cursor.cursorId &&
    session.hold.nextSampleCommand === 'requestExecutionSample';
  const canSample = Boolean(
    cursor &&
    !session?.pendingJob &&
    !session?.execution?.pendingVoice &&
    !needsEdgeRemeasurement(session) &&
    (needsFreshSample || attempt?.purpose !== 'recoveryCheck') &&
    !pending &&
    !canRetryCommand,
  );
  const canComplete =
    canSample &&
    attempt?.purpose !== 'recoveryCheck' &&
    attempt?.status === 'ready' &&
    attempt.report?.source === 'api' &&
    attempt.report.cursorId === cursor?.cursorId &&
    attempt.report.attemptId === attempt.attemptId;
  const conditions = session?.procedure.execution?.conditions;
  const condition = conditions?.find((item) => item.id === cursor?.conditionId);
  const first = cursor?.trialIndex === 1 && cursor.conditionId === conditions?.[0]?.id;
  const recovery = selectEdgeRecovery(session);
  const pendingVoice = session?.execution?.pendingVoice;
  const lastVoiceResolution = session?.execution?.voiceResolutions?.at(-1);
  const hold = currentEdgeHold(session);
  const userPaused = isUserPaused(session);
  const canConfirmOtherHold =
    !userPaused &&
    session?.resumePolicyVersion === '2.0' &&
    hold?.allowedCommands.includes('resume');
  const requestSampleAvailable =
    canSample && (needsFreshSample || attempt?.purpose !== 'remeasurement');

  if (
    session &&
    !pending &&
    !canRetryCommand &&
    (session.phase === 'awaitingCleanup' ||
      session.phase === 'readyToSubmit' ||
      (session.phase === 'completed' && session.workflowVersion === '2.0'))
  ) {
    return renderCompletion(session.phase, session.cleanup?.attempts.at(-1)?.status === 'failed');
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']} testID="execution-screen">
      <StatusBar tone="light" />
      <AppBar
        title="핵심 실행 화면"
        mode="back"
        onBack={onHeaderBack}
        onMore={cursor ? onMenu : undefined}
        navigationDisabled={loading || pending}
      />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {session ? <AppText variant="title">{session.procedure.title}</AppText> : null}
        {session?.dataOrigin === 'simulation' ? (
          <AppText variant="caption">모의 장치</AppText>
        ) : null}
        {loading ? (
          <AppText accessibilityLiveRegion="polite">실험 상태를 불러오고 있습니다.</AppText>
        ) : null}
        {error || canRetryCommand ? (
          <>
            <FeedbackPanel
              title="실험 요청 상태를 확인해 주세요"
              subtitle={error ?? '같은 요청을 다시 시도해 서버 상태를 확인해 주세요.'}
              tone="danger"
            />
            <Button
              label={canRetryCommand ? '같은 요청 다시 시도' : '실험 상태 다시 불러오기'}
              variant="secondary"
              disabled={pending}
              onPress={retryPause ?? (canRetryCommand ? retryCommand : refresh)}
            />
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
            <Button
              label="현재 회차 측정값 확인"
              variant="secondary"
              loading={sampling}
              disabled={!requestSampleAvailable}
              onPress={() =>
                void execute({ type: 'requestExecutionSample', cursorId: cursor.cursorId })
              }
            />
            <Button
              label="완료 요청"
              disabled={!canComplete}
              onPress={() => {
                if (attempt) {
                  void execute({
                    type: 'completeExecutionStep',
                    cursorId: cursor.cursorId,
                    sampleAttemptId: attempt.attemptId,
                  });
                }
              }}
            />
          </>
        ) : session?.phase === 'completed' ? (
          <>
            <FeedbackPanel
              title="반복 측정 완료"
              subtitle="서버가 마지막 회차의 완료를 확인했습니다."
            />
            <Button label="연구생 홈으로" onPress={onHome} />
          </>
        ) : session?.phase === 'held' && !recovery ? (
          <>
            <FeedbackPanel
              title={userPaused ? '실험이 일시정지되어 있습니다' : '실험이 보류되었습니다'}
              subtitle={session.holdReason?.message}
              tone="warning"
            />
            {userPaused ? (
              <Button label="일시정지 기록 확인" variant="secondary" onPress={onPause} />
            ) : canConfirmOtherHold ? (
              <Button label="센서 오류와 작업 보류 확인" variant="secondary" onPress={onRecovery} />
            ) : null}
          </>
        ) : session && !recovery ? (
          <FeedbackPanel
            title="진행 중인 회차가 없습니다"
            subtitle="장치 점검 화면에서 실험 상태를 확인해 주세요."
          />
        ) : null}
        {recovery ? (
          <Button
            label={recovery.recovered ? '센서 재확인 결과 보기' : '센서 오류와 작업 보류 확인'}
            variant="secondary"
            disabled={pending || canRetryCommand}
            onPress={onRecovery}
          />
        ) : null}
        {attempt ? <AppText variant="caption">측정 시도 ID {attempt.attemptId}</AppText> : null}
        {attempt?.report?.diagnostics.sensors.flatMap((sensor) =>
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
                detail={sensor.issue?.message}
              />
            );
          }),
        )}
        {attempt?.issue ? (
          <FeedbackPanel title="측정 상태 확인" subtitle={attempt.issue.message} tone="danger" />
        ) : null}
        {sampling && !pollStopReason ? (
          <AppText accessibilityLiveRegion="polite">측정 응답을 기다리고 있습니다.</AppText>
        ) : pending ? (
          <AppText accessibilityLiveRegion="polite">서버 응답을 기다리고 있습니다.</AppText>
        ) : null}
        {pollStopReason ? (
          <>
            <FeedbackPanel
              title={
                pollStopReason === 'timeout'
                  ? '측정 결과 대기 시간이 지났습니다'
                  : '측정 결과 조회에 실패했습니다'
              }
              subtitle="같은 측정의 서버 상태를 다시 확인할 수 있습니다."
              tone="danger"
            />
            <Button
              label="측정 결과 다시 조회"
              variant="secondary"
              onPress={() => {
                sessionDeadlines(base).delete(sessionId);
                setStoppedPoll(undefined);
                refresh();
              }}
            />
          </>
        ) : null}
        {lastVoiceResolution ? (
          <AppText variant="caption">
            음성 확인 결과 · {voiceChoiceLabels[lastVoiceResolution.choice]}
          </AppText>
        ) : null}
        {cursor && session ? (
          pendingVoice ? (
            <Button
              label="처리할 음성 명령 확인"
              variant="secondary"
              disabled={pending || canRetryCommand}
              onPress={onClarification}
            />
          ) : (
            <EdgeVoiceInput
              request={request}
              sessionId={sessionId}
              revision={session.revision}
              cursorId={cursor.cursorId}
              canInterpret={canSample}
              canSample={requestSampleAvailable}
              completableAttemptId={canComplete ? attempt?.attemptId : undefined}
              execute={async (command) => {
                const next = await execute(command);
                if (next?.execution?.pendingVoice) onClarification();
                return Boolean(next);
              }}
            />
          )
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface.canvas },
  content: { padding: spacing[24], gap: spacing[12] },
});
