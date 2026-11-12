import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import {
  AppBar,
  AppText,
  BottomNavigation,
  Button,
  FeedbackPanel,
  Icon,
  MetricTile,
  ProcedureCard,
  Screen,
  SectionHeader,
  SegmentedControl,
  StatusBadge,
  StatusBar,
  SurfaceCard,
  colors,
  radii,
  spacing,
  type NavigationItem,
} from '@/design-system';
import type { WorkEnvironment } from '@/features/entry/entryEnvironment';
import { reviewStatusLabels } from '@/features/expert-review/reviewData';
import type {
  ExpertHomeData,
  ExpertProcedure,
  ExpertResult,
  LoadExpertHome,
} from './expertHomeData';
import { useExpertHome } from './useExpertHome';

export type ExpertTask =
  | { kind: 'create' }
  | { kind: 'procedure'; procedureId: string }
  | { kind: 'result'; resultId: string; procedureId: string };

interface ExpertHomeScreenProps {
  environment: WorkEnvironment;
  loadHome?: LoadExpertHome;
  onOpenTask: (task: ExpertTask) => void;
  onChangeEnvironment: () => void;
}

export function ExpertHomeScreen({
  environment,
  loadHome,
  onOpenTask,
  onChangeEnvironment,
}: ExpertHomeScreenProps) {
  const { state, refresh } = useExpertHome(environment.id, loadHome);
  const [active, setActive] = useState<NavigationItem>('home');
  const [procedureFilter, setProcedureFilter] = useState('draft');
  const [resultFilter, setResultFilter] = useState('pending');
  const data = state.status === 'ready' ? state.data : undefined;
  const drafts = data?.procedures.filter((item) => item.status === 'draft') ?? [];
  const approved = data?.procedures.filter((item) => item.status === 'approved') ?? [];
  const pending = data?.results.filter((item) => item.status === 'pending') ?? [];
  const filteredResults = data?.results.filter((item) => item.status === resultFilter) ?? [];
  const count = drafts.length + pending.length;

  function showProcedures(filter: string) {
    setProcedureFilter(filter);
    setActive('work');
  }

  return (
    <Screen>
      <StatusBar />
      <AppBar onProfile={() => setActive('history')} />
      <ScrollView
        key={active}
        style={styles.viewport}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={state.status === 'loading'} onRefresh={refresh} />
        }
      >
        <View style={styles.heading}>
          <AppText variant="caption" color={colors.text.action} accessibilityRole="header">
            숙련자 홈
          </AppText>
          <AppText variant="heading">
            {data
              ? count > 0
                ? `${data.displayName}님, 확인할\n항목이 ${count}개 있어요`
                : `${data.displayName}님,\n새 절차를 만들어 보세요`
              : '절차를 만들고,\n실험 결과를 확인하세요'}
          </AppText>
          <AppText variant="caption" color={colors.text.secondary}>
            {environment.name}
          </AppText>
        </View>
        <Button label="새 절차 음성으로 만들기" onPress={() => onOpenTask({ kind: 'create' })} />

        {active === 'history' ? (
          <>
            <SectionHeader title="내 정보" />
            <SurfaceCard title="숙련 연구생" subtitle={environment.name}>
              <AppText>작업 유형 · {environment.workType}</AppText>
              <AppText>실행 장치 · {environment.deviceName}</AppText>
              <AppText variant="caption" color={colors.text.secondary}>
                현재 현황과 목록은 개발용 합성 데이터입니다. 실제 장치 연결 상태는 확인하지
                않습니다.
              </AppText>
            </SurfaceCard>
            <Button label="역할·작업 환경 변경" variant="secondary" onPress={onChangeEnvironment} />
          </>
        ) : state.status === 'loading' ? (
          <FeedbackPanel title="작업 현황을 불러오는 중이에요." />
        ) : state.status === 'error' ? (
          <>
            <FeedbackPanel
              title="작업 현황을 불러오지 못했어요."
              subtitle="잠시 후 다시 시도해 주세요. 새 절차 작성은 계속할 수 있어요."
              tone="warning"
              icon="alert"
            />
            <Button label="다시 시도" variant="secondary" icon="retry" onPress={refresh} />
          </>
        ) : (
          <>
            <View style={styles.metrics}>
              <MetricTile
                title="초안"
                value={String(drafts.length)}
                meta="개"
                tone="warning"
                onPress={() => showProcedures('draft')}
                style={styles.metric}
              />
              <MetricTile
                title="결과 검토"
                value={String(pending.length)}
                meta="건"
                onPress={() => {
                  setResultFilter('pending');
                  setActive('device');
                }}
                style={styles.metric}
              />
              <MetricTile
                title="승인 절차"
                value={String(approved.length)}
                meta="개"
                tone="success"
                onPress={() => showProcedures('approved')}
                style={styles.metric}
              />
            </View>
            {active === 'home' ? (
              <HomeContents data={state.data} onOpenTask={onOpenTask} />
            ) : active === 'work' ? (
              <>
                <SectionHeader title="절차 관리" />
                <SegmentedControl
                  value={procedureFilter}
                  onChange={setProcedureFilter}
                  options={[
                    { value: 'draft', label: '초안' },
                    { value: 'approved', label: '승인 절차' },
                  ]}
                />
                {(procedureFilter === 'draft' ? drafts : approved).length === 0 ? (
                  <FeedbackPanel
                    title={
                      procedureFilter === 'draft'
                        ? '작성 중인 초안이 없어요.'
                        : '승인된 절차가 없어요.'
                    }
                    subtitle="새 절차를 작성해 보세요. 승인 전 초안은 실행할 수 없어요."
                  />
                ) : (
                  (procedureFilter === 'draft' ? drafts : approved).map((item) => (
                    <HomeProcedure key={item.id} procedure={item} onOpenTask={onOpenTask} />
                  ))
                )}
              </>
            ) : (
              <>
                <SectionHeader title="결과 검토 현황" />
                <SegmentedControl
                  value={resultFilter}
                  onChange={setResultFilter}
                  options={[
                    { value: 'pending', label: reviewStatusLabels.pending },
                    { value: 'reviewed', label: reviewStatusLabels.reviewed },
                    {
                      value: 'remeasurementRequested',
                      label: reviewStatusLabels.remeasurementRequested,
                    },
                  ]}
                />
                {filteredResults.length === 0 ? (
                  <FeedbackPanel
                    title={
                      resultFilter === 'pending'
                        ? '검토할 결과가 없어요.'
                        : resultFilter === 'reviewed'
                          ? '검토 완료한 결과가 없어요.'
                          : '재측정을 요청한 결과가 없어요.'
                    }
                    subtitle="연구생이 제출한 결과가 여기에 표시됩니다."
                  />
                ) : (
                  filteredResults.map((item) => (
                    <HomeResult key={item.id} result={item} onOpenTask={onOpenTask} />
                  ))
                )}
              </>
            )}
            <Button label="현황 새로고침" variant="tertiary" icon="retry" onPress={refresh} />
          </>
        )}
      </ScrollView>
      <View style={styles.navigation}>
        <BottomNavigation role="expert" active={active} onChange={setActive} />
      </View>
    </Screen>
  );
}

