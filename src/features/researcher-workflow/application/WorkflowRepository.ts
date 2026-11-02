import type {
  CommandContext,
  ExperimentSession,
  ProcedureSnapshot,
  WorkflowCommand,
} from '../domain/models';

export interface CreateSessionInput {
  readonly requestId: string;
  readonly operatorId: string;
  readonly procedure: ProcedureSnapshot;
}

/** 실제 API 구현도 같은 계약을 사용한다. 반환값은 저장소와 분리된 스냅샷이다. */
export interface WorkflowRepository {
  createSession(input: CreateSessionInput): Promise<ExperimentSession>;
  getSession(sessionId: string): Promise<ExperimentSession>;
  executeCommand(
    sessionId: string,
    command: WorkflowCommand,
    context: CommandContext,
  ): Promise<ExperimentSession>;
  subscribe(sessionId: string, listener: (session: ExperimentSession) => void): () => void;
}
