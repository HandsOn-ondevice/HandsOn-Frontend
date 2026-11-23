import { currentEdgeHold } from './edge-hold';
import type { ExperimentSession } from './models';

const nonMeasurementHolds = new Set([
  'USER_PAUSED',
  'CLIENT_DISCONNECTED',
  'SERVICE_RESTARTED',
  'ACTUATOR_FAILURE',
  'JOB_FAILED',
]);

export function selectEdgeRecovery(session: ExperimentSession | null) {
  if (session?.source !== 'api' || !session.execution?.cursor) return;
  const { cursor, attempts, recoveries } = session.execution;
  const strict = session.resumePolicyVersion === '2.0';
  const hold = currentEdgeHold(session);
  if (strict) {
    if (session.phase === 'held' && !hold?.allowedCommands.includes('requestRecovery')) return;
    if (
      session.phase === 'running' &&
      session.hold?.nextSampleCommand !== 'requestRecoveryRemeasurement'
    )
      return;
  } else if (session.holdReason?.code && nonMeasurementHolds.has(session.holdReason.code)) {
    return;
  }

  const latest = attempts.findLast((item) => item.cursor?.cursorId === cursor.cursorId);
  const recovery = recoveries?.findLast(
    (item) =>
      item.cursor?.cursorId === cursor.cursorId && item.sampleAttemptId === latest?.attemptId,
  );
  const blocked =
    recovery && (!strict || recovery.status !== 'failed')
      ? attempts.find((item) => item.attemptId === recovery.blockedAttemptId)
      : latest;
  if (
    !blocked ||
    blocked.cursor?.cursorId !== cursor.cursorId ||
    (!strict && blocked.purpose === 'recoveryCheck') ||
    (blocked.status !== 'held' && blocked.status !== 'error')
  )
    return;

  const checking =
    recovery?.status === 'checking' &&
    session.pendingJob?.kind === 'sample' &&
    session.pendingJob.attemptId === recovery.sampleAttemptId;
  const recovered = session.phase === 'running' && recovery?.status === 'recovered';
  if (session.phase !== 'held' && !recovered) return;

  return {
    cursor,
    blocked,
    recovery,
    checking,
    recovered,
    canRecover:
      session.phase === 'held' &&
      !session.pendingJob &&
      (!recovery || recovery.status === 'failed'),
  };
}
