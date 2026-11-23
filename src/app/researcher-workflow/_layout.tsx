import { Redirect, Stack, router } from 'expo-router';
import { AppBar, FeedbackPanel, Screen, StatusBar } from '@/design-system';
import { useEntrySelection } from '@/features/entry/EntrySelectionProvider';
import { WorkflowProvider } from '@/features/researcher-workflow/state/WorkflowProvider';
import {
  getEdgeWorkflowRepository,
  isEdgeWorkflowEnabled,
} from '@/features/researcher-workflow/state/workflow-repository';

const edgeScreens = new Set([
  '[sessionId]/preparation',
  '[sessionId]/device-check',
  '[sessionId]/execution',
  '[sessionId]/voice-clarification',
  '[sessionId]/recovery',
  '[sessionId]/remeasurement',
  '[sessionId]/session-menu',
  '[sessionId]/device-status',
  '[sessionId]/paused',
  '[sessionId]/resume',
  '[sessionId]/review',
  '[sessionId]/cleanup',
  '[sessionId]/results',
  '[sessionId]/measurement-details',
]);

export default function ResearcherWorkflowLayout() {
  const { selection } = useEntrySelection();

  if (isEdgeWorkflowEnabled()) {
    if (selection?.role !== 'student') return <Redirect href="/" />;

    return (
      <WorkflowProvider repository={getEdgeWorkflowRepository(selection.edgeToken)}>
        <Stack
          screenOptions={{ headerShown: false }}
          screenLayout={({ route, children }) =>
            edgeScreens.has(route.name) ? (
              children
            ) : (
              <Screen scroll>
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
