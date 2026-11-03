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
  /** S05 응답은 현재 점검 시도의 ID를 되돌려줘야 한다. S06 진단 스냅샷과는 별개다. */
  readonly attemptId?: string;
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
  readonly validation?: DeviceCheckValidation;
}

export interface SensorCheckValidation {
  readonly sensorId: string;
  readonly valid: boolean;
  readonly status: SensorDiagnostic['status'];
  readonly issue?: DiagnosticIssue;
}
export interface DeviceCheckValidation {
  readonly issue?: DiagnosticIssue;
  readonly sensors: readonly SensorCheckValidation[];
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
    !!latest.completedAt &&
    !!latest.validation &&
    !validateDeviceCheckReport(session.procedure.deviceCheck, latest.report, {
      attemptId: latest.attemptId,
      startedAt: latest.startedAt,
      receivedAt: latest.completedAt,
      source: session.source,
    }).issue &&
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

/** 요청과 응답의 상관관계·인과 순서만 확인한다. 경과 시간 TTL이나 안전 범위가 아니다. */
export function validateDeviceCheckReport(
  definition: DeviceCheckDefinition | undefined,
  report: DeviceDiagnosticsReport,
  context: { attemptId: string; startedAt: string; receivedAt: string; source: 'mock' | 'api' },
): DeviceCheckValidation {
  const start = Date.parse(context.startedAt);
  const end = Date.parse(context.receivedAt);
  const reportTime = Date.parse(report.checkedAt);
  const genericIssue = validateDiagnostics(definition, report);
  const contextIssue: DiagnosticIssue | undefined =
    report.source !== context.source
      ? { code: 'INVALID_SOURCE', message: '점검 응답의 출처를 확인할 수 없습니다.' }
      : report.attemptId !== context.attemptId
        ? {
            code: 'ATTEMPT_MISMATCH',
            message: '현재 점검 요청과 다른 응답입니다. 다시 점검해 주세요.',
          }
        : !Number.isFinite(start) ||
            !Number.isFinite(end) ||
            end < start ||
            !Number.isFinite(reportTime) ||
            reportTime < start ||
            reportTime > end
          ? {
              code: 'INVALID_REPORT_TIME',
              message: '현재 점검 기간에 해당하는 응답이 아닙니다. 다시 점검해 주세요.',
            }
          : genericIssue?.code === 'MISSING_DEFINITION'
            ? genericIssue
            : undefined;
  const sensors = (definition?.sensors ?? []).map((requirement): SensorCheckValidation => {
    const raw = report.sensors.find((item) => item.sensorId === requirement.sensorId);
    const issue =
      contextIssue ??
      validateDiagnostics(
        definition && { ...definition, sensors: [{ ...requirement, required: true }] },
        report,
      ) ??
      (raw &&
      (Date.parse(raw.checkedAt) < start ||
        raw.readings.some((reading) => Date.parse(reading.observedAt) < start))
        ? {
            code: 'STALE_READING',
            message: `${requirement.title}의 현재 점검 이전 값입니다. 다시 점검해 주세요.`,
          }
        : undefined);
    return {
      sensorId: requirement.sensorId,
      valid: !issue,
      status: !issue ? 'passed' : raw && raw.status !== 'passed' ? raw.status : 'error',
      issue,
    };
  });
  return {
    issue:
      contextIssue ??
      genericIssue ??
      sensors.find(
        (item) =>
          !item.valid &&
          definition?.sensors.find((sensor) => sensor.sensorId === item.sensorId)?.required,
      )?.issue,
    sensors,
  };
}