function HomeContents({
  data,
  onOpenTask,
}: {
  data: ExpertHomeData;
  onOpenTask: (task: ExpertTask) => void;
}) {
  const drafts = data.procedures.filter((item) => item.status === 'draft');
  const pending = data.results.filter((item) => item.status === 'pending');
  return (
    <>
      <SectionHeader title="검토 필요" />
      {drafts.length + pending.length === 0 ? (
        <FeedbackPanel
          title="확인할 항목이 없어요."
          subtitle="새 절차를 작성하거나 승인 절차를 확인해 보세요."
        />
      ) : (
        <>
          {drafts.map((item) => (
            <HomeProcedure key={item.id} procedure={item} onOpenTask={onOpenTask} />
          ))}
          {pending.map((item) => (
            <HomeResult key={item.id} result={item} onOpenTask={onOpenTask} />
          ))}
        </>
      )}
      <SectionHeader title="최근 작업" />
      {data.recentWork.length === 0 ? (
        <SurfaceCard subtitle="최근 작업이 없어요. 새 절차부터 시작해 보세요." />
      ) : (
        data.recentWork.map((item) => (
          <Pressable
            key={item.id}
            accessibilityRole="button"
            accessibilityLabel={`최근 작업, ${item.title}, ${item.summary}, ${item.updatedLabel}`}
            onPress={() =>
              onOpenTask(
                item.kind === 'procedure'
                  ? { kind: 'procedure', procedureId: item.procedureId }
                  : { kind: 'result', resultId: item.resultId, procedureId: item.procedureId },
              )
            }
            style={({ pressed }) => pressed && styles.pressed}
          >
            <SurfaceCard title={item.title} subtitle={item.summary}>
              <AppText variant="caption" color={colors.text.secondary}>
                {item.updatedLabel}
              </AppText>
            </SurfaceCard>
          </Pressable>
        ))
      )}
    </>
  );
}

function HomeProcedure({
  procedure,
  onOpenTask,
}: {
  procedure: ExpertProcedure;
  onOpenTask: (task: ExpertTask) => void;
}) {
  const draft = procedure.status === 'draft';
  return (
    <ProcedureCard
      title={procedure.title}
      subtitle={`${procedure.summary} · ${procedure.updatedLabel}`}
      meta={`${draft ? '초안' : '승인'} ${procedure.version}${draft ? ' · 실행 불가' : ''}`}
      detail={procedure.detail}
      state={procedure.status}
      onPress={() => onOpenTask({ kind: 'procedure', procedureId: procedure.id })}
    />
  );
}

function HomeResult({
  result,
  onOpenTask,
}: {
  result: ExpertResult;
  onOpenTask: (task: ExpertTask) => void;
}) {
  const label = reviewStatusLabels[result.status];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${result.studentName} · ${result.deviceName}, ${label}, ${result.summary}`}
      onPress={() =>
        onOpenTask({ kind: 'result', resultId: result.id, procedureId: result.procedureId })
      }
      style={({ pressed }) => pressed && styles.pressed}
    >
      <SurfaceCard style={styles.result}>
        <View style={styles.resultIcon}>
          <Icon name="check" color={colors.text.secondary} />
        </View>
        <View style={styles.resultCopy}>
          <AppText variant="label">
            {result.studentName} · {result.deviceName}
          </AppText>
          <AppText variant="caption" color={colors.text.secondary}>
            {result.summary}
          </AppText>
        </View>
        <StatusBadge label={label} tone={result.status === 'reviewed' ? 'success' : 'warning'} />
      </SurfaceCard>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  viewport: { flex: 1 },
  content: { padding: spacing[24], paddingTop: spacing[16], gap: spacing[12] },
  heading: { gap: spacing[8], paddingBottom: spacing[4] },
  metrics: { flexDirection: 'row', gap: spacing[10] },
  metric: { flex: 1, minWidth: 0 },
  result: { flexDirection: 'row', alignItems: 'center', gap: spacing[10], padding: spacing[12] },
  resultIcon: {
    width: 32,
    height: 32,
    borderRadius: radii[12],
    backgroundColor: colors.surface.subtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultCopy: { flex: 1, gap: spacing[4] },
  navigation: { paddingHorizontal: spacing[24], paddingBottom: spacing[8], paddingTop: spacing[8] },
  pressed: { opacity: 0.8 },
});
