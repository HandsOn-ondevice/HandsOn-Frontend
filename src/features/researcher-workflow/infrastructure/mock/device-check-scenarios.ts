import type { DeviceCheckDefinition, DeviceDiagnosticsReport } from '../../domain/device-check';

export const mockDeviceScenarios = [
  { value: 'normal', label: '정상 연결' },
  { value: 'disconnected', label: '장치 미연결' },
  { value: 'sensorError', label: '센서 통신 오류' },
  { value: 'delayed', label: '응답 지연 후 성공' },
  { value: 'timeout', label: '응답 시간 초과' },
  { value: 'stale', label: '오래된 센서값' },
] as const;
export type MockDeviceScenario = (typeof mockDeviceScenarios)[number]['value'];

/** Figma 예시 수치이며 실측·안전 임계값이 아니다. */
const sampleValues: Record<string, Record<string, number>> = {
  bh1750: { illuminance: 18.4 },
  ina219: { voltage: 5.01, current: 12, power: 60 },
  bme280: { temperature: 24.3, humidity: 46 },
};

export interface MockDiagnosticsInput {
  readonly definition: DeviceCheckDefinition;
  readonly scenario: MockDeviceScenario;
  readonly attemptId: string;
  readonly now: () => string;
}
export type MockDiagnosticsRunner = (
  input: MockDiagnosticsInput,
) => Promise<DeviceDiagnosticsReport>;

export function buildMockDiagnostics({
  definition,
  scenario,
  now,
}: MockDiagnosticsInput): DeviceDiagnosticsReport {
  const checkedAt = now();
  const disconnected = scenario === 'disconnected';
  return {
    source: 'mock',
    deviceId: definition.deviceId,
    connection: disconnected ? 'disconnected' : 'connected',
    checkedAt,
    issue: disconnected
      ? {
          code: 'MOCK_DEVICE_DISCONNECTED',
          message: 'Mock 장치에 연결되지 않았습니다. 실제 Orange Pi 연결 상태를 나타내지 않습니다.',
        }
      : undefined,
    sensors: definition.sensors.map((sensor, index) => {
      const status = disconnected
        ? 'disconnected'
        : index === 0 && scenario === 'sensorError'
          ? 'error'
          : index === 0 && scenario === 'timeout'
            ? 'timeout'
            : index === 0 && scenario === 'stale'
              ? 'stale'
              : 'passed';
      const issue =
        status === 'passed'
          ? undefined
          : {
              code: `MOCK_${status.toUpperCase()}`,
              message:
                status === 'error'
                  ? `${sensor.title} 통신 오류 시뮬레이션입니다. 점검 응답을 확인하지 못했습니다. 장치·배선 상태를 점검하는 절차를 확인한 뒤 Mock 시나리오를 정상 연결로 바꾸고 다시 점검해 주세요. 실제 장비 명령은 전송되지 않았습니다.`
                  : status === 'stale'
                    ? '이전 값 시뮬레이션 · 최신성 확인 실패. 안전 시간 기준은 확정하지 않았습니다.'
                    : status === 'timeout'
                      ? '응답 시간 초과 시뮬레이션 · 실제 장비의 제한 시간은 확정하지 않았습니다.'
                      : '장치 미연결로 센서 응답을 확인할 수 없습니다.',
            };
      return {
        sensorId: sensor.sensorId,
        status,
        checkedAt,
        issue,
        readings:
          status === 'passed' || status === 'stale'
            ? sensor.metrics.map((metric) => ({
                metricId: metric.id,
                value: sampleValues[sensor.sensorId]?.[metric.id] ?? null,
                unit: metric.unit,
                observedAt: status === 'stale' ? '2026-01-01T00:00:00.000Z' : checkedAt,
                source: 'mock' as const,
              }))
            : [],
      };
    }),
  };
}

export const runMockDiagnostics: MockDiagnosticsRunner = async (input) => {
  // 데모 지연만 재현한다. 실제 장치의 timeout·안전 기준이 아니다.
  await new Promise((resolve) => setTimeout(resolve, input.scenario === 'delayed' ? 3000 : 700));
  return buildMockDiagnostics(input);
};
