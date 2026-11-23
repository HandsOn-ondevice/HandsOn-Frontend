import type { WorkflowRepository } from '../../application/WorkflowRepository';
import { WorkflowError } from '../../domain/models';
import { parseEdgeSession } from './edge-session';
import { writeEdgeSession, type EdgeSessionRequest } from './edge-session-request';

export function withEdgeMeasurement(
  base: WorkflowRepository,
  request: EdgeSessionRequest,
): WorkflowRepository {
  return {
    createSession: (input) => base.createSession(input),
    getSession: (id) => base.getSession(id),
    subscribe: (id, listener, onReadError) => base.subscribe(id, listener, onReadError),
    async executeCommand(id, command, context) {
      if (command.type !== 'requestExecutionSample' && command.type !== 'completeExecutionStep') {
        return base.executeCommand(id, command, context);
      }
      const payload = { ...context, command };
      const { session, replayed } = await writeEdgeSession(
        request,
        `/sessions/${encodeURIComponent(id)}/commands`,
        payload,
        (value) => parseEdgeSession(value, id),
      );
      // The base repository fans out GET snapshots to existing subscribers.
      let latest = await base.getSession(id).catch(() => null);
      if (latest && latest.revision < session.revision) {
        // The first GET may have joined a request already in flight before the write.
        latest = await base.getSession(id).catch(() => null);
      }
      if (latest && latest.revision >= session.revision) return latest;
      if (replayed) {
        throw new WorkflowError(
          'OUTCOME_UNKNOWN',
          '이전 요청은 처리되었지만 최신 상태를 확인하지 못했어요. 같은 요청을 다시 시도해 주세요.',
        );
      }
      return session;
    },
  };
}
