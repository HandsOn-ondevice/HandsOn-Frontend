import type { ExperimentSession } from './models';

export function needsEdgeRemeasurement(session: ExperimentSession | null) {
  const execution = session?.execution;
  return !!execution && 'needsRemeasurement' in execution && execution.needsRemeasurement === true;
}

export function selectEdgeRemeasurement(session: ExperimentSession | null) {
  if (session?.source !== 'api' || !session.execution?.cursor) return;
  const { cursor, attempts, recoveries } = session.execution;
  const recovery = recoveries
    ?.slice()
    .reverse()
    .find((item) => item.cursor.cursorId === cursor.cursorId);
  if (recovery?.status !== 'recovered') return;
  const latest = attempts
    .slice()
    .reverse()
    .find((item) => item.cursor.cursorId === cursor.cursorId);
  const blocked = attempts.find((item) => item.attemptId === recovery.blockedAttemptId);
  if (!blocked || blocked.cursor.cursorId !== cursor.cursorId) return;

  const required = needsEdgeRemeasurement(session);
  const attempt =
    latest?.purpose === 'remeasurement' &&
    latest.recoveryId === recovery.recoveryId &&
    latest.attemptId !== recovery.sampleAttemptId &&
    latest.attemptId !== blocked.attemptId
      ? latest
      : undefined;
  const canRequest = !!(
    session.phase === 'running' &&
    required &&
    !session.pendingJob &&
    !session.execution.pendingVoice &&
    latest?.purpose === 'recoveryCheck' &&
    latest.attemptId === recovery.sampleAttemptId
  );
  if (!canRequest && !attempt) return;
  return {
    cursor,
    recovery,
    blocked,
    attempt,
    canRequest,
    sampling:
      !!attempt &&
      session.pendingJob?.kind === 'sample' &&
      session.pendingJob.attemptId === attempt.attemptId,
    ready:
      session.phase === 'running' &&
      !required &&
      !session.pendingJob &&
      attempt?.status === 'ready' &&
      attempt.report?.source === 'api' &&
      attempt.report.attemptId === attempt.attemptId &&
      attempt.report.cursorId === cursor.cursorId,
  };
}
