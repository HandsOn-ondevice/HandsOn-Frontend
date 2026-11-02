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
import { selectDeviceCheck } from '../domain/device-check';
import { useWorkflowSession } from '../state/useWorkflowSession';
import { DeviceCheckResults } from './DeviceCheckResults';
import { MockDeviceScenarioControl } from './MockDeviceScenarioControl';

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
  const { session, loading, pending, error, refresh, execute } = useWorkflowSession(sessionId);
  const [details, setDetails] = useState(false);
  const state = session ? selectDeviceCheck(session) : null;
  const attempt = state?.latest;
  const definition = session?.procedure.deviceCheck;
  const locked = pending || loading || state?.checking === true;
  const sourceLabel = session?.source === 'api' ? '' : 'Mock ';
  const subtitle =
    session?.source === 'mock'
      ? 'Mock 환경 · 실제 장비 연결·측정 아님'
      : '장치 서비스 응답 · 점검 시점의 기록';
  const title =
    !state || session?.phase === 'preparing'
      ? 'S04 준비 확인이 필요합니다'
      : state.checking
        ? '장치·센서 점검 중입니다'
        : state.executionStarted
          ? `${sourceLabel}실험 시작 상태입니다`
          : state.canStart
            ? `${definition?.title ?? '장치'} 연결됨 · ${sourceLabel}점검 성공`
            : attempt?.status === 'failed'
              ? '장치·센서 점검에 실패했습니다'
              : '장치·센서 점검을 시작해 주세요';
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
        <AppText variant="caption" color={colors.text.secondary}>
          {subtitle}
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
            <AppText variant="caption">
              세션 {session.sessionId} · 절차 v{session.procedure.version}
            </AppText>
            <FeedbackPanel
              title={title}
              subtitle={
                attempt?.issue?.message ??
                (state.canStart || state.executionStarted
                  ? `필수 센서의 ${sourceLabel}응답을 확인했습니다. 장비의 안전 범위를 별도로 승인한 결과는 아닙니다.`
                  : state.checking
                    ? '점검 응답을 기다려 주세요. 화면을 나가도 점검은 유지됩니다.'
                    : 'S04 필수 확인 후 장치·센서 점검을 요청해 주세요.')
              }
              tone={attempt?.status === 'failed' ? 'danger' : state.canStart ? 'success' : 'info'}
              icon={attempt?.status === 'failed' ? 'alert' : state.canStart ? 'check' : 'device'}
            />
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
            <MockDeviceScenarioControl
              key={sessionId}
              sessionId={sessionId}
              disabled={locked || state.executionStarted}
            />
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
        primary={state?.executionStarted ? 'S06 연결 안내로 돌아가기' : '실험 측정 시작'}
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
        <AppText>{subtitle}</AppText>
        <AppText>
          작업자 확인과 센서 응답은 별도 근거로 기록합니다. 통신 점검 성공 후에만 실험 시작 상태로
          전환할 수 있습니다.
        </AppText>
        <AppText>
          Mock 상태는 앱 재시작 시 초기화됩니다. 실제 API·장치 서비스는 연결하지 않았습니다.
        </AppText>
      </BottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface.canvas },
  content: { padding: spacing[24], gap: spacing[12] },
});
