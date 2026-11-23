import type { ExperimentSession } from './models';

/** 실행 응답의 조회용 투영. S05 점검을 현재 응답으로 대체하거나 명령을 실행하지 않는다. */
export function selectSessionDeviceStatus(session: ExperimentSession) {
  const attempt = session.execution?.attempts.at(-1);
  const sample = attempt?.report;
  const diagnostics = sample?.diagnostics;
  const definition = session.procedure.deviceCheck;
  const matches =
    !!attempt &&
    (sample?.attemptId === undefined || sample.attemptId === attempt.attemptId) &&
    sample?.cursorId === attempt.cursor.cursorId &&
    sample?.source === session.source &&
    diagnostics?.source === session.source &&
    diagnostics?.deviceId === definition?.deviceId &&
    Number.isFinite(Date.parse(diagnostics.checkedAt));
  const report = matches ? diagnostics : undefined;

  return {
    attempt,
    report,
    deviceTitle: definition?.title ?? '장치',
    condition: session.procedure.execution?.conditions.find(
      (item) => item.id === attempt?.cursor.conditionId,
    ),
    sensors: (definition?.sensors ?? []).map((sensor) => {
      const result = report?.sensors.find((item) => item.sensorId === sensor.sensorId);
      const status = result?.status;
      const readable = status === 'passed' || status === 'stale';
      const metrics = sensor.metrics.map((metric) => {
        const reading = result?.readings.find((item) => item.metricId === metric.id);
        const value =
          readable &&
          reading?.source === session.source &&
          reading.unit === metric.unit &&
          reading.value !== null &&
          reading.value !== undefined &&
          Number.isFinite(reading.value) &&
          Number.isFinite(Date.parse(reading.observedAt))
            ? reading.value
            : null;
        return { ...metric, value, observedAt: value === null ? undefined : reading?.observedAt };
      });
      return { ...sensor, result, metrics };
    }),
  };
}
