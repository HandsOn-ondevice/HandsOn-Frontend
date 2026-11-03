import { createContext, useContext, type ReactNode } from 'react';
import type { WorkflowRepository } from '../application/WorkflowRepository';
import { MockWorkflowRepository } from '../infrastructure/mock/MockWorkflowRepository';
import { AppText, Screen } from '@/design-system';

// 화면·feature 레이아웃을 나갔다 와도 앱 실행 중에는 같은 Mock 세션을 유지한다.
const developmentRepository = __DEV__ ? new MockWorkflowRepository() : null;
const RepositoryContext = createContext<WorkflowRepository | null>(null);

export function WorkflowProvider({
  children,
  repository,
}: {
  children: ReactNode;
  repository?: WorkflowRepository;
}) {
  const selected = repository ?? developmentRepository;
  if (!selected || (!__DEV__ && selected instanceof MockWorkflowRepository)) {
    return (
      <Screen>
        <AppText variant="heading">실험 서비스를 준비하고 있습니다.</AppText>
        <AppText>장치 서비스가 연결되기 전에는 점검이나 측정 결과를 제공하지 않습니다.</AppText>
      </Screen>
    );
  }
  return <RepositoryContext.Provider value={selected}>{children}</RepositoryContext.Provider>;
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
