import { AppText, SensorCard, StatusBadge, SurfaceCard, colors } from '@/design-system';
import type { DeviceCheckAttempt, SensorRequirement } from '../domain/device-check';

const statusLabels = {
  passed: '점검 성공',
  disconnected: '미연결',
  error: '통신 오류',
  timeout: '응답 시간 초과',
  stale: '오래된 값',
} as const;

/** 진단 결과를 표시로 변환한다. 정상 범위·진행 조건은 여기에서 판정하지 않는다. */
export function DeviceCheckResults({
  sensors,
  attempt,
}: {
  sensors: readonly SensorRequirement[];
  attempt?: DeviceCheckAttempt;
}) {
  return sensors.map((sensor) => {
    const result = attempt?.report?.sensors.find((item) => item.sensorId === sensor.sensorId);
    const checking = attempt?.status === 'checking';
    const label = checking
      ? '점검 중'
      : result
        ? statusLabels[result.status]
        : attempt?.status === 'failed'
          ? '미완료'
          : '점검 전';
    const value = result?.readings
      .map((reading) => `${reading.value ?? '—'} ${reading.unit}`)
      .join(' · ');
    // SensorCard에는 pending/error 변형이 없다. 점검 전·통신 오류를 정상/범위 초과로 가장하지 않는다.
    if (
      !checking &&
      result &&
      (result.status === 'passed' || result.status === 'disconnected' || result.status === 'stale')
    ) {
      return (
        <SensorCard
          key={sensor.sensorId}
          title={sensor.title}
          subtitle={sensor.description}
          state={result.status === 'passed' ? 'normal' : result.status}
          value={value}
          meta={`점검 시각 ${new Date(result.checkedAt).toLocaleTimeString('ko-KR', { hour12: false })}`}
          detail={
            result.issue?.message ??
            `${attempt?.report?.source === 'mock' ? 'Mock 응답 확인' : '서비스 응답 확인'} · 안전 범위 판정 아님`
          }
        />
      );
    }
    return (
      <SurfaceCard key={sensor.sensorId} title={sensor.title} subtitle={sensor.description}>
        <StatusBadge
          label={label}
          tone={checking ? 'info' : attempt?.status === 'failed' ? 'danger' : 'neutral'}
        />
        <AppText color={colors.text.secondary}>
          {checking
            ? '센서 점검 응답을 기다리고 있습니다.'
            : (result?.issue?.message ?? '아직 유효한 점검 응답이 없습니다.')}
        </AppText>
      </SurfaceCard>
    );
  });
}
