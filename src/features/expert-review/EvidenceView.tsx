import { StyleSheet, View } from 'react-native';
import {
  AppText,
  HeroPanel,
  Icon,
  MetricTile,
  colors,
  radii,
  spacing,
  type IconName,
} from '@/design-system';
import type {
  ConditionEvidence,
  EvidenceEvent,
  EvidenceMeasurement,
  ReviewCondition,
} from './reviewData';

const sourceLabels = { human: '작업자', sensor: '센서', program: '프로그램' } as const;

const recordStyles = {
  valid: { icon: 'check', color: colors.text.action, background: colors.status.successBg },
  invalid: { icon: 'alert', color: colors.status.danger, background: colors.status.dangerBg },
  held: { icon: 'pause', color: colors.status.warning, background: colors.status.warningBg },
  recovered: { icon: 'retry', color: colors.text.action, background: colors.status.infoBg },
  remeasured: { icon: 'retry', color: colors.text.action, background: colors.status.successBg },
} satisfies Record<string, { icon: IconName; color: string; background: string }>;

export function EvidenceView({
  evidence,
  condition,
  unit,
}: {
  evidence: ConditionEvidence;
  condition: ReviewCondition;
  unit: string;
}) {
  const { calculation, measurements, history, deviationPercent } = evidence;
  const records = [...measurements, ...history].sort((first, second) =>
    first.timestamp.localeCompare(second.timestamp),
  );
  const metrics = [
    { title: '전압 평균', value: evidence.voltageAverage?.toFixed(2), unit: 'V' },
    { title: '전류 평균', value: evidence.currentAverage?.toFixed(0), unit: 'mA' },
    { title: '전력 평균', value: evidence.powerAverage?.toFixed(0), unit: 'mW' },
  ];

  return (
    <View style={styles.content}>
      <View style={styles.heading}>
        <AppText variant="heading" accessibilityRole="header">
          {`${condition.label} 조건 상세`}
        </AppText>
        <AppText variant="caption" color={colors.text.secondary}>
          {`유효 ${condition.validCount}건 · 무효 ${condition.invalidCount}건`}
        </AppText>
      </View>
      <HeroPanel
        tone="quiet"
        title={condition.value === null ? '—' : `${condition.value.toFixed(1)} ${unit}`}
        subtitle={deviationPercent === null ? '반복 평균' : `반복 평균 · 편차 ${deviationPercent}%`}
      />
      <View style={styles.metrics}>
        {metrics.map((metric) => (
          <MetricTile
            key={metric.unit}
            title={metric.title}
            value={metric.value ?? '—'}
            meta={metric.unit}
            tone="neutral"
            style={styles.metric}
          />
        ))}
      </View>
      <View style={styles.timeline}>
        <AppText variant="label" accessibilityRole="header">
          회차별 기록
        </AppText>
        {records.length === 0 ? (
          <AppText color={colors.text.secondary}>기록된 측정 근거가 없습니다.</AppText>
        ) : (
          <View>
            {records.map((record) => (
              <EvidenceRecord key={record.id} record={record} measurements={measurements} />
            ))}
          </View>
        )}
      </View>
      {calculation ? (
        <View style={styles.heading}>
          <AppText variant="label">프로그램 계산 근거</AppText>
          <AppText variant="caption" color={colors.text.secondary}>
            {`${calculation.timestamp} · ${calculation.source}`}
          </AppText>
        </View>
      ) : null}
    </View>
  );
}

function EvidenceRecord({
  record,
  measurements,
}: {
  record: EvidenceMeasurement | EvidenceEvent;
  measurements: readonly EvidenceMeasurement[];
}) {
  const isMeasurement = 'validity' in record;
  const original = isMeasurement
    ? measurements.find((measurement) => measurement.id === record.replacesMeasurementId)
    : undefined;
  const appearance = recordStyles[isMeasurement ? record.validity : record.kind];
  const sourceKind = isMeasurement ? record.kind : record.sourceKind;
  const title = isMeasurement
    ? `${record.title} · ${record.validity === 'valid' ? '유효' : '무효'} · ${record.value ?? '측정값 없음'}`
    : record.title;
  const details = [record.timestamp, record.detail];
  if (isMeasurement && record.invalidReason !== record.detail) details.push(record.invalidReason);

  return (
    <View style={styles.record}>
      <View style={[styles.recordIcon, { backgroundColor: appearance.background }]}>
        <Icon name={appearance.icon} color={appearance.color} size={18} />
      </View>
      <View style={styles.recordCopy}>
        <AppText variant="label">{title}</AppText>
        <AppText variant="caption" color={colors.text.secondary}>
          {details.filter(Boolean).join(' · ')}
        </AppText>
        <AppText variant="caption" color={colors.text.secondary}>
          {[sourceLabels[sourceKind], record.source, original && `무효 원본 ${original.title}`]
            .filter(Boolean)
            .join(' · ')}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing[10] },
  heading: { gap: spacing[6] },
  metrics: { flexDirection: 'row', gap: spacing[10] },
  metric: { flex: 1, minWidth: 0, minHeight: 115 },
  timeline: { marginTop: spacing[4], gap: spacing[8] },
  record: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing[10],
    gap: spacing[10],
    minHeight: 78,
  },
  recordIcon: {
    width: spacing[28],
    height: spacing[28],
    borderRadius: radii[999],
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordCopy: { flex: 1, minWidth: 0, gap: spacing[2] },
});
