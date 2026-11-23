import { router, useLocalSearchParams } from 'expo-router';
import { CleanupScreen } from '@/features/researcher-workflow/screens/CleanupScreen';
import { CompletionRouteGate } from '@/features/researcher-workflow/screens/CompletionRouteGate';
import { EdgeCompletionScreen } from '@/features/researcher-workflow/screens/EdgeCompletionScreen';
import { isEdgeWorkflowEnabled } from '@/features/researcher-workflow/state/workflow-repository';

export default function CleanupRoute() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  if (isEdgeWorkflowEnabled()) {
    return <EdgeCompletionScreen key={sessionId} stage="cleanup" sessionId={sessionId} />;
  }
  return (
    <CompletionRouteGate sessionId={sessionId} screen="cleanup">
      <CleanupScreen
        key={sessionId}
        sessionId={sessionId}
        onBack={() =>
          router.replace({
            pathname: '/researcher-workflow/[sessionId]/review',
            params: { sessionId },
          })
        }
        onResults={() =>
          router.replace({
            pathname: '/researcher-workflow/[sessionId]/results',
            params: { sessionId },
          })
        }
      />
    </CompletionRouteGate>
  );
}
