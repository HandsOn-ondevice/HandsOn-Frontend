import { createWorkflowQueries } from '../application/workflow-queries';
import { EdgeWorkflowRepository } from '../infrastructure/edge/EdgeWorkflowRepository';
import { createEdgeSessionRequest } from '../infrastructure/edge/edge-session-request';
import { MockWorkflowRepository } from '../infrastructure/mock/MockWorkflowRepository';
import { createApprovedMockSessionStarter } from '../infrastructure/mock/start-approved-mock-session';
import { procedureRepository } from '@/features/procedures/procedureRepository';
import type { PreparationRequest } from '@/features/procedures/PreparationHandoffProvider';

// Provider와 외부 조회가 같은 모듈 인스턴스를 사용한다. 조회할 때 새 저장소를 만들지 않는다.
export const developmentRepository = new MockWorkflowRepository();
export const workflowQueries = createWorkflowQueries(developmentRepository);
export const startApprovedMockSession = createApprovedMockSessionStarter(
  developmentRepository,
  procedureRepository,
);

export function isEdgeWorkflowEnabled() {
  return (
    process.env.EXPO_PUBLIC_HANDSON_MAESTRO !== '1' &&
    Boolean(process.env.EXPO_PUBLIC_HANDSON_EDGE_BASE_URL?.trim())
  );
}

let activeEdge: { baseUrl: string; token?: string; repository: EdgeWorkflowRepository } | undefined;

export function getEdgeWorkflowRepository(token?: string) {
  const baseUrl = process.env.EXPO_PUBLIC_HANDSON_EDGE_BASE_URL?.trim() ?? '';
  if (!activeEdge || activeEdge.baseUrl !== baseUrl || activeEdge.token !== token) {
    const request = createEdgeSessionRequest(baseUrl, token);
    activeEdge = { baseUrl, token, repository: new EdgeWorkflowRepository(request) };
  }
  return activeEdge.repository;
}

export function startApprovedEdgeSession(request: PreparationRequest, token?: string) {
  return getEdgeWorkflowRepository(token).startApprovedSession({
    procedureId: request.procedureId,
    procedureVersion: request.approvedVersion,
  });
}
