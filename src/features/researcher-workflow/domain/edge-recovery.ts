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
  const hold = 'holdReason' in session ? session.holdReason : undefined;
  const holdCode = hold && typeof hold === 'object' && 'code' in hold ? hold.code : undefined;
  if (typeof holdCode === 'string' && nonMeasurementHolds.has(holdCode)) return;

  const latest = attempts
    .slice()
    .reverse()
    .find((item) => item.cursor.cursorId === cursor.cursorId);
  const recovery = recoveries
    ?.slice()
    .reverse()
    .find(
      (item) =>
        item.cursor.cursorId === cursor.cursorId && item.sampleAttemptId === latest?.attemptId,
    );
  const blocked = recovery
    ? attempts.find((item) => item.attemptId === recovery.blockedAttemptId)
    : latest;
  if (
    !blocked ||
    blocked.cursor.cursorId !== cursor.cursorId ||
    blocked.purpose === 'recoveryCheck' ||
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
