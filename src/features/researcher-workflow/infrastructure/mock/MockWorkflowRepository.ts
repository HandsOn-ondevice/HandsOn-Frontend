import type { CreateSessionInput, WorkflowRepository } from '../../application/WorkflowRepository';
import { createRequestId } from '../../application/request-id';
import {
  WorkflowError,
  type CommandContext,
  type ExperimentSession,
  type WorkflowCommand,
} from '../../domain/models';
import { transitionPreparation } from './transition-engine';

export interface MockDependencies {
  readonly now?: () => string;
  readonly id?: () => string;
}

const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export class MockWorkflowRepository implements WorkflowRepository {
  private readonly sessions = new Map<string, ExperimentSession>();
  private readonly creationRequests = new Map<string, { signature: string; sessionId: string }>();
  private readonly commandRequests = new Map<string, Map<string, string>>();
  private readonly listeners = new Map<string, Set<(session: ExperimentSession) => void>>();
  private readonly now: () => string;
  private readonly id: () => string;

  constructor(dependencies: MockDependencies = {}) {
    this.now = dependencies.now ?? (() => new Date().toISOString());
    this.id = dependencies.id ?? createRequestId;
  }

  async createSession(input: CreateSessionInput): Promise<ExperimentSession> {
    const signature = JSON.stringify([input.operatorId, input.procedure]);
    const previous = this.creationRequests.get(input.requestId);
    if (previous) {
      if (previous.signature !== signature)
        throw new WorkflowError('REQUEST_CONFLICT', '이미 사용한 요청 ID입니다.');
      return this.getSession(previous.sessionId);
    }
    const requirements = input.procedure.preparation;
    if (
      input.procedure.approval !== 'approved' ||
      !input.procedure.version ||
      requirements.length !== 6 ||
      new Set(requirements.map((item) => item.id)).size !== 6 ||
      requirements.filter((item) => item.requiredForDeviceCheck).length !== 5 ||
      requirements.some(
        (item) =>
          item.requiredForDeviceCheck && (item.owner !== 'operator' || item.verifiedAt !== 'S04'),
      ) ||
      !requirements.some(
        (item) =>
          item.id === 'communication' &&
          item.owner === 'system' &&
          item.verifiedAt === 'S05' &&
          !item.requiredForDeviceCheck,
      )
    ) {
      throw new WorkflowError(
        'INVALID_PROCEDURE',
        'S04 작업자 확인 5개와 S05 통신 점검을 가진 승인 절차가 필요합니다.',
      );
    }
    const now = this.now();
    const session: ExperimentSession = {
      sessionId: `mock-session-${this.id()}`,
      operatorId: input.operatorId,
      source: 'mock',
      procedure: copy(input.procedure),
      phase: 'preparing',
      revision: 0,
      createdAt: now,
      updatedAt: now,
      checks: requirements.map((item) => ({
        id: item.id,
        checked: false,
        confirmedAt: null,
        evidenceId: null,
      })),
      evidence: [],
      events: [
        { eventId: this.id(), requestId: input.requestId, type: 'sessionCreated', occurredAt: now },
      ],
    };
    this.sessions.set(session.sessionId, session);
    this.creationRequests.set(input.requestId, { signature, sessionId: session.sessionId });
    return copy(session);
  }

  async getSession(sessionId: string): Promise<ExperimentSession> {
    const session = this.sessions.get(sessionId);
    if (!session)
      throw new WorkflowError(
        'NOT_FOUND',
        '세션을 찾을 수 없습니다. Mock 세션은 앱 재시작 시 초기화됩니다.',
      );
    return copy(session);
  }

  async executeCommand(sessionId: string, command: WorkflowCommand, context: CommandContext) {
    // 한 JS 작업 안에서 조회·전환·저장한다. 같은 revision의 동시 명령은 하나만 적용된다.
    const session = this.sessions.get(sessionId);
    if (!session) throw new WorkflowError('NOT_FOUND', '세션을 찾을 수 없습니다.');
    const requests = this.commandRequests.get(sessionId) ?? new Map<string, string>();
    const signature = JSON.stringify(command);
    const previous = requests.get(context.requestId);
    if (previous !== undefined) {
      if (previous !== signature)
        throw new WorkflowError('REQUEST_CONFLICT', '요청 ID를 다른 동작에 재사용할 수 없습니다.');
      return copy(session);
    }
    if (context.expectedRevision !== session.revision) {
      throw new WorkflowError(
        'REVISION_CONFLICT',
        '세션이 변경되었습니다. 새로 확인한 뒤 다시 시도해 주세요.',
      );
    }
    const next = transitionPreparation(session, command, {
      requestId: context.requestId,
      now: this.now(),
      eventId: this.id(),
      evidenceId: this.id(),
    });
    requests.set(context.requestId, signature);
    this.commandRequests.set(sessionId, requests);
    this.sessions.set(sessionId, next);
    if (next !== session)
      this.listeners.get(sessionId)?.forEach((listener) => listener(copy(next)));
    return copy(next);
  }

  subscribe(sessionId: string, listener: (session: ExperimentSession) => void) {
    const listeners = this.listeners.get(sessionId) ?? new Set();
    listeners.add(listener);
    this.listeners.set(sessionId, listeners);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) this.listeners.delete(sessionId);
    };
  }
}
