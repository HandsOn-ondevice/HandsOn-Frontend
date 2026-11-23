import { createWorkflowQueries } from '../application/workflow-queries';
import { MockWorkflowRepository } from '../infrastructure/mock/MockWorkflowRepository';
import { createApprovedMockSessionStarter } from '../infrastructure/mock/start-approved-mock-session';
import { procedureRepository } from '@/features/procedures/procedureRepository';

// Provider와 외부 조회가 같은 모듈 인스턴스를 사용한다. 조회할 때 새 저장소를 만들지 않는다.
export const developmentRepository = new MockWorkflowRepository();
export const workflowQueries = createWorkflowQueries(developmentRepository);
export const startApprovedMockSession = createApprovedMockSessionStarter(
  developmentRepository,
  procedureRepository,
);
