import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ActionShelf,
  AppBar,
  AppText,
  BottomSheet,
  Button,
  ConditionProgress,
  EvidenceRow,
  FeedbackPanel,
  HeroPanel,
  Icon,
  SectionHeader,
  StatusBadge,
  StatusBar,
  StepProgress,
  VoicePanel,
  colors,
  radii,
  spacing,
} from '@/design-system';
import { selectResume, type ResumeCheckTarget } from '../domain/resume';
import { mockResumeProgress } from './mock-resume-progress';
import { useWorkflowSession } from '../state/useWorkflowSession';
import { useMeasurementAge } from './useMeasurementAge';
import { MockDeviceScenarioControl } from './MockDeviceScenarioControl';
import { PreviewTools } from './PreviewTools';
import { WorkflowProvider, useMockDeviceCheckControls } from '../state/WorkflowProvider';

export function ResumeScreen({
  sessionId,
  onBack,
  onExecution,
}: {
  sessionId: string;
  onBack: () => void;
  onExecution: () => void;
}) {
  const { session, loading, pending, error, refresh, execute } = useWorkflowSession(sessionId);
  const state = session ? selectResume(session) : null;
  const [menu, setMenu] = useState(false);
  const [notice, setNotice] = useState(false);
  const controls = useMockDeviceCheckControls();
  const pausedAge = useMeasurementAge(state?.pause?.occurredAt);
  const connectionAge = useMeasurementAge(state?.connection.attempt?.report?.checkedAt);
  const voltageAge = useMeasurementAge(state?.voltage?.observedAt);
  const progress = session ? mockResumeProgress(session) : undefined;
  const recheck = async (target: ResumeCheckTarget) => {
    const card = target === 'connection' ? state?.connection : state?.voltageCheck;
    if (!state?.paused || !state.pause || !state.cursor || pending || card?.checking) return;
    await execute({
      type: 'checkResume',
      target,
      pauseEventId: state.pause.eventId,
      cursorId: state.cursor.cursorId,
    });
  };
  const confirm = async () => {
    if (!state?.passed || !state.pause || !state.attempt || pending) return;
    await execute({
      type: 'confirmResumeSetup',
      pauseEventId: state.pause.eventId,
      attemptId: state.attempt.attemptId,
      confirmed: !state.attempt.operatorConfirmed,
    });
  };
  const resume = async () => {
    if (!state?.canResume || !state.pause || !state.cursor || pending) return;
    const next = await execute({
      type: 'resumeExecution',
      pauseEventId: state.pause.eventId,
      cursorId: state.cursor.cursorId,
    });
    if (next?.phase === 'running') onExecution();
  };
  const confirmed = state?.passed && state.attempt?.operatorConfirmed;
  return (
    <SafeAreaView style={styles.root} edges={['top']} testID="resume-screen">
      <StatusBar tone="light" />
      <AppBar title="재개 전 재확인" mode="back" onBack={onBack} onMore={() => setMenu(true)} />
      <ScrollView contentContainerStyle={styles.content}>
        {loading ? <AppText>재개 전 상태를 불러오고 있습니다.</AppText> : null}
        {error ? (
          <>
            <FeedbackPanel
              title="재개 전 확인을 처리하지 못했습니다"
              subtitle={error}
              tone="danger"
              icon="alert"
            />
            <Button
              label="재개 상태 다시 불러오기"
              variant="secondary"
              onPress={refresh}
              disabled={pending}
            />
          </>
        ) : null}
        {session && state?.paused ? (
          <>
            <View style={styles.identity}>
              <AppText variant="caption" color={colors.text.secondary}>
                {pausedAge.replace(/ 전$/, '')}간 일시정지됨
              </AppText>
              <StatusBadge label={`v${session.procedure.version}`} tone="info" />
            </View>
            <HeroPanel
              tone="quiet"
              title={`${state.condition?.label ?? state.cursor?.conditionId} 조건\n${state.cursor?.trialIndex}회차부터 재개합니다`}
              subtitle="일시정지 중 변할 수 있는 조건만 다시 확인합니다."
            />
            {progress ? (
              <StepProgress
                title={`복원 위치 · ${progress.step}/16단계`}
                value={progress.percentage}
                state="paused"
              />
            ) : null}
            <ConditionProgress
              items={state.conditions}
              currentIndex={state.currentIndex}
              state="running"
            />
            <SectionHeader title="재개 전 확인" />
            <EvidenceRow
              title={`${session.procedure.deviceCheck?.title ?? '장치'}와 필수 센서 ${session.procedure.deviceCheck?.sensors.filter((sensor) => sensor.required).length ?? 0}개 연결`}
              subtitle={
                state.connection.passed
                  ? `최신 연결 응답 · ${connectionAge}`
                  : state.connection.checking
                    ? '새 연결 응답 확인 중'
                    : (state.connection.attempt?.issue?.message ??
                      '눌러 장치와 필수 센서 연결 확인')
              }
              kind="sensor"
              state={
                state.connection.passed
                  ? 'confirmed'
                  : state.connection.attempt?.status === 'failed'
                    ? 'issue'
                    : 'pending'
              }
              meta={
                state.connection.checking
                  ? '확인 중'
                  : state.connection.attempt?.status === 'failed'
                    ? '실패'
                    : undefined
              }
              onPress={() => {
                void recheck('connection');
              }}
            />
            <EvidenceRow
              title={
                state.voltageCheck.passed &&
                state.voltage?.value !== null &&
                state.voltage?.value !== undefined
                  ? `공급 전압 ${state.voltage.value.toFixed(2)} ${state.voltage.unit}`
                  : '공급 전압 확인 필요'
              }
              subtitle={
                state.voltageCheck.passed
                  ? `최신값 ${voltageAge} · V 단위 확인`
                  : state.voltageCheck.checking
                    ? '새 전압 응답 확인 중'
                    : (state.voltageCheck.attempt?.issue?.message ?? '눌러 공급 전압 응답 확인')
              }
              kind="sensor"
              state={
                state.voltageCheck.passed
                  ? 'confirmed'
                  : state.voltageCheck.attempt?.status === 'failed'
                    ? 'issue'
                    : 'pending'
              }
              meta={
                state.voltageCheck.checking
                  ? '확인 중'
                  : state.voltageCheck.attempt?.status === 'failed'
                    ? '실패'
                    : undefined
              }
              onPress={() => {
                void recheck('voltage');
              }}
            />
            {/* S11의 person 아이콘은 필수 상태에서도 파랑이다. 공유 EvidenceRow는 변경하지 않는다. */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`작업자 확인, 거리 20cm와 지그 고정 확인, ${confirmed ? '작업자 직접 확인, 확인' : '작업자 확인 필요, 필수'}`}
              accessibilityState={{ disabled: !state.passed || pending }}
              disabled={!state.passed || pending}
              onPress={() => {
                void confirm();
              }}
              style={({ pressed }) => [
                styles.operatorCard,
                { backgroundColor: confirmed ? colors.surface.card : colors.status.warningBg },
                pressed && styles.pressed,
              ]}
            >
              <View
                style={[
                  styles.operatorIcon,
                  {
                    backgroundColor: confirmed ? colors.status.successBg : colors.status.warningBg,
                  },
                ]}
              >
                <Icon
                  name="person"
                  color={confirmed ? colors.status.success : colors.text.action}
                />
              </View>
              <View style={styles.operatorCopy}>
                <AppText variant="label">거리 20cm와 지그 고정 확인</AppText>
                <AppText variant="caption" color={colors.text.secondary}>
                  {confirmed ? '작업자 직접 확인' : '작업자 확인 필요'}
                </AppText>
              </View>
              <AppText
                variant="caption"
                color={confirmed ? colors.status.success : colors.status.warning}
              >
                {confirmed ? '확인' : '필수'}
              </AppText>
            </Pressable>
            <VoicePanel
              title={confirmed ? '재개 준비를 확인했어요' : '확인을 기다리고 있어요'}
              subtitle={
                notice
                  ? '거리와 지그 확인 항목을 눌러 직접 확인해 주세요.'
                  : '“거리와 방향 확인했어”'
              }
              state={confirmed ? 'confirmed' : 'clarify'}
              icon="alert"
              onPress={() => setNotice(true)}
            />
          </>
        ) : !loading && session ? (
          <FeedbackPanel
            title="재개 전 확인할 실험이 없습니다"
            subtitle="일시정지 기록과 현재 회차를 확인해 주세요."
            tone="info"
          />
        ) : null}
      </ScrollView>
      <ActionShelf
        safeArea
        layout="single"
        primary={state?.canResume ? '확인 완료 후 재개' : '확인 후 재개 가능'}
        disabled={loading || pending || !state?.canResume}
        loading={pending}
        onPrimary={() => {
          void resume();
        }}
      />
      <BottomSheet open={menu} onClose={() => setMenu(false)} title="재개 전 확인 정보">
        {session && controls ? (
          <PreviewTools available={!!controls}>
            {/* 하단 시트의 포털에도 화면과 같은 Repository를 전달한다. */}
            <WorkflowProvider repository={controls}>
              <MockDeviceScenarioControl
                sessionId={sessionId}
                disabled={pending || !!state?.checking || !state?.paused}
              />
            </WorkflowProvider>
          </PreviewTools>
        ) : null}
        <AppText>
          연결·전압 카드를 각각 눌러 새 응답을 확인한 뒤 거리와 지그를 직접 확인해 주세요. 어느
          카드든 재검증하면 작업자 확인도 다시 필요합니다. 음성 입력은 아직 연결되지 않았습니다.
        </AppText>
        <AppText>
          현재 응답은 Mock입니다. 물리적 연결·전압 안전·LED 제어를 보증하지 않습니다. 승인 전압
          범위와 최신성 제한 시간은 미확정입니다. 재개 후 같은 회차의 측정값을 새로 확인해 주세요.
        </AppText>
        <AppText>
          완료 기록·승인 버전·현재 회차는 유지됩니다. 기존 센서 오류 보류와 미확정 음성 요청은 자동
          해제하지 않습니다.
        </AppText>
      </BottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface.canvas },
  content: { padding: spacing[24], gap: spacing[12] },
  pressed: { opacity: 0.8 },
  operatorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 66,
    padding: spacing[12],
    gap: spacing[10],
    borderRadius: radii[16],
  },
  operatorIcon: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii[12],
  },
  operatorCopy: { flex: 1, minWidth: 0, gap: 3 },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[8],
  },
});
