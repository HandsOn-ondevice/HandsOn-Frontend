import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ActionShelf,
  AppBar,
  AppText,
  BottomSheet,
  FeedbackPanel,
  StatusBar,
  SurfaceCard,
  colors,
  radii,
  spacing,
} from '@/design-system';
import { selectSessionDeviceStatus } from '../domain/session-device-status';
import { useWorkflowSession } from '../state/useWorkflowSession';
import { useEdgeExecutionHeartbeat } from './useEdgeExecutionHeartbeat';
import { useMeasurementAge } from './useMeasurementAge';

type Sensor = ReturnType<typeof selectSessionDeviceStatus>['sensors'][number];
const labels = {
  passed: '응답 확인',
  disconnected: '미연결',
  error: '통신 오류',
  timeout: '응답 시간 초과',
  stale: '오래된 값',
} as const;

function SensorStatus({ sensor }: { sensor: Sensor }) {
  const observedAt = sensor.metrics
    .map((metric) => metric.observedAt)
    .filter((time): time is string => !!time)
    .sort((a, b) => Date.parse(a) - Date.parse(b))[0];
  const timestamp = observedAt ?? sensor.result?.checkedAt;
  const age = useMeasurementAge(timestamp);
  const complete = sensor.metrics.every((metric) => metric.value !== null);
  const passed = sensor.result?.status === 'passed' && !sensor.result.issue && complete;
  const warning = sensor.result?.status === 'stale';
  const foreground = passed
    ? colors.status.success
    : warning
      ? colors.status.warning
      : colors.text.secondary;
  const background = passed
    ? colors.status.successBg
    : warning
      ? colors.status.warningBg
      : colors.surface.canvas;
  return (
    <SurfaceCard>
      <View style={styles.row}>
        <AppText variant="label" style={styles.flex}>
          {sensor.title}
        </AppText>
        <AppText variant="caption" color={foreground}>
          {age}
        </AppText>
      </View>
      <AppText variant="caption" color={colors.text.secondary}>
        {sensor.description}
      </AppText>
      <View style={[styles.reading, { backgroundColor: background }]}>
        <AppText variant="title" color={foreground}>
          {sensor.metrics.map((metric) => `${metric.value ?? '—'} ${metric.unit}`).join(' · ')}
        </AppText>
      </View>
      <AppText variant="caption" color={foreground}>
        {sensor.result ? labels[sensor.result.status] : '실행 중 응답 없음'}
        {sensor.result?.status === 'passed' && !complete ? ' · 측정값 형식 확인 필요' : ''}
        {sensor.result?.issue ? ` · ${sensor.result.issue.message}` : ''}
      </AppText>
      {sensor.result ? (
        <AppText variant="caption" color={colors.text.secondary}>
          {observedAt ? '관측 시각' : '응답 시각'} ·{' '}
          {timestamp && Number.isFinite(Date.parse(timestamp))
            ? new Date(timestamp).toLocaleTimeString('ko-KR', { hour12: false })
            : '확인 불가'}
        </AppText>
      ) : null}
    </SurfaceCard>
  );
}

export function SessionDeviceStatusScreen({
  sessionId,
  onBack,
  onExecution,
}: {
  sessionId: string;
  onBack: () => void;
  onExecution: () => void;
}) {
  const { session, loading, error, heartbeat } = useWorkflowSession(sessionId);
  useEdgeExecutionHeartbeat(session?.source === 'api' && session.phase === 'running', heartbeat);
  const state = session ? selectSessionDeviceStatus(session) : null;
  const age = useMeasurementAge(state?.report?.checkedAt);
  const [info, setInfo] = useState(false);
  const connected = state?.report?.connection === 'connected';
  return (
    <SafeAreaView style={styles.root} edges={['top']} testID="session-device-status-screen">
      <StatusBar tone="light" />
      <AppBar title="장치 상태 확인" mode="back" onBack={onBack} onMore={() => setInfo(true)} />
      <ScrollView contentContainerStyle={styles.content}>
        <AppText variant="heading" accessibilityRole="header">
          실행 중 장치 상태
        </AppText>
        <AppText variant="caption" color={colors.text.secondary}>
          {session?.source === 'mock'
            ? '시뮬레이션 · 실제 장치 연결·실측값이 아닙니다.'
            : `${session?.dataOrigin === 'simulation' ? '모의 장치 · ' : ''}저장된 실행 응답입니다.`}
        </AppText>
        {loading ? <AppText>장치 응답 기록을 불러오고 있습니다.</AppText> : null}
        {error ? (
          <FeedbackPanel title="세션을 찾을 수 없습니다" subtitle={error} tone="danger" />
        ) : null}
        {state ? (
          <>
            <FeedbackPanel
              title={`${state.deviceTitle} ${state.report ? (connected ? '연결 응답 확인' : '연결 확인 불가') : '실행 응답 없음'}`}
              subtitle={
                state.report
                  ? `마지막 실행 응답 · ${age}`
                  : 'S05 점검 결과로 현재 연결 상태를 대신하지 않습니다.'
              }
              tone={
                state.report
                  ? !connected
                    ? 'danger'
                    : state.report.issue || state.attempt?.issue
                      ? 'warning'
                      : 'success'
                  : 'info'
              }
              icon={connected ? 'check' : 'device'}
            />
            {state.attempt ? (
              <AppText variant="caption" color={colors.text.secondary}>
                응답 위치 · {state.condition?.label ?? state.attempt.cursor.conditionId} 조건{' '}
                {state.attempt.cursor.trialIndex}회차
              </AppText>
            ) : null}
            {state.sensors.map((sensor) => (
              <SensorStatus key={sensor.sensorId} sensor={sensor} />
            ))}
            <AppText variant="caption" color={colors.text.secondary}>
              마지막 응답의 기록입니다. 실시간 감시·안전 범위 판정은 하지 않으며 오류·보류는 현재
              작업에서 계속 확인해야 합니다.
            </AppText>
          </>
        ) : null}
      </ScrollView>
      <ActionShelf safeArea primary="현재 작업으로 돌아가기" onPrimary={onExecution} />
      <BottomSheet open={info} onClose={() => setInfo(false)} title="장치 상태 조회 정보">
        <AppText>세션 {sessionId}</AppText>
        <AppText>
          조회만으로 측정·장치 재점검·세션 전환을 요청하지 않습니다. 표시된 시각은 저장된 응답의
          관측 시각이며 최신성을 보증하지 않습니다.
        </AppText>
      </BottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface.canvas },
  content: { padding: spacing[24], gap: spacing[12] },
  row: { flexDirection: 'row', gap: spacing[12], alignItems: 'center' },
  flex: { flex: 1 },
  reading: { padding: spacing[12], borderRadius: radii[12] },
});
