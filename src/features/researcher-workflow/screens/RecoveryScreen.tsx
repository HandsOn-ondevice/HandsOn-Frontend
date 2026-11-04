import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ActionShelf,
  AppBar,
  AppText,
  BottomSheet,
  Button,
  FeedbackPanel,
  Icon,
  SensorCard,
  StatusBadge,
  StatusBar,
  TimelineItem,
  colors,
  spacing,
} from '@/design-system';
import { selectRecovery } from '../domain/recovery';
import { useWorkflowSession } from '../state/useWorkflowSession';
import { useMockDeviceCheckControls } from '../state/WorkflowProvider';
import { MockExecutionScenarioControl } from './MockExecutionScenarioControl';
import { PreviewTools } from './PreviewTools';
import { useMeasurementAge } from './useMeasurementAge';

export function RecoveryScreen({ sessionId, onBack }: { sessionId: string; onBack: () => void }) {
  const { session, loading, pending, error, refresh, execute } = useWorkflowSession(sessionId);
  const controls = useMockDeviceCheckControls();
  const state = session ? selectRecovery(session) : null;
  const [menu, setMenu] = useState(false);
  const [notice, setNotice] = useState(false);
  const reading = state?.sensor?.readings[0];
  const measurementAge = useMeasurementAge(state?.checking ? undefined : reading?.observedAt);
  const usable =
    reading && Number.isFinite(reading.value) && Number.isFinite(Date.parse(reading.observedAt));
  const steps = [
    { title: '1  LED 출력을 0%로 유지', subtitle: '안전한 상태에서 케이블 확인' },
    { title: '2  I2C 케이블 연결 확인', subtitle: '전원을 끈 뒤 작업' },
    {
      title: `3  새 값 수신 후 ${session?.procedure.execution?.settlingSeconds ?? '지정 시간'}초 안정화`,
      subtitle: `현재 ${state?.cursor?.trialIndex ?? ''}회차를 다시 측정`,
    },
  ];
  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <StatusBar tone="light" />
      <AppBar
        title="센서 오류와 작업 보류"
        mode="back"
        onBack={onBack}
        onMore={() => setMenu(true)}
      />
      <ScrollView contentContainerStyle={styles.content}>
        {loading ? (
          <AppText accessibilityLiveRegion="polite">작업 상태를 불러오고 있습니다.</AppText>
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
              label="작업 상태 다시 불러오기"
              onPress={refresh}
              variant="secondary"
              disabled={pending}
            />
          </>
        ) : null}
        {state?.available ? (
          <>
            <View style={styles.row}>
              <AppText variant="label">
                {state.condition?.label} 조건 · {state.cursor?.trialIndex}회차
              </AppText>
              <StatusBadge
                label={state.recovered ? '재확인 완료' : 'PAUSED'}
                tone={state.recovered ? 'success' : 'danger'}
              />
            </View>
            <FeedbackPanel
              title={state.title}
              icon={state.recovered ? 'check' : 'alert'}
              tone={state.recovered ? 'success' : 'danger'}
              subtitle={
                state.recovered
                  ? '복구 후 자동 완료하지 않습니다. 현재 회차의 작업을 확인해 주세요.'
                  : state.failed
                    ? state.attempt?.issue?.message
                    : '현재 회차는 저장되지 않았고 다음 단계로 이동하지 않습니다.'
              }
            />
            <SensorCard
              title={state.requirement?.title ?? '센서 응답'}
              subtitle={
                state.checking
                  ? '새 응답 확인 중'
                  : state.recovered
                    ? '센서 재확인 · 연결됨'
                    : `문제 센서${state.requirement?.description ? ` · ${state.requirement.description}` : ''}`
              }
              value={!state.checking && usable ? `${reading.value} ${reading.unit}` : undefined}
              meta={state.checking ? undefined : measurementAge}
              state={
                state.recovered
                  ? 'normal'
                  : state.sensor?.status === 'stale'
                    ? 'stale'
                    : 'disconnected'
              }
              detail={
                state.recovered
                  ? '새 응답 확인 · 작업자 완료 요청 필요'
                  : state.checking
                    ? '응답을 기다리는 동안 진행할 수 없습니다.'
                    : state.sensor?.status === 'stale'
                      ? '마지막 값 · 회차 무효'
                      : (state.attempt?.issue?.message ?? '마지막 응답 · 회차 무효')
              }
            />
            <AppText variant="label" accessibilityRole="header">
              복구 순서
            </AppText>
            <View style={styles.steps}>
              {steps.map((step) => (
                <TimelineItem key={step.title} {...step} state="pending" icon="clock" />
              ))}
            </View>
            <View style={styles.guard}>
              <Icon name="lock" size={16} color={colors.text.secondary} />
              <AppText variant="caption" style={styles.flex}>
                오래된 값은 삭제하지 않고 무효 사유와 함께 남깁니다.
              </AppText>
            </View>
            {notice ? (
              <AppText accessibilityLiveRegion="polite">
                음성 안내 서비스는 아직 연결되지 않았습니다. 위 복구 순서를 확인해 주세요.
              </AppText>
            ) : null}
          </>
        ) : !loading && session ? (
          <FeedbackPanel
            title="보류된 작업이 없습니다"
            subtitle="현재 작업에서 상태를 확인해 주세요."
            tone="info"
          />
        ) : null}
      </ScrollView>
      <ActionShelf
        safeArea
        layout="dual"
        secondary="조치 듣기"
        primary={state?.recovered ? '현재 작업으로 돌아가기' : '센서 다시 확인'}
        loading={pending || !!state?.checking}
        disabled={loading || (!state?.recovered && !state?.canRecover)}
        onSecondary={() => setNotice(true)}
        onPrimary={() => {
          if (state?.recovered) {
            onBack();
            return;
          }
          if (state?.canRecover && state.cursor && state.blocked)
            void execute({
              type: 'requestRecovery',
              cursorId: state.cursor.cursorId,
              blockedAttemptId: state.blocked.attemptId,
            });
        }}
      />
      <BottomSheet open={menu} title="현재 작업 정보" onClose={() => setMenu(false)}>
        {session && state ? (
          <PreviewTools available={!!controls}>
            <MockExecutionScenarioControl
              key={sessionId}
              controls={controls}
              sessionId={sessionId}
              disabled={
                pending ||
                state.checking ||
                state.sampling ||
                state.completed ||
                !!state.pendingVoice
              }
            />
          </PreviewTools>
        ) : null}
        <AppText>
          재확인은 센서 응답을 새로 요청합니다. 전원·배선 조작이나 실제 장치 제어를 수행하지
          않습니다.
        </AppText>
        {session?.source === 'mock' ? (
          <AppText>현재 값은 장치에서 수집한 실측값이 아닙니다.</AppText>
        ) : null}
        <AppText>
          안정화 상태는 응답의 상태 정보를 확인합니다. 실제 안전 타이머와 음성 안내 서비스는 아직
          연결되지 않았습니다.
        </AppText>
        <Button
          label="현재 작업으로 돌아가기"
          variant="secondary"
          onPress={() => {
            setMenu(false);
            onBack();
          }}
        />
      </BottomSheet>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface.canvas },
  content: { padding: spacing[24], gap: spacing[12] },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing[8],
    flexWrap: 'wrap',
  },
  steps: { gap: spacing[8] },
  guard: {
    flexDirection: 'row',
    gap: spacing[8],
    alignItems: 'center',
    marginVertical: spacing[12],
  },
  flex: { flex: 1 },
});
