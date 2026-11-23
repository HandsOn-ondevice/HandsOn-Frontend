import type { CreateSessionInput, WorkflowRepository } from '../../application/WorkflowRepository';
import { createRequestId } from '../../application/request-id';
import { selectDeviceCheck } from '../../domain/device-check';
import {
  WorkflowError,
  type CommandContext,
  type ExperimentSession,
  type WorkflowCommand,
} from '../../domain/models';
import { parseEdgeSession } from './edge-session';
import { readEdgeSession, writeEdgeSession, type EdgeSessionRequest } from './edge-session-request';

const DEVICE_CHECK_POLL_INTERVAL_MS = 600;

type Listener = (session: ExperimentSession) => void;
type WatchedSession = {
  listeners: Map<Listener, ((error: unknown) => void) | undefined>;
  latest?: ExperimentSession;
  timer?: ReturnType<typeof setTimeout>;
};

type ApprovedSelection = {
  procedureId: string;
  procedureVersion: string;
};

type Creation = {
  requestId: string;
  result?: Promise<ExperimentSession>;
};

export class EdgeWorkflowRepository implements WorkflowRepository {
  private readonly reads = new Map<string, Promise<ExperimentSession>>();
  private readonly watched = new Map<string, WatchedSession>();
  private readonly creations = new Map<string, Creation>();

  constructor(private readonly request: EdgeSessionRequest) {}

  startApprovedSession(selection: ApprovedSelection) {
    const key = JSON.stringify(selection);
    const creation = this.creations.get(key) ?? { requestId: createRequestId() };
    this.creations.set(key, creation);
    creation.result ??= this.createApprovedSession(selection, creation.requestId).then(
      (session) => {
        this.creations.delete(key);
        return session;
      },
      (reason: unknown) => {
        // Keep the original request ID when neither response confirms the outcome.
        if (reason instanceof WorkflowError && reason.code === 'OUTCOME_UNKNOWN') {
          creation.result = undefined;
        } else {
          this.creations.delete(key);
        }
        throw reason;
      },
    );
    return creation.result;
  }

  createSession(input: CreateSessionInput) {
    return this.createApprovedSession(
      {
        procedureId: input.procedure.procedureId,
        procedureVersion: input.procedure.version,
      },
      input.requestId,
      input.operatorId,
    );
  }

  private async createApprovedSession(
    selection: ApprovedSelection,
    requestId: string,
    operatorId = 'operator-01',
  ) {
    const payload = { requestId, ...selection, workProfileId: 'kit-distance-v1', operatorId };
    const { session } = await writeEdgeSession(this.request, '/sessions', payload, (value) => {
      const session = parseEdgeSession(value);
      if (
        session.procedure.procedureId !== selection.procedureId ||
        session.procedure.version !== selection.procedureVersion ||
        session.operatorId !== operatorId
      ) {
        throw new WorkflowError('EDGE_REJECTED', '선택한 절차·버전에 해당하는 세션이 아닙니다.');
      }
      return session;
    });
    return session;
  }

  getSession(sessionId: string) {
    const existing = this.reads.get(sessionId);
    if (existing) return existing;
    const read = readEdgeSession(this.request, `/sessions/${encodeURIComponent(sessionId)}`)
      .then((value) => this.publish(parseEdgeSession(value, sessionId)))
      .finally(() => this.reads.delete(sessionId));
    this.reads.set(sessionId, read);
    return read;
  }

  async executeCommand(sessionId: string, command: WorkflowCommand, context: CommandContext) {
    if (
      command.type !== 'setPreparationCheck' &&
      command.type !== 'completePreparation' &&
      command.type !== 'startDeviceCheck' &&
      command.type !== 'startExecution'
    ) {
      throw new WorkflowError('INVALID_STATE', '이 단계의 Edge 명령은 아직 연결되지 않았어요.');
    }
    const payload = { ...context, command };
    const { session, replayed } = await writeEdgeSession(
      this.request,
      `/sessions/${encodeURIComponent(sessionId)}/commands`,
      payload,
      (value) => parseEdgeSession(value, sessionId),
    );
    if (replayed) {
      // A poll might have begun before the write. Re-read after it settles.
      await this.reads.get(sessionId)?.catch(() => null);
      const latest = await this.getSession(sessionId).catch(() => null);
      if (latest) return latest;
    }
    return this.publish(session);
  }

  subscribe(sessionId: string, listener: Listener, onReadError?: (error: unknown) => void) {
    const watched: WatchedSession = this.watched.get(sessionId) ?? { listeners: new Map() };
    watched.listeners.set(listener, onReadError);
    this.watched.set(sessionId, watched);
    return () => {
      watched.listeners.delete(listener);
      if (!watched.listeners.size) {
        clearTimeout(watched.timer);
        this.watched.delete(sessionId);
      }
    };
  }

  private publish(next: ExperimentSession): ExperimentSession {
    const watched = this.watched.get(next.sessionId);
    if (!watched) return next;
    if (watched.latest && watched.latest.revision > next.revision) return watched.latest;
    watched.latest = next;
    for (const listener of watched.listeners.keys()) listener(next);
    if (selectDeviceCheck(next).checking) {
      this.pollDuringDeviceCheck(next.sessionId, watched);
    } else {
      clearTimeout(watched.timer);
      watched.timer = undefined;
    }
    return next;
  }

  private pollDuringDeviceCheck(sessionId: string, watched: WatchedSession) {
    if (
      this.watched.get(sessionId) !== watched ||
      !watched.latest ||
      !selectDeviceCheck(watched.latest).checking ||
      watched.timer !== undefined
    ) {
      return;
    }
    watched.timer = setTimeout(() => {
      watched.timer = undefined;
      void this.getSession(sessionId).catch((error: unknown) => {
        for (const onReadError of watched.listeners.values()) onReadError?.(error);
      });
    }, DEVICE_CHECK_POLL_INTERVAL_MS);
  }
}
