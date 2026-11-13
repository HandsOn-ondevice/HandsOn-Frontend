import { useRef, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ActionShelf,
  AppBar,
  AppText,
  BottomSheet,
  Button,
  FeedbackPanel,
  SensorCard,
  StatusBar,
  TimelineItem,
  VoicePanel,
  colors,
  spacing,
} from '@/design-system';
import { selectRemeasurement } from '../domain/remeasurement';
import { useWorkflowSession } from '../state/useWorkflowSession';
import { useMockDeviceCheckControls } from '../state/WorkflowProvider';
import { MockExecutionScenarioControl } from './MockExecutionScenarioControl';
import { PreviewTools } from './PreviewTools';
import { useMeasurementAge } from './useMeasurementAge';

function recordedTime(value: string) {
  return Number.isFinite(Date.parse(value))
    ? new Date(value).toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      })
    : '시각 확인 불가';
}

export function RemeasurementScreen({
  sessionId,
  onBack,
  onExecution,
}: {
  sessionId: string;
  onBack: () => void;
  onExecution: () => void;
}) {
  const { session, loading, pending, error, refresh, execute } = useWorkflowSession(sessionId);
  const controls = useMockDeviceCheckControls();
  const state = session ? selectRemeasurement(session) : null;
  const reading = state?.sensor?.readings[0];
  const metricLabel = state?.requirement?.metrics.find(
    (metric) => metric.id === reading?.metricId,
  )?.label;
  const unit = reading?.unit.trim().toLowerCase();
  const bh1750 = [state?.sensor?.sensorId, state?.requirement?.title].some((name) =>
    name?.toLowerCase().includes('bh1750'),
  );
  // 표시 라벨이 없어도 측정 식별자·단위·알려진 센서 종류로 측정명을 유지한다.
  const measurementName =
    reading?.metricId === 'illuminance' || unit === 'lx' || bh1750
      ? '조도'
      : reading?.metricId === 'voltage' || unit === 'v'
        ? '전압'
        : metricLabel || '센서';
  const age = useMeasurementAge(reading?.observedAt);
  const [menu, setMenu] = useState(false);
  const [notice, setNotice] = useState(false);
  const leaving = useRef(false);
  const openExecution = () => {
    if (leaving.current) return;
    leaving.current = true;
    onExecution();
  };
  const start = async () => {
    if (leaving.current) return;
    if (state?.started) {
      openExecution();
      return;
    }
    if (!state?.canRemeasure || !state.cursor || !state.recovery) return;
    const next = await execute({
      type: 'requestRecoveryRemeasurement',
      cursorId: state.cursor.cursorId,
      recoveryId: state.recovery.recoveryId,
    });
    if (next && selectRemeasurement(next).started) openExecution();
  };
  return (
    <SafeAreaView style={styles.root} edges={['top']} testID="remeasurement-screen">
      <StatusBar tone="light" />
      <AppBar title="복구 후 재측정" mode="back" onBack={onBack} onMore={() => setMenu(true)} />
      <ScrollView contentContainerStyle={styles.content}>
        {loading ? (
          <AppText accessibilityLiveRegion="polite">복구 기록을 불러오고 있습니다.</AppText>
        ) : null}
        {error ? (
          <>
            <FeedbackPanel
              title="복구 기록을 확인해 주세요"
              subtitle={error}
              tone="danger"
              icon="alert"
            />
            <Button
              label="복구 기록 다시 불러오기"
              onPress={refresh}
              disabled={pending}
              variant="secondary"
            />
          </>
        ) : null}
        {state?.available ? (
          <>
            <AppText variant="caption" color={colors.text.secondary}>
              {state.condition?.label} 조건 · {state.cursor?.trialIndex}회차
            </AppText>
            <FeedbackPanel
              title={
                state.started
                  ? '같은 회차의 재측정을 요청했습니다'
                  : `새 ${measurementName}값이 수신되었습니다`
              }
              subtitle="복구 후 자동 완료하지 않습니다. 같은 회차를 다시 측정한 뒤 완료를 요청해 주세요."
              tone="success"
              icon="check"
            />
            <SensorCard
              title={state.requirement?.title ?? state.sensor?.sensorId ?? '센서 응답'}
              subtitle="센서 재확인 응답 · 회차 측정 전 확인값"
              value={reading ? `${reading.value} ${reading.unit}` : undefined}
              meta={age}
              state="normal"
              detail={
                state.probe?.report?.stability === 'stable'
                  ? '안정화 응답 확인 · 별도 재측정 필요'
                  : '안정화 상태 확인 필요'
              }
            />
            {state.history.map((event) => {
              const failed =
                event.type === 'executionSampleRejected' || event.type === 'recoveryFailed';
              const requested = event.type === 'recoveryRequested';
              const attempt = session?.execution?.attempts.find(
                (item) => item.attemptId === event.attemptId,
              );
              const title = requested
                ? '센서 재확인 요청'
                : failed
                  ? '측정 보류·오류 기록'
                  : '센서 응답 재확인 완료';
              return (
                <TimelineItem
                  key={event.eventId}
                  title={`${recordedTime(event.occurredAt)} · ${title}`}
                  subtitle={
                    requested
                      ? '작업자의 재확인 요청 기록 · 물리적 연결 확인 아님'
                      : failed
                        ? (attempt?.issue?.message ?? '이 응답은 회차 완료에 사용하지 않습니다.')
                        : '새 응답 확인 · 회차는 아직 완료되지 않았습니다.'
                  }
                  state={failed ? 'invalid' : requested ? 'recovery' : 'valid'}
                  icon={failed ? 'alert' : requested ? 'retry' : 'check'}
                  style={styles.history}
                />
              );
            })}
            <VoicePanel
              title={
                state.canRemeasure
                  ? '재측정 준비 완료'
                  : state.started
                    ? '재측정 요청 완료'
                    : '재측정 상태 확인 필요'
              }
              state={state.canRemeasure ? 'confirmed' : state.started ? 'processing' : 'idle'}
              subtitle={
                state.canRemeasure
                  ? `${state.condition?.label} 조건 ${state.cursor?.trialIndex}회차 · 아래 버튼으로 다시 측정해 주세요.`
                  : '현재 회차의 측정 상태를 확인해 주세요.'
              }
              onPress={() => setNotice(true)}
            />
            {notice ? (
              <AppText variant="caption" accessibilityLiveRegion="polite">
                음성 입력 서비스는 아직 연결되지 않았습니다. 아래 버튼을 사용해 주세요.
              </AppText>
            ) : null}
          </>
        ) : !loading && session ? (
          <FeedbackPanel
            title="현재 복구 후 재측정할 작업이 없습니다"
            subtitle="현재 작업에서 회차와 센서 상태를 확인해 주세요."
            tone="info"
          />
        ) : null}
      </ScrollView>
      <ActionShelf
        safeArea
        layout="single"
        primary={
          state?.started
            ? '현재 회차 측정 확인'
            : state?.cursor
              ? `${state.cursor.trialIndex}회차 다시 측정`
              : '현재 회차 다시 측정'
        }
        loading={pending}
        disabled={loading || (!state?.canRemeasure && !state?.started)}
        onPrimary={() => {
          void start();
        }}
      />
      <BottomSheet open={menu} onClose={() => setMenu(false)} title="복구 후 재측정 정보">
        {session && state ? (
          <PreviewTools available={!!controls}>
            <MockExecutionScenarioControl
              controls={controls}
              sessionId={sessionId}
              disabled={pending || state.sampling || !!state.pendingVoice || state.completed}
            />
          </PreviewTools>
        ) : null}
        <AppText>
          센서 재확인과 회차 재측정은 별도로 기록합니다. 물리적 연결이나 장비 안전을 자동 보증하지
          않습니다.
        </AppText>
        {session?.source === 'mock' ? (
          <AppText>현재 값은 장치에서 수집한 실측값이 아닙니다.</AppText>
        ) : null}
        <Button
          label="현재 작업으로 돌아가기"
          variant="secondary"
          onPress={() => {
            setMenu(false);
            openExecution();
          }}
        />
      </BottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface.canvas },
  content: { padding: spacing[24], gap: spacing[12] },
  history: { backgroundColor: colors.surface.canvas },
});
