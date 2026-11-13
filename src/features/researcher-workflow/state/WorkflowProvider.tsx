import { createContext, useContext, type ReactNode } from 'react';
import type { WorkflowRepository } from '../application/WorkflowRepository';
import { MockWorkflowRepository } from '../infrastructure/mock/MockWorkflowRepository';

// 화면·feature 레이아웃을 나갔다 와도 앱 실행 중에는 같은 Mock 세션을 유지한다.
const developmentRepository = new MockWorkflowRepository();
const RepositoryContext = createContext<WorkflowRepository | null>(null);

export function WorkflowProvider({
  children,
  repository = developmentRepository,
}: {
  children: ReactNode;
  repository?: WorkflowRepository;
}) {
  return <RepositoryContext.Provider value={repository}>{children}</RepositoryContext.Provider>;
}

export function useWorkflowRepository() {
  const repository = useContext(RepositoryContext);
  if (!repository) throw new Error('WorkflowProvider 안에서 사용해야 합니다.');
  return repository;
}

/** 개발용 제어만 노출한다. API Repository를 주입하면 Mock 컨트롤은 나타나지 않는다. */
export function useMockDeviceCheckControls() {
  const repository = useWorkflowRepository();
  return repository instanceof MockWorkflowRepository ? repository : null;
}
