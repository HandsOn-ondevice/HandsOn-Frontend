import { selectCompletionReview, selectResult } from '../domain/completion';
import { selectResume } from '../domain/resume';
import { WorkflowError, type ExperimentSession } from '../domain/models';
import type { WorkflowRepository } from './WorkflowRepository';

/** ID를 생략하면 세션의 현재 완료 결과, 지정하면 그 결과와의 정확한 일치를 요구한다. */
export function matchesWorkflowResult(
  session: ExperimentSession,
  resultId?: string | readonly string[],
) {
  return (
    selectResult(session).available &&
    (resultId === undefined ||
      (typeof resultId === 'string' && resultId === session.completion?.resultId))
  );
}

export function selectWorkflowSessionSummary(session: ExperimentSession) {
  const review = selectCompletionReview(session);
  const cursor = session.execution?.cursor ?? null;
  const condition = session.procedure.execution?.conditions.find(
    (item) => item.id === cursor?.conditionId,
  );
  return {
    sessionId: session.sessionId,
    phase: session.phase,
    source: session.source,
    revision: session.revision,
    title: session.procedure.title,
    deviceId: session.procedure.deviceId,
    procedureVersion: session.procedure.version,
    updatedAt: session.updatedAt,
    cursor,
    condition: condition ? { id: condition.id, label: condition.label } : null,
    progress: {
      validMeasurements: review.validCount,
      totalMeasurements: review.required,
      percentage: review.required ? Math.round((review.validCount / review.required) * 100) : 0,
    },
    resultId: matchesWorkflowResult(session) ? session.completion!.resultId! : null,
    canOpenResume: selectResume(session).paused,
  } as const;
}

/** 명령·생성·초기화를 노출하지 않는 조회 전용 facade. getSession은 분리된 스냅샷을 반환한다. */
export function createWorkflowQueries(repository: Pick<WorkflowRepository, 'getSession'>) {
  return Object.freeze({
    async getSessionSummary(sessionId: string) {
      return selectWorkflowSessionSummary(await repository.getSession(sessionId));
    },
    async getResult(sessionId: string, resultId: string) {
      const session = await repository.getSession(sessionId);
      if (!matchesWorkflowResult(session, resultId))
        throw new WorkflowError('NOT_FOUND', '요청한 세션의 완료 결과를 찾을 수 없습니다.');
      return session;
    },
  });
}
