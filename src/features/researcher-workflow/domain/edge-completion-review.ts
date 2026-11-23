import { validExecutionDefinition } from './execution';
import type { ExperimentSession } from './models';

export function selectEdgeCompletionReview(session: ExperimentSession) {
  const definition = session.procedure.execution;
  if (!definition || !validExecutionDefinition(definition)) return { allValid: false };

  const slots = definition.conditions.flatMap(({ id, label, repetitions }) =>
    Array.from({ length: repetitions }, (_, index) => ({
      conditionId: id,
      label,
      trialIndex: index + 1,
    })),
  );
  const accepted = session.execution?.attempts.filter(({ status }) => status === 'valid') ?? [];
  const acceptedAttemptIds = new Set(
    session.evidence
      .filter(({ action }) => action === 'measurementAccepted')
      .map(({ attemptId }) => attemptId),
  );
  const firstIssue = slots.find(({ conditionId, trialIndex }) => {
    const matches = accepted.filter(
      ({ cursor }) => cursor.conditionId === conditionId && cursor.trialIndex === trialIndex,
    );
    return (
      matches.length !== 1 ||
      matches[0].purpose === 'recoveryCheck' ||
      !acceptedAttemptIds.has(matches[0].attemptId)
    );
  });
  return { firstIssue, allValid: !firstIssue && accepted.length === slots.length };
}
