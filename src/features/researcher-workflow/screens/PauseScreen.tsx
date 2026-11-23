import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ActionShelf,
  AppBar,
  AppText,
  BottomSheet,
  Button,
  EvidenceRow,
  FeedbackPanel,
  Icon,
  StatusBar,
  SurfaceCard,
  colors,
  radii,
  spacing,
} from '@/design-system';
import { selectExecution, selectLastValidMeasurement } from '../domain/execution';
import { useWorkflowSession } from '../state/useWorkflowSession';

export function PauseScreen({
  sessionId,
  onBack,
  onResume,
  onHome,
}: {
  sessionId: string;
  onBack: () => void;
  onResume: () => void;
  onHome: () => void;
}) {
  const { session, loading, error, refresh } = useWorkflowSession(sessionId);
  const [notice, setNotice] = useState(false);
  const state = session ? selectExecution(session) : null;
  const paused =
    session?.phase === 'paused' &&
    session.events.some(
      (event) =>
        event.type === 'executionPaused' &&
        event.cursor?.cursorId === session.execution?.cursor?.cursorId,
    );
  const last = session ? selectLastValidMeasurement(session) : undefined;
  const lastCondition = session?.procedure.execution?.conditions.find(
    (condition) => condition.id === last?.cursor.conditionId,
  );
  const evidenceCount =
    session?.evidence.filter(
      (item) => item.action === 'measurementAccepted' || item.action === 'measurementConfirmed',
    ).length ?? 0;
  return (
    <SafeAreaView style={styles.root} edges={['top']} testID="pause-screen">
      <StatusBar tone="light" />
      <AppBar title="일시정지 확인" mode="back" onBack={onBack} onMore={() => setNotice(true)} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header} testID="pause-heading">
          <AppText variant="heading" accessibilityRole="header">
            실험 일시정지
          </AppText>
          {session ? <AppText variant="caption">세션 {session.sessionId}</AppText> : null}
        </View>
        {loading ? (
          <AppText accessibilityLiveRegion="polite">일시정지 상태를 불러오고 있습니다.</AppText>
        ) : error ? (
          <>
            <FeedbackPanel
              title="일시정지 기록을 확인할 수 없습니다"
              subtitle={error}
              tone="danger"
              icon="alert"
            />
            <Button label="상태 다시 불러오기" variant="secondary" onPress={refresh} />
          </>
        ) : paused && session && state ? (
          <>
            <FeedbackPanel
              title="진행 상태를 안전하게 저장했어요"
              subtitle={`완료한 측정과 절차 v${session.procedure.version}를 유지합니다.`}
              tone="success"
              icon="check"
            />
            <SurfaceCard>
              <AppText variant="label">
                {last
                  ? `마지막 유효 측정 · ${lastCondition?.label ?? last.cursor.conditionId} ${last.cursor.trialIndex}회차`
                  : '마지막 유효 측정 · 아직 완료한 측정이 없습니다'}
              </AppText>
              <AppText variant="caption">
                다음 작업 · {state.condition?.label} {state.cursor?.trialIndex}회차
              </AppText>
              <AppText variant="caption">
                유효 측정 {state.completedCount} / {state.total}회 · {state.percentage}%
              </AppText>
            </SurfaceCard>
            <EvidenceRow
              title={`완료 근거 ${evidenceCount}건 유지`}
              subtitle={`완료한 ${state.completedCount}회 측정의 작업자 확인·센서·프로그램 근거`}
              kind="program"
              state="confirmed"
            />
            <EvidenceRow
              title={`승인 버전 v${session.procedure.version} 유지`}
              subtitle="재개 시 최신 버전으로 바뀌지 않음"
              kind="program"
              state="confirmed"
            />
            <EvidenceRow
              title="LED 출력 상태 확인 필요"
              subtitle="앱 일시정지는 물리 장치를 끄지 않음"
              kind="human"
              state="issue"
            />
            <SurfaceCard style={styles.caution}>
              <Icon name="alert" size={spacing[16]} color={colors.status.warning} />
              <AppText variant="caption" style={styles.cautionText} testID="pause-led-caution">
                자리를 비우기 전 LED 출력을 0%로 내리고 전원을 확인하세요.
              </AppText>
            </SurfaceCard>
            <AppText variant="caption" color={colors.text.secondary} testID="pause-storage-scope">
              앱 실행 중에만 보관합니다. 재시작·새로고침 후 복원과 실제 LED 차단은 보장하지
              않습니다.
            </AppText>
          </>
        ) : session ? (
          <FeedbackPanel
            title="일시정지된 실험이 아닙니다"
            subtitle="실험 진행 화면에서 일시정지를 요청해 주세요."
            tone="info"
          />
        ) : null}
      </ScrollView>
      <ActionShelf
        safeArea
        layout="dual"
        primary="바로 재개"
        secondary="홈으로"
        disabled={loading || !paused}
        onPrimary={onResume}
        onSecondary={onHome}
      />
      <BottomSheet open={notice} onClose={() => setNotice(false)} title="현재 일시정지 정보">
        <AppText>
          일시정지는 현재 앱의 진행 상태만 보관합니다. 실제 장치 제어나 영구 저장은 수행하지
          않습니다.
        </AppText>
        {session ? <AppText variant="caption">세션 {session.sessionId}</AppText> : null}
        {session?.source === 'mock' ? (
          <AppText>현재 값과 상태는 장치에서 수집한 실측 결과가 아닙니다.</AppText>
        ) : null}
      </BottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface.canvas },
  content: { padding: spacing[24], gap: spacing[12] },
  header: { gap: spacing[12] },
  caution: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: spacing[10],
    gap: spacing[8],
    borderRadius: radii[12],
    backgroundColor: colors.status.warningBg,
    boxShadow: 'none',
  },
  cautionText: { flex: 1, minWidth: 0 },
});
