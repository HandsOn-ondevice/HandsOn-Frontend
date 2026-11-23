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

const JOB_POLL_INTERVAL_MS = 600;

function hasPendingJob(session: ExperimentSession) {
  return selectDeviceCheck(session).checking || session.pendingJob?.kind === 'sample';
}

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

type ExecutionTransition = Extract<
  WorkflowCommand,
  { type: 'pauseExecution' | 'resumePausedExecution' }
>;

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
    const payload = {
      requestId,
      ...selection,
      workProfileId: 'kit-distance-v1',
      operatorId,
      workflowVersion: '2.0',
    };
    const { session } = await writeEdgeSession(this.request, '/sessions', payload, (value) => {
      const session = parseEdgeSession(value);
      if (session.workflowVersion !== '2.0') {
        throw new WorkflowError(
          'WORKFLOW_VERSION_REQUIRED',
          '정리와 결과 제출을 지원하는 Edge 서버에 연결해 주세요.',
        );
      }
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

  async heartbeat(sessionId: string, signal?: AbortSignal) {
    await this.request(`/sessions/${encodeURIComponent(sessionId)}/heartbeat`, {
      heartbeat: true,
      signal,
    });
  }

  async executeCommand(sessionId: string, command: WorkflowCommand, context: CommandContext) {
    switch (command.type) {
      case 'pauseExecution':
      case 'resumePausedExecution':
        await this.checkExecutionTransition(sessionId, command, context.expectedRevision);
        return this.writeCommand(
          sessionId,
          { type: command.type === 'pauseExecution' ? 'pause' : 'resume' },
          context,
        );
      case 'setPreparationCheck':
      case 'completePreparation':
      case 'startDeviceCheck':
      case 'startExecution':
      case 'requestExecutionSample':
      case 'completeExecutionStep':
      case 'requestCleanup':
      case 'setCleanupCheck':
      case 'submitResult':
        return this.writeCommand(sessionId, command, context);
      default:
        throw new WorkflowError('INVALID_STATE', '이 단계의 Edge 명령은 아직 연결되지 않았어요.');
    }
  }

  private async checkExecutionTransition(
    sessionId: string,
    command: ExecutionTransition,
    expectedRevision: number,
  ) {
    const watched = this.watched.get(sessionId)?.latest;
    const session =
      watched && watched.revision >= expectedRevision ? watched : await this.getSession(sessionId);
    if (session.revision < expectedRevision) {
      throw new WorkflowError('REVISION_CONFLICT', '최신 세션을 조회한 뒤 다시 시도해 주세요.');
    }
    // An older revision can belong to a request the server has already applied.
    // Edge replays that request by ID and rejects new commands with stale revisions.
    if (session.revision > expectedRevision) return;

    const canTransition =
      command.type === 'pauseExecution'
        ? session.phase === 'running'
        : session.phase === 'held' && session.holdReason?.code === 'USER_PAUSED';
    if (!canTransition || session.execution?.cursor?.cursorId !== command.cursorId) {
      throw new WorkflowError('INVALID_STATE', '현재 작업 상태와 회차를 다시 확인해 주세요.');
    }
  }

  private async writeCommand(
    sessionId: string,
    command: WorkflowCommand | { type: 'pause' | 'resume' },
    context: CommandContext,
  ) {
    const payload = { ...context, command };
    try {
      const { session, replayed } = await writeEdgeSession(
        this.request,
        `/sessions/${encodeURIComponent(sessionId)}/commands`,
        payload,
        (value) => parseEdgeSession(value, sessionId),
        { sessionId, retryUnknown: command.type !== 'submitResult' },
      );
      const latest = replayed ? await this.readAfterReplay(sessionId) : null;
      return latest && latest.revision >= session.revision ? latest : this.publish(session);
    } catch (reason) {
      if (!(reason instanceof WorkflowError)) throw reason;
      const latest = reason.replayed ? await this.readAfterReplay(sessionId) : null;
      const attached = reason.session ? this.publish(reason.session) : undefined;
      throw new WorkflowError(reason.code, reason.message, {
        session: latest && latest.revision >= (attached?.revision ?? 0) ? latest : attached,
        resultId: reason.resultId,
      });
    }
  }

  private async readAfterReplay(sessionId: string) {
    // A poll might have begun before the write. Re-read after it settles.
    await this.reads.get(sessionId)?.catch(() => null);
    return this.getSession(sessionId).catch(() => null);
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
    if (hasPendingJob(next)) {
      this.pollDuringJob(next.sessionId, watched);
    } else {
      clearTimeout(watched.timer);
      watched.timer = undefined;
    }
    return next;
  }

  private pollDuringJob(sessionId: string, watched: WatchedSession) {
    if (
      this.watched.get(sessionId) !== watched ||
      !watched.latest ||
      !hasPendingJob(watched.latest) ||
      watched.timer !== undefined
    ) {
      return;
    }
    watched.timer = setTimeout(() => {
      watched.timer = undefined;
      void this.getSession(sessionId).catch((error: unknown) => {
        for (const onReadError of watched.listeners.values()) onReadError?.(error);
      });
    }, JOB_POLL_INTERVAL_MS);
  }
}
