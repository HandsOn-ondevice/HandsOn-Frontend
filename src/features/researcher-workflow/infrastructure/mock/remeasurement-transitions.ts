import { WorkflowError, type ExperimentSession, type WorkflowCommand } from '../../domain/models';
import { selectRemeasurement } from '../../domain/remeasurement';
import { beginExecutionSample } from './execution-transitions';
import type { TransitionMetadata } from './transition-engine';

export function beginRecoveryRemeasurement(
  session: ExperimentSession,
  command: Extract<WorkflowCommand, { type: 'requestRecoveryRemeasurement' }>,
  attemptId: string,
  meta: TransitionMetadata,
): ExperimentSession {
  const state = selectRemeasurement(session);
  if (
    !state.canRemeasure ||
    state.cursor?.cursorId !== command.cursorId ||
    state.recovery?.recoveryId !== command.recoveryId
  ) {
    throw new WorkflowError(
      'INVALID_STATE',
      '현재 복구가 확인된 조건과 회차에서 다시 측정해 주세요.',
    );
  }
  return beginExecutionSample(session, command.cursorId, attemptId, meta, 'remeasurement');
}
