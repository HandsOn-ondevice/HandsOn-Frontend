import type { DeviceCheckDefinition } from '../../domain/device-check';
import type {
  ExecutionCursor,
  ExecutionDefinition,
  ExecutionSampleReport,
} from '../../domain/execution';
import { buildMockDiagnostics } from './device-check-scenarios';

export const mockExecutionScenarios = [
  { value: 'normal', label: '정상 응답' },
  { value: 'waiting', label: '안정화 대기' },
  { value: 'stale', label: '오래된 값 · 보류' },
  { value: 'noResponse', label: '응답 없음' },
  { value: 'error', label: '통신 오류' },
  { value: 'held', label: '작업 보류' },
] as const;
export type MockExecutionScenario = (typeof mockExecutionScenarios)[number]['value'];
export interface MockExecutionInput {
  /** 새 Mock 세션 생성 시 고정한 합성 이전 측정 시각. 안전 판정 기준이 아니다. */
  readonly initialStaleObservedAt?: string;
  readonly sampleAttemptId: string;
  readonly definition: DeviceCheckDefinition;
  readonly executionDefinition: ExecutionDefinition;
  readonly cursor: ExecutionCursor;
  readonly scenario: MockExecutionScenario;
  readonly now: () => string;
}
export type MockExecutionRunner = (input: MockExecutionInput) => Promise<ExecutionSampleReport>;

export function buildMockExecutionReport(input: MockExecutionInput): ExecutionSampleReport {
  const scenario =
    input.scenario === 'stale'
      ? 'stale'
      : input.scenario === 'noResponse'
        ? 'timeout'
        : input.scenario === 'error'
          ? 'sensorError'
          : 'normal';
  const diagnostics = buildMockDiagnostics({
    definition: input.definition,
    scenario,
    attemptId: input.sampleAttemptId,
    now: input.now,
  });
  const index = input.executionDefinition.conditions.findIndex(
    (item) => item.id === input.cursor.conditionId,
  );
  // Figma 대표 시나리오의 합성 수치. 출력 명령·센서 정상 범위를 뜻하지 않는다.
  const illuminance = [18.4, 210, 420, 610, 810][index] ?? 0;
  return {
    attemptId: input.sampleAttemptId,
    cursorId: input.cursor.cursorId,
    source: 'mock',
    stability: input.scenario === 'waiting' ? 'waiting' : 'stable',
    holdReason:
      input.scenario === 'held'
        ? '현재 작업을 보류했습니다. 이 회차는 완료되지 않았습니다. 상태를 확인한 후 측정값을 다시 요청해 주세요.'
        : undefined,
    diagnostics: {
      ...diagnostics,
      sensors: diagnostics.sensors.map((sensor) => ({
        ...sensor,
        readings: sensor.readings.map((reading) => ({
          ...reading,
          observedAt:
            sensor.status === 'stale' && input.initialStaleObservedAt
              ? input.initialStaleObservedAt
              : reading.observedAt,
          value:
            reading.metricId === 'illuminance'
              ? illuminance
              : reading.metricId === 'current'
                ? 83
                : reading.metricId === 'power'
                  ? 416
                  : reading.value,
        })),
      })),
    },
  };
}

export const runMockExecutionSample: MockExecutionRunner = async (input) => {
  // 단순한 비동기 UI 시뮬레이션. 5초 초안의 실제 안전 타이머를 구현하지 않는다.
  await new Promise((resolve) => setTimeout(resolve, 500));
  return buildMockExecutionReport(input);
};
