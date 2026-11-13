import { selectExecution } from './execution';
import type { ExperimentSession } from './models';
import { recoverySampleIssue } from './recovery';

/** S09는 현재 복구 확인 기록을 조회한다. 진입 자체는 측정·완료 명령이 아니다. */
export function selectRemeasurement(session: ExperimentSession) {
  const state = selectExecution(session);
  const recovery =
    state.recovery?.cursor.cursorId === state.cursor?.cursorId ? state.recovery : undefined;
  const probe = session.execution?.attempts.find(
    (item) => item.attemptId === recovery?.sampleAttemptId,
  );
  const blocked = session.execution?.attempts.find(
    (item) => item.attemptId === recovery?.blockedAttemptId,
  );
  const verified =
    !!recovery &&
    recovery.status === 'recovered' &&
    !!probe &&
    !!blocked &&
    probe.cursor.cursorId === state.cursor?.cursorId &&
    blocked.cursor.cursorId === state.cursor?.cursorId &&
    !!probe.receivedAt &&
    !recoverySampleIssue(session, probe, probe.receivedAt);
  const started =
    verified &&
    state.latest?.purpose === 'remeasurement' &&
    state.latest.recoveryId === recovery.recoveryId;
  const sensorId = blocked?.report?.diagnostics.sensors.find(
    (sensor) => sensor.status !== 'passed' || sensor.issue,
  )?.sensorId;
  const sensor =
    probe?.report?.diagnostics.sensors.find((item) => item.sensorId === sensorId) ??
    probe?.report?.diagnostics.sensors[0];
  const requirement = session.procedure.deviceCheck?.sensors.find(
    (item) => item.sensorId === sensor?.sensorId,
  );
  return {
    ...state,
    recovery,
    probe,
    blocked,
    sensor,
    requirement,
    available: state.authorized && state.configured && verified && !state.requiresRecovery,
    canRemeasure: verified && state.canRemeasure,
    started: !!started,
    history: session.events.filter(
      (event) =>
        event.cursor?.cursorId === state.cursor?.cursorId &&
        [
          'executionSampleRejected',
          'recoveryRequested',
          'recoveryFailed',
          'recoverySucceeded',
        ].includes(event.type),
    ),
  };
}
