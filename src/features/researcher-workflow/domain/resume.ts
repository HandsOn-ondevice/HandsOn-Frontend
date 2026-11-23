import { selectExecution } from './execution';
import {
  validateDiagnostics,
  type DeviceDiagnosticsReport,
  type DiagnosticIssue,
} from './device-check';
import type { ExperimentSession } from './models';

export type ResumeCheckTarget = 'connection' | 'voltage';

export interface ResumeCheckAttempt {
  readonly attemptId: string;
  readonly target: ResumeCheckTarget;
  readonly pauseEventId: string;
  readonly cursorId: string;
  readonly status: 'checking' | 'passed' | 'failed';
  readonly startedAt: string;
  readonly completedAt?: string;
  readonly report?: DeviceDiagnosticsReport;
  readonly issue?: DiagnosticIssue;
  readonly operatorConfirmed: boolean;
}

export function resumeReportIssue(
  session: ExperimentSession,
  attempt: ResumeCheckAttempt,
  report: DeviceDiagnosticsReport,
  receivedAt: string,
): DiagnosticIssue | undefined {
  const definition = session.procedure.deviceCheck;
  // 전압은 해당 센서·측정만 검사한다. 다른 카드의 성공/실패를 복사하지 않는다.
  const voltageSensors = definition?.sensors
    .filter((sensor) => sensor.metrics.some((metric) => metric.id === 'voltage'))
    .map((sensor) => ({
      ...sensor,
      required: true,
      metrics: sensor.metrics.filter((metric) => metric.id === 'voltage'),
    }));
  const sensors =
    attempt.target === 'voltage'
      ? report.sensors.filter((sensor) =>
          voltageSensors?.some((item) => item.sensorId === sensor.sensorId),
        )
      : report.sensors;
  if (
    report.source !== session.source ||
    sensors.some((sensor) => sensor.readings.some((reading) => reading.source !== session.source))
  ) {
    return { code: 'INVALID_SOURCE', message: '현재 세션과 같은 출처의 재확인 응답이 필요합니다.' };
  }
  const issue =
    attempt.target === 'voltage'
      ? validateDiagnostics(definition && { ...definition, sensors: voltageSensors ?? [] }, {
          ...report,
          sensors,
        })
      : validateConnection(session, report);
  if (issue) return issue;
  const start = Date.parse(attempt.startedAt);
  const end = Date.parse(receivedAt);
  const times = [
    report.checkedAt,
    ...sensors.flatMap((sensor) => [
      sensor.checkedAt,
      ...sensor.readings
        .filter((reading) => attempt.target === 'connection' || reading.metricId === 'voltage')
        .map((reading) => reading.observedAt),
    ]),
  ];
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    end < start ||
    times.some(
      (time) =>
        !Number.isFinite(Date.parse(time)) || Date.parse(time) < start || Date.parse(time) > end,
    )
  ) {
    return {
      code: 'INVALID_RESUME_TIME',
      message: '이번 재확인 요청 이후의 새 응답이 필요합니다.',
    };
  }
  // 표시 가능한 전압의 형식을 확인할 뿐, 미확정 안전 범위는 판정하지 않는다.
  if (attempt.target !== 'voltage') return;
  const voltage = sensors
    .flatMap((sensor) => sensor.readings)
    .find((reading) => reading.metricId === 'voltage' && reading.unit === 'V');
  if (!voltage || voltage.value === null || !Number.isFinite(voltage.value)) {
    return { code: 'MISSING_RESUME_VOLTAGE', message: '절차에 따른 공급 전압 응답이 필요합니다.' };
  }
}

function validateConnection(session: ExperimentSession, report: DeviceDiagnosticsReport) {
  const definition = session.procedure.deviceCheck;
  const required = definition?.sensors.filter((sensor) => sensor.required);
  if (
    !required?.length ||
    new Set(required.map((sensor) => sensor.sensorId)).size !== required.length
  )
    return { code: 'MISSING_DEFINITION', message: '필수 장치·센서 정의가 필요합니다.' };
  if (report.deviceId !== definition?.deviceId || report.connection !== 'connected' || report.issue)
    return (
      report.issue ?? { code: 'DEVICE_DISCONNECTED', message: '장치 연결을 확인하지 못했습니다.' }
    );
  for (const sensor of required) {
    const matches = report.sensors.filter((item) => item.sensorId === sensor.sensorId);
    const result = matches[0];
    if (matches.length !== 1 || result?.status !== 'passed' || result.issue)
      return (
        result?.issue ?? {
          code: 'SENSOR_INCOMPLETE',
          message: `${sensor.title} 연결을 확인해 주세요.`,
        }
      );
    if (Date.parse(result.checkedAt) > Date.parse(report.checkedAt))
      return { code: 'INVALID_REPORT', message: '센서 연결 응답 시각을 확인해 주세요.' };
  }
}

export function selectResume(session: ExperimentSession) {
  const execution = selectExecution(session);
  const pause = [...session.events]
    .reverse()
    .find(
      (event) =>
        event.type === 'executionPaused' && event.cursor?.cursorId === execution.cursor?.cursorId,
    );
  const paused = session.phase === 'paused' && !!pause && !!execution.cursor;
  const attempts = (session.resumeChecks ?? []).filter(
    (item) => item.pauseEventId === pause?.eventId && item.cursorId === execution.cursor?.cursorId,
  );
  const card = (target: ResumeCheckTarget) => {
    const attempt = attempts.findLast((item) => item.target === target);
    const passed =
      paused &&
      attempt?.status === 'passed' &&
      !!attempt.report &&
      !!attempt.completedAt &&
      !resumeReportIssue(session, attempt, attempt.report, attempt.completedAt);
    return { attempt, passed, checking: paused && attempt?.status === 'checking' };
  };
  const connection = card('connection');
  const voltageCheck = card('voltage');
  const attempt = attempts.at(-1);
  const passed = connection.passed && voltageCheck.passed;
  const voltage = voltageCheck.attempt?.report?.sensors
    .flatMap((sensor) => sensor.readings)
    .find((reading) => reading.metricId === 'voltage' && reading.unit === 'V');
  return {
    ...execution,
    pause,
    paused,
    attempt,
    connection,
    voltageCheck,
    passed,
    voltage,
    checking: connection.checking || voltageCheck.checking,
    canResume: passed && attempt?.operatorConfirmed === true,
  };
}
