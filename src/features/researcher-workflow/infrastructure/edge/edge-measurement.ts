import type { WorkflowRepository } from '../../application/WorkflowRepository';
import { WorkflowError } from '../../domain/models';
import { parseEdgeSession } from './edge-session';
import { writeEdgeSession, type EdgeSessionRequest } from './edge-session-request';

export function withEdgeMeasurement(
  base: WorkflowRepository,
  request: EdgeSessionRequest,
): WorkflowRepository {
  async function latestSession(id: string, minimumRevision: number) {
    // The first GET may join a request already in flight before the write.
    let latest = await base.getSession(id).catch(() => null);
    if (latest && latest.revision < minimumRevision) {
      latest = await base.getSession(id).catch(() => null);
    }
    return latest && latest.revision >= minimumRevision ? latest : null;
  }

  return {
    createSession: (input) => base.createSession(input),
    getSession: (id) => base.getSession(id),
    heartbeat: base.heartbeat?.bind(base),
    subscribe: (id, listener, onReadError) => base.subscribe(id, listener, onReadError),
    async executeCommand(id, command, context) {
      if (
        command.type !== 'requestExecutionSample' &&
        command.type !== 'completeExecutionStep' &&
        command.type !== 'requestRecovery' &&
        command.type !== 'requestRecoveryRemeasurement'
      ) {
        return base.executeCommand(id, command, context);
      }
      const payload = { ...context, command };
      const { session, replayed } = await writeEdgeSession(
        request,
        `/sessions/${encodeURIComponent(id)}/commands`,
        payload,
        (value) => parseEdgeSession(value, id),
        { sessionId: id },
      ).catch(async (reason: unknown) => {
        if (!(reason instanceof WorkflowError) || !reason.replayed || !reason.session) throw reason;
        const latest = await latestSession(id, reason.session.revision);
        throw new WorkflowError(reason.code, reason.message, { session: latest ?? reason.session });
      });
      // The base repository fans out GET snapshots to existing subscribers.
      const latest = await latestSession(id, session.revision);
      if (latest) return latest;
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
