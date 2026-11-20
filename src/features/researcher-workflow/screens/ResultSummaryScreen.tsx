import { procedureVersionLabel } from './procedure-version-label';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  AppBar,
  AppText,
  BottomSheet,
  FeedbackPanel,
  Icon,
  MetricTile,
  SectionHeader,
  StatusBar,
  SurfaceCard,
  colors,
  gradientGeometry,
  gradients,
  radii,
  spacing,
} from '@/design-system';
import { selectResult } from '../domain/completion';
import { useWorkflowSession } from '../state/useWorkflowSession';
import {
  ActionShelf,
  CompletionConditions,
  CompletionInfo,
  CompletionScaffold,
  UnavailableCompletion,
  completionStyles,
} from './CompletionParts';

function duration(start: string, end: string | undefined) {
  const minutes = end
    ? Math.max(0, Math.round((Date.parse(end) - Date.parse(start)) / 60000))
    : NaN;
  return Number.isFinite(minutes)
    ? minutes >= 60
      ? `${Math.floor(minutes / 60)}시간 ${minutes % 60}분`
      : `${minutes}분`
    : '확인 필요';
}

export function ResultSummaryScreen({
  sessionId,
  onHome,
  onDetails,
  showSubmittedResult = false,
}: {
  sessionId: string;
  onHome: () => void;
  onDetails: (conditionId: string, resultId: string) => void;
  showSubmittedResult?: boolean;
}) {
  const resource = useWorkflowSession(sessionId);
  const { session, loading, pending, error, execute } = resource;
  const state = session ? selectResult(session) : null;
  const [menu, setMenu] = useState(false);
  const readOnly = !!state?.submitted;
  const openDetails = (conditionId: string) => {
    if (state?.available && state.completion?.resultId)
      onDetails(conditionId, state.completion.resultId);
  };
  const details = () => {
    const first = session?.procedure.execution?.conditions[0];
    if (first) openDetails(first.id);
  };
  if (state?.submitted && state.available && session && !showSubmittedResult)
    return (
      <CompletionScaffold
        title="처리 결과"
        {...resource}
        onBack={onHome}
        action={<ActionShelf safeArea primary="홈으로" onPrimary={onHome} />}
      >
        <FeedbackPanel
          title="결과를 제출했습니다"
          subtitle={`${session.operatorId} · ${session.procedure.deviceId} · ${procedureVersionLabel(session.procedure.version)}\n숙련자의 최종 검토를 기다립니다.`}
          tone="success"
          icon="check"
        />
      </CompletionScaffold>
    );
  return (
    <SafeAreaView edges={['top']} style={styles.root} testID="result-summary-screen">
      <StatusBar tone="inverse" />
      <LinearGradient colors={gradients.contrast} {...gradientGeometry.aurora}>
        <AppBar
          title="결과 요약"
          mode="back"
          tone="inverse"
          style={styles.transparent}
          onBack={onHome}
          onMore={() => setMenu(true)}
        />
        <View style={styles.headerCopy}>
          <AppText variant="heading" color={colors.text.inverse} accessibilityRole="header">
            {state?.finished ? '작업을 완료했어요' : '실험 결과 확인'}
          </AppText>
          <AppText variant="caption" color={colors.text.inverse}>
            {readOnly
              ? '제출한 세션의 결과를 읽기 전용으로 확인합니다.'
              : '측정 기록을 확인한 뒤 제출해 주세요.'}
          </AppText>
        </View>
      </LinearGradient>
      <ScrollView style={styles.viewport} contentContainerStyle={completionStyles.content}>
        {loading ? <AppText>결과를 불러오고 있습니다.</AppText> : null}
        {error || state?.submission?.issue ? (
          <FeedbackPanel
            title="제출 상태를 확인해 주세요"
            subtitle={error ?? state?.submission?.issue?.message}
            tone="danger"
            icon="alert"
          />
        ) : null}
        {session && state?.available ? (
          <>
            {readOnly ? (
              <FeedbackPanel
                title="제출 완료 · 읽기 전용"
                subtitle="시연용 Mock 접수 기록입니다. 실제 백엔드 제출이나 영구 저장이 아닙니다."
                tone="success"
                icon="check"
              />
            ) : null}
            <AppText variant="title">
              실험 결과 · {state.completion?.resultId?.replace('mock-result-', '').slice(0, 8)}
            </AppText>
            <SurfaceCard
              title={`작업자 · ${session.operatorId} / 장치 ID · ${session.procedure.deviceId}`}
              subtitle={`절차 버전 · ${procedureVersionLabel(session.procedure.version)} / 소요 시간 · ${duration(session.createdAt, state.completion?.finishedAt)}`}
            />
            <SectionHeader
              title={`조건별 측정 · ${state.review.validCount} / ${state.review.required}`}
            />
            <CompletionConditions
              items={state.review.conditions}
              state="complete"
              onSelect={(index) => openDetails(session.procedure.execution!.conditions[index].id)}
            />
            <View style={completionStyles.row}>
              <MetricTile
                style={[completionStyles.flex, completionStyles.metric]}
                title="보류"
                value={`${state.review.heldCount}건`}
                tone="warning"
              />
              <MetricTile
                style={[completionStyles.flex, completionStyles.metric]}
                title="재측정"
                value={`${state.review.remeasurementCount}회`}
              />
              <MetricTile
                style={[completionStyles.flex, completionStyles.metric]}
                title="미해결"
                value={`${state.review.issues.length}건`}
                tone="success"
              />
            </View>
            <View style={[completionStyles.note, styles.caution]}>
              <Icon name="alert" size={15} color={colors.status.warning} />
              <AppText variant="caption" style={completionStyles.flex}>
                시스템 완료는 학술적 데이터 사용 가능 판정을 의미하지 않습니다.
              </AppText>
            </View>
          </>
        ) : !loading && session ? (
          <UnavailableCompletion />
        ) : null}
      </ScrollView>
      <ActionShelf
        safeArea
        layout="dual"
        primary={readOnly ? '홈으로' : '숙련자에게 제출'}
        secondary="상세 이력"
        disabled={loading || !(readOnly ? state?.available : state?.canSubmit)}
        loading={pending || state?.submission?.status === 'pending'}
        onSecondary={details}
        onPrimary={() => {
          if (readOnly) onHome();
          else void execute({ type: 'submitMockResult' });
        }}
      />
      <BottomSheet open={menu} onClose={() => setMenu(false)} title="결과 요약 정보">
        <CompletionInfo session={session} />
        {state?.completion?.resultId ? (
          <AppText>전체 결과 ID: {state.completion.resultId}</AppText>
        ) : null}
        <AppText>
          화면에는 결과 ID 앞 8자리를 표시합니다. 제출 시도와 접수증은 같은 세션에 보관합니다.
        </AppText>
      </BottomSheet>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.gradient.contrastStart },
  transparent: { backgroundColor: 'transparent' },
  headerCopy: {
    paddingHorizontal: spacing[24],
    paddingTop: spacing[6],
    paddingBottom: spacing[24] + radii[30],
    gap: spacing[6],
  },
  viewport: {
    flex: 1,
    marginTop: -radii[30],
    backgroundColor: colors.surface.canvas,
    borderTopLeftRadius: radii[30],
    borderTopRightRadius: radii[30],
  },
  caution: { backgroundColor: colors.status.warningBg },
});
