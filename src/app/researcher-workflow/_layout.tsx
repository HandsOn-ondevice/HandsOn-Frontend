import { Stack, router } from 'expo-router';
import { AppBar, FeedbackPanel, Screen, StatusBar } from '@/design-system';
import { useEntrySelection } from '@/features/entry/EntrySelectionProvider';
import { WorkflowProvider } from '@/features/researcher-workflow/state/WorkflowProvider';
import {
  isEdgeWorkflowEnabled,
  getEdgeWorkflowRepository,
} from '@/features/researcher-workflow/state/workflow-repository';

const edgeScreens = new Set([
  '[sessionId]/preparation',
  '[sessionId]/device-check',
  '[sessionId]/execution',
]);

export default function ResearcherWorkflowLayout() {
  const { selection } = useEntrySelection();
  const edgeToken =
    selection && 'edgeToken' in selection && typeof selection.edgeToken === 'string'
      ? selection.edgeToken
      : undefined;

  if (isEdgeWorkflowEnabled()) {
    return (
      <WorkflowProvider repository={getEdgeWorkflowRepository(edgeToken)}>
        <Stack
          screenOptions={{ headerShown: false }}
          screenLayout={({ route, children }) =>
            edgeScreens.has(route.name) ? (
              children
            ) : (
              <Screen>
                <StatusBar />
                <AppBar
                  mode="back"
                  title="실험 세션"
                  onBack={() => (router.canGoBack() ? router.back() : router.replace('/student'))}
                />
                <FeedbackPanel
                  title="이 단계의 Edge 연동을 준비 중이에요."
                  subtitle="연구생 홈에서 실험 현황을 확인해 주세요."
                />
              </Screen>
            )
          }
        />
      </WorkflowProvider>
    );
  }

  return (
    <WorkflowProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </WorkflowProvider>
  );
}
