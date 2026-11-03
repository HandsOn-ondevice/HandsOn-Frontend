import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ActionShelf,
  AppBar,
  AppText,
  BottomSheet,
  Button,
  FeedbackPanel,
  StatusBar,
  colors,
  spacing,
} from '@/design-system';
import { selectDeviceConnection } from '../domain/device-connection';
import { DeviceConnectionCard } from './DeviceConnectionCard';
import { selectDeviceCheck } from '../domain/device-check';
import { useWorkflowSession } from '../state/useWorkflowSession';
import { DeviceCheckResults } from './DeviceCheckResults';
import { MockDeviceScenarioControl } from './MockDeviceScenarioControl';
import { PreviewTools } from './PreviewTools';
import { useMockDeviceCheckControls } from '../state/WorkflowProvider';

/** 기존 임시 화면의 export 이름을 유지한 실제 S05 조합 화면. 통신은 Repository 책임이다. */
export function DeviceCheckConnectionScreen({
  sessionId,
  onBack,
  onExecution,
}: {
  sessionId: string;
  onBack: () => void;
  onExecution: () => void;
}) {
  const previewControls = useMockDeviceCheckControls();
  const { session, loading, pending, error, refresh, execute } = useWorkflowSession(sessionId);
  const [details, setDetails] = useState(false);
  const state = session ? selectDeviceCheck(session) : null;
  const attempt = state?.latest;
  const definition = session?.procedure.deviceCheck;
  const locked = pending || loading || state?.checking === true;
  const subtitle =
    session?.source === 'mock'
      ? '실험에 사용할 장치와 센서의 상태를 확인해 주세요.'
      : '장치 서비스 응답 · 점검 시점의 기록';
  const startExecution = async () => {
    if (state?.executionStarted) {
      onExecution();
      return;
    }
    const next = await execute({ type: 'startExecution' });
    if (next && selectDeviceCheck(next).executionStarted) onExecution();
  };
  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <StatusBar tone="light" />
      <AppBar title="장치 상태 확인" mode="back" onBack={onBack} onMore={() => setDetails(true)} />
      <ScrollView contentContainerStyle={styles.content}>
        <AppText variant="heading" accessibilityRole="header">
          실험 시작 전 점검
        </AppText>
        {loading ? (
          <AppText accessibilityLiveRegion="polite">장치 점검 상태를 불러오고 있습니다.</AppText>
        ) : null}
        {error ? (
          <>
            <FeedbackPanel
              title="요청을 처리하지 못했습니다"
              subtitle={error}
              tone="danger"
              icon="alert"
            />
            <Button
              label="점검 상태 다시 불러오기"
              variant="secondary"
              onPress={refresh}
              disabled={locked}
            />
          </>
        ) : null}
        {session && state ? (
          <>
            <DeviceConnectionCard
              state={selectDeviceConnection(session, __DEV__ && !!previewControls)}
              deviceName={definition?.title}
            />
            {session.phase === 'preparing' ? (
              <FeedbackPanel
                title="준비 확인이 필요합니다"
                subtitle="필수 준비 항목을 확인한 후 장치·센서 점검을 요청해 주세요."
                tone="info"
              />
            ) : null}
            {definition ? (
              <DeviceCheckResults sensors={definition.sensors} attempt={attempt} />
            ) : (
              <FeedbackPanel
                title="점검 정의가 없습니다"
                subtitle="절차의 장치·필수 센서 정의를 먼저 합의해야 합니다."
                tone="warning"
              />
            )}
            {attempt ? (
              <AppText variant="caption">
                점검 시도 {session.deviceChecks.length}회 ·{' '}
                {attempt.completedAt
                  ? `완료 ${new Date(attempt.completedAt).toLocaleTimeString('ko-KR', { hour12: false })}`
                  : '응답 대기 중'}
              </AppText>
            ) : null}
            <Button
              label={
                state.checking
                  ? '장치·센서 점검 중'
                  : attempt
                    ? '장치·센서 다시 점검'
                    : '장치·센서 점검 시작'
              }
              variant="secondary"
              loading={state.checking}
              disabled={locked || !state.canInspect}
              onPress={() => {
                void execute({ type: 'startDeviceCheck' });
              }}
            />
            <AppText variant="caption" color={colors.text.secondary}>
              표시값은 점검 시점의 기록입니다. 실시간 센서 감시·안전 범위 판정은 수행하지 않습니다.
            </AppText>
          </>
        ) : null}
      </ScrollView>
      <ActionShelf
        safeArea
        primary={state?.executionStarted ? '실험 진행으로 돌아가기' : '실험 측정 시작'}
        disabled={locked || !state || (!state.canStart && !state.executionStarted)}
        loading={pending}
        onPrimary={() => {
          void startExecution();
        }}
      />
      <BottomSheet
        open={details}
        onClose={() => setDetails(false)}
        title="장치 점검 정보"
        icon="device"
      >
        {session && state ? (
          <PreviewTools available={!!previewControls}>
            <MockDeviceScenarioControl
              controls={previewControls}
              key={sessionId}
              sessionId={sessionId}
              disabled={locked || state.executionStarted}
            />
          </PreviewTools>
        ) : null}
        <AppText>{subtitle}</AppText>
        {session ? <AppText variant="caption">절차 v{session.procedure.version}</AppText> : null}
        <AppText>
          작업자 확인과 센서 응답은 별도 근거로 기록합니다. 통신 점검 성공 후에만 실험 시작 상태로
          전환할 수 있습니다.
        </AppText>
        {session?.source === 'mock' ? (
          <AppText>
            현재 표시값은 장치에서 수집한 실측값이 아닙니다. 장치 서비스 연결 후 실제 점검을 사용할
            수 있습니다.
          </AppText>
        ) : null}
      </BottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface.canvas },
  content: { padding: spacing[24], gap: spacing[12] },
});
