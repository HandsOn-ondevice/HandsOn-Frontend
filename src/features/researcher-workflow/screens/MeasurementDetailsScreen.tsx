import { StyleSheet, View } from 'react-native';
import {
  AppText,
  EvidenceRow,
  HeroPanel,
  Icon,
  MetricTile,
  SectionHeader,
  colors,
  radii,
  spacing,
  type TimelineState,
} from '@/design-system';
import {
  acceptedMeasurement,
  conditionAverages,
  measurementReading,
  selectResult,
} from '../domain/completion';
import { useWorkflowSession } from '../state/useWorkflowSession';
import {
  ActionShelf,
  CompletionScaffold,
  CompletionTimeline,
  UnavailableCompletion,
  completionStyles,
  formatMetric,
  recordedTime,
} from './CompletionParts';

export function MeasurementDetailsScreen({
  sessionId,
  conditionId,
  onResults,
}: {
  sessionId: string;
  conditionId: string;
  onResults: () => void;
}) {
  const resource = useWorkflowSession(sessionId);
  const { session, loading } = resource;
  const state = session ? selectResult(session) : null;
  const condition = session?.procedure.execution?.conditions.find(
    (item) => item.id === conditionId,
  );
  const averages = session ? conditionAverages(session, conditionId) : null;
  const attempts =
    session?.execution?.attempts.filter(
      (item) => item.cursor.conditionId === conditionId && item.purpose !== 'recoveryCheck',
    ) ?? [];
  const valid = session ? attempts.filter((attempt) => acceptedMeasurement(session, attempt)) : [];
  const human =
    session?.evidence.filter(
      (item) =>
        item.action === 'measurementConfirmed' &&
        valid.some((attempt) => item.attemptId === attempt.attemptId),
    ) ?? [];
  const sensor =
    session?.evidence.filter(
      (item) =>
        item.kind === 'sensor' &&
        item.action === 'measurementAccepted' &&
        valid.some((attempt) => item.attemptId === attempt.attemptId),
    ) ?? [];
  const timeline: {
    key: string;
    at: string;
    state: TimelineState;
    title: string;
    subtitle: string;
  }[] = attempts.map((attempt) => {
    const accepted = session ? acceptedMeasurement(session, attempt) : false;
    const reading = measurementReading(attempt, 'illuminance');
    return {
      key: attempt.attemptId,
      at: attempt.confirmedAt ?? attempt.receivedAt ?? attempt.requestedAt,
      state: accepted ? ('valid' as const) : ('invalid' as const),
      title: `${attempt.cursor.trialIndex}회차${attempt.purpose === 'remeasurement' ? ' 재측정' : ''} · ${accepted ? '유효' : '무효'}${reading?.value !== null && reading?.value !== undefined ? ` · ${reading.value} ${reading.unit}` : ''}`,
      subtitle: accepted
        ? `${formatMetric(measurementReading(attempt, 'voltage')?.value, 2)} V · ${formatMetric(measurementReading(attempt, 'current')?.value, 0)} mA${attempt.purpose === 'remeasurement' ? ' · 원본 기록과 연결' : ''}`
        : (attempt.issue?.message ?? '회차 완료 근거로 사용하지 않은 응답'),
    };
  });
  for (const recovery of session?.execution?.recoveries?.filter(
    (item) => item.cursor.conditionId === conditionId,
  ) ?? [])
    timeline.push({
      key: recovery.recoveryId,
      at: recovery.completedAt ?? recovery.requestedAt,
      state: 'recovery',
      title:
        recovery.status === 'recovered'
          ? '센서 응답 재확인 완료'
          : recovery.status === 'failed'
            ? '센서 응답 재확인 실패'
            : '센서 응답 재확인 요청',
      subtitle: '작업자 재확인 요청 · 별도 회차 재측정 이력 유지',
    });
  timeline.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  return (
    <CompletionScaffold
      title="측정 상세와 근거 이력"
      {...resource}
      onBack={onResults}
      action={<ActionShelf safeArea primary="전체 결과로 돌아가기" onPrimary={onResults} />}
      menuChildren={
        <>
          <AppText>
            조건 ID: {conditionId}. 평균은 이 조건의 확인된 유효 측정만 사용합니다. 편차는 유효
            조도의 모집단 표준편차 / 평균 × 100입니다.
          </AppText>
          {sensor.map((item) => (
            <AppText key={item.evidenceId} variant="caption">
              {item.sensorId} · {item.attemptId}
              {'\n'}
              {item.readings
                ?.map(
                  (reading) =>
                    `${reading.metricId}: ${reading.value} ${reading.unit} · ${reading.observedAt}`,
                )
                .join('\n')}
            </AppText>
          ))}
          {human.map((item) => (
            <AppText key={item.evidenceId} variant="caption">
              작업자 {item.actorId} · {item.attemptId} · {item.recordedAt}
            </AppText>
          ))}
        </>
      }
    >
      {session && state?.available && condition && averages ? (
        <>
          <AppText variant="heading" accessibilityRole="header">
            {condition.label} 조건 상세
          </AppText>
          <AppText variant="caption" color={colors.text.secondary}>
            유효 {valid.length}건 · 무효 {attempts.length - valid.length}건
          </AppText>
          <HeroPanel
            tone="quiet"
            title={`${formatMetric(averages.illuminance)} lx`}
            subtitle={`반복 평균 · 편차 ${averages.deviation === null ? '—' : `${formatMetric(averages.deviation)}%`}`}
          />
          <View style={completionStyles.row}>
            <MetricTile
              style={[completionStyles.flex, completionStyles.metric]}
              title="전압 평균"
              value={formatMetric(averages.voltage, 2)}
              meta="V"
              tone="neutral"
            />
            <MetricTile
              style={[completionStyles.flex, completionStyles.metric]}
              title="전류 평균"
              value={formatMetric(averages.current, 0)}
              meta="mA"
              tone="neutral"
            />
            <MetricTile
              style={[completionStyles.flex, completionStyles.metric]}
              title="전력 평균"
              value={formatMetric(averages.power, 0)}
              meta="mW"
              tone="neutral"
            />
          </View>
          <SectionHeader title="회차별 기록" />
          {timeline.map((item) => (
            <CompletionTimeline
              key={item.key}
              title={item.title}
              subtitle={`${recordedTime(item.at)} · ${item.subtitle}`}
              state={item.state}
            />
          ))}
          <View
            style={styles.humanEvidence}
            accessible
            accessibilityLabel={`작업자 확인, 회차 완료 확인 · 준비·정리 기록 보존, ${human.length}건`}
          >
            <View style={styles.humanIcon}>
              <Icon name="person" color={colors.text.action} />
            </View>
            <View style={completionStyles.flex}>
              <AppText variant="label">작업자 확인</AppText>
              <AppText variant="caption" color={colors.text.secondary}>
                회차 완료 확인 · 준비·정리 기록 보존
              </AppText>
            </View>
            <AppText variant="caption" color={colors.status.success}>
              {human.length}건
            </AppText>
          </View>
          <EvidenceRow
            title="센서 근거"
            subtitle="ID · 값 · 단위 · 타임스탬프"
            state="confirmed"
            kind="sensor"
            meta={`${sensor.length}건`}
          />
        </>
      ) : !loading && session ? (
        <UnavailableCompletion />
      ) : null}
    </CompletionScaffold>
  );
}
const styles = StyleSheet.create({
  humanEvidence: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[10],
    padding: spacing[12],
    minHeight: 66,
    borderRadius: radii[16],
    backgroundColor: colors.surface.card,
  },
  humanIcon: {
    width: 32,
    height: 32,
    borderRadius: radii[12],
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.status.successBg,
  },
});
