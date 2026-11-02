import type { ExperimentSession } from './models';

/** 기능 내부 계약 초안. 실제 장비의 임계값·API DTO가 아니다. */
export interface DeviceCheckDefinition {
  readonly deviceId: string;
  readonly title: string;
  readonly sensors: readonly SensorRequirement[];
}

export interface SensorRequirement {
  readonly sensorId: string;
  readonly title: string;
  readonly description: string;
  readonly required: boolean;
  readonly metrics: readonly {
    readonly id: string;
    readonly label: string;
    readonly unit: string;
  }[];
}

export interface SensorReading {
  readonly metricId: string;
  readonly value: number | null;
  readonly unit: string;
  readonly observedAt: string;
  readonly source: 'mock' | 'api';
}

export interface DiagnosticIssue {
  readonly code: string;
  readonly message: string;
}

export interface SensorDiagnostic {
  readonly sensorId: string;
  readonly status: 'passed' | 'disconnected' | 'error' | 'timeout' | 'stale';
  readonly checkedAt: string;
  readonly readings: readonly SensorReading[];
  readonly issue?: DiagnosticIssue;
}

export interface DeviceDiagnosticsReport {
  readonly source: 'mock' | 'api';
  readonly deviceId: string;
  readonly connection: 'connected' | 'disconnected' | 'error';
  readonly checkedAt: string;
  readonly sensors: readonly SensorDiagnostic[];
  readonly issue?: DiagnosticIssue;
}

export interface DeviceCheckAttempt {
  readonly attemptId: string;
  readonly status: 'checking' | 'passed' | 'failed';
  readonly startedAt: string;
  readonly completedAt?: string;
  readonly report?: DeviceDiagnosticsReport;
  readonly issue?: DiagnosticIssue;
}

/** 수치의 안전 범위나 최신성 초 단위를 추정하지 않는다. 진단 결과·측정 형식만 검사한다. */
export function validateDiagnostics(
  definition: DeviceCheckDefinition | undefined,
  report: DeviceDiagnosticsReport,
): DiagnosticIssue | undefined {
  if (
    !definition ||
    definition.sensors.length === 0 ||
    !definition.sensors.some((sensor) => sensor.required) ||
    new Set(definition.sensors.map((sensor) => sensor.sensorId)).size !== definition.sensors.length
  ) {
    return { code: 'MISSING_DEFINITION', message: '절차에 필수 장치·센서 점검 정의가 필요합니다.' };
  }
  if (report.deviceId !== definition.deviceId || report.connection !== 'connected') {
    return (
      report.issue ?? { code: 'DEVICE_DISCONNECTED', message: '장치 연결을 확인하지 못했습니다.' }
    );
  }
  if (!Number.isFinite(Date.parse(report.checkedAt)) || report.issue) {
    return (
      report.issue ?? {
        code: 'INVALID_REPORT',
        message: '장치 점검 응답의 시각을 확인할 수 없습니다.',
      }
    );
  }
  for (const required of definition.sensors.filter((sensor) => sensor.required)) {
    const matches = report.sensors.filter((sensor) => sensor.sensorId === required.sensorId);
    const result = matches[0];
    if (matches.length !== 1 || !result || result.status !== 'passed' || result.issue) {
      return (
        result?.issue ?? {
          code: 'SENSOR_INCOMPLETE',
          message: `${required.title} 필수 점검이 완료되지 않았습니다.`,
        }
      );
    }
    if (
      !required.metrics.length ||
      !Number.isFinite(Date.parse(result.checkedAt)) ||
      Date.parse(result.checkedAt) > Date.parse(report.checkedAt)
    ) {
      return {
        code: 'INVALID_READING',
        message: `${required.title} 측정 정의 또는 확인 시각이 없습니다.`,
      };
    }
    for (const metric of required.metrics) {
      const readings = result.readings.filter((reading) => reading.metricId === metric.id);
      const reading = readings[0];
      if (
        readings.length !== 1 ||
        !reading ||
        reading.value === null ||
        !Number.isFinite(reading.value) ||
        reading.unit !== metric.unit ||
        reading.source !== report.source ||
        !Number.isFinite(Date.parse(reading.observedAt)) ||
        Date.parse(reading.observedAt) > Date.parse(result.checkedAt)
      ) {
        return {
          code: 'INVALID_READING',
          message: `${required.title} ${metric.label} 값·단위·측정 시각을 확인해 주세요.`,
        };
      }
    }
  }
}

export function selectDeviceCheck(session: ExperimentSession) {
  const latest = session.deviceChecks.at(-1);
  const preparationComplete = session.procedure.preparation
    .filter((item) => item.requiredForDeviceCheck)
    .every((item) => session.checks.some((check) => check.id === item.id && check.checked));
  const communication = session.checks.find((check) => check.id === 'communication');
  const passed =
    latest?.status === 'passed' &&
    !!latest.report &&
    !validateDiagnostics(session.procedure.deviceCheck, latest.report) &&
    preparationComplete &&
    communication?.checked === true &&
    session.evidence.some(
      (item) =>
        item.evidenceId === communication.evidenceId &&
        item.attemptId === latest.attemptId &&
        item.checkId === 'communication' &&
        item.action === 'deviceCheckPassed' &&
        item.source === session.source,
    );
  return {
    latest,
    checking: latest?.status === 'checking',
    preparationComplete,
    canInspect:
      preparationComplete &&
      (session.phase === 'awaitingDeviceCheck' || session.phase === 'readyToExecute') &&
      latest?.status !== 'checking' &&
      !!session.procedure.deviceCheck,
    canStart: session.phase === 'readyToExecute' && passed,
    executionStarted: session.phase === 'running' && passed,
  };
}
