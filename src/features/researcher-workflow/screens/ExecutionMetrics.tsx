import { StyleSheet, View } from 'react-native';
import { AppText, MetricTile, spacing } from '@/design-system';
import type { ExecutionDefinition, MeasurementAttempt } from '../domain/execution';

export function ExecutionMetrics({
  attempt,
  completed = false,
  conditions,
}: {
  attempt?: MeasurementAttempt;
  completed?: boolean;
  conditions?: ExecutionDefinition['conditions'];
}) {
  const report = attempt?.report;
  const reading = (sensorId: string, metricId: string) =>
    report?.diagnostics.sensors
      .find((sensor) => sensor.sensorId === sensorId)
      ?.readings.find((item) => item.metricId === metricId);
  const tiles = [
    { title: 'BH1750 조도', sensorId: 'bh1750', metricId: 'illuminance' },
    { title: 'INA219 전압', sensorId: 'ina219', metricId: 'voltage' },
    { title: 'INA219 전류', sensorId: 'ina219', metricId: 'current' },
    { title: 'BME280 환경', sensorId: 'bme280', metricId: 'temperature' },
  ];
  return (
    <View style={styles.section}>
      {completed ? (
        <AppText variant="caption" accessibilityLiveRegion="polite">
          {attempt
            ? `마지막 유효 측정값 · ${conditions?.find((condition) => condition.id === attempt.cursor.conditionId)?.label ?? attempt.cursor.conditionId} 조건 ${attempt.cursor.trialIndex}회차`
            : '반복 측정 완료 · 표시할 유효 측정값이 없습니다.'}
        </AppText>
      ) : null}
      <View style={styles.grid}>
        {tiles.map((tile) => {
          const result = report?.diagnostics.sensors.find(
            (sensor) => sensor.sensorId === tile.sensorId,
          );
          const data = reading(tile.sensorId, tile.metricId);
          const available = result && (result.status === 'passed' || result.status === 'stale');
          const time = data
            ? new Date(data.observedAt).toLocaleTimeString('ko-KR', { hour12: false })
            : null;
          return (
            <MetricTile
              key={tile.metricId}
              title={tile.title}
              style={styles.cell}
              value={
                available && data?.value !== null && data?.value !== undefined
                  ? String(data.value)
                  : '—'
              }
              meta={
                data
                  ? `${data.unit} · ${time} · ${data.source === 'mock' ? '참고값' : '측정값'}`
                  : completed
                    ? '저장된 유효 응답 없음'
                    : '현재 회차 응답 없음'
              }
              detail={
                result?.issue?.message ??
                (tile.metricId === 'temperature' && available
                  ? `습도 ${reading('bme280', 'humidity')?.value ?? '—'}% · 안전 판정 아님`
                  : '안전 범위 판정 아님')
              }
              tone={
                result?.status === 'stale'
                  ? 'warning'
                  : available
                    ? tile.sensorId === 'bme280'
                      ? 'info'
                      : 'success'
                    : 'neutral'
              }
            />
          );
        })}
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  section: { gap: spacing[8] },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[12] },
  cell: { flexBasis: '45%', flexGrow: 1, minWidth: 130 },
});
