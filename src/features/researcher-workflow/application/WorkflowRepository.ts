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

/** 실제 API 구현도 같은 계약을 사용한다. 반환값은 저장소와 분리된 스냅샷이다.
 * startDeviceCheck는 점검 접수(checking)를 반환하며, 최종 결과는 subscribe/getSession으로 전달한다.
 * 실제 구현의 subscribe는 서버 이벤트 또는 polling을 연결해야 한다. Mock 시나리오는 이 계약에 넣지 않는다.
 */
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
