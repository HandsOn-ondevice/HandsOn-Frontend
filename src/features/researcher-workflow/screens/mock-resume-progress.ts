import type { ExperimentSession } from '../domain/models';

/** v0.1 초안의 준비 8 + 조건 측정 5 + 종료 3. Mock S11 표시 전용이며 승인 절차를 바꾸지 않는다. */
const measurementSteps = ['output-0', 'output-25', 'output-50', 'output-75', 'output-100'];

export function mockResumeProgress(session: ExperimentSession) {
  const cursor = session.execution?.cursor;
  if (
    session.source !== 'mock' ||
    !cursor ||
    session.procedure.execution?.profileVersion !== 'led-draft-1'
  )
    return undefined;
  const condition = session.procedure.execution.conditions.find(
    (item) => item.id === cursor.conditionId,
  );
  const index = measurementSteps.indexOf(cursor.conditionId);
  if (index < 0 || !condition || cursor.trialIndex < 1 || cursor.trialIndex > condition.repetitions)
    return undefined;
  const step = 8 + index + 1;
  // N은 재개할 단계의 위치다. 각 조건의 1~3회차는 같은 단계에 속한다.
  return { step, total: 16, percentage: Math.round((step / 16) * 100) };
}
