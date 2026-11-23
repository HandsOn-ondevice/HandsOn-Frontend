import { router, useLocalSearchParams } from 'expo-router';
import { CompletionReviewScreen } from '@/features/researcher-workflow/screens/CompletionReviewScreen';
import { CompletionRouteGate } from '@/features/researcher-workflow/screens/CompletionRouteGate';
import { EdgeCompletionScreen } from '@/features/researcher-workflow/screens/EdgeCompletionScreen';
import { isEdgeWorkflowEnabled } from '@/features/researcher-workflow/state/workflow-repository';

export default function ReviewRoute() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  if (isEdgeWorkflowEnabled()) {
    return <EdgeCompletionScreen key={sessionId} stage="review" sessionId={sessionId} />;
  }
  return (
    <CompletionRouteGate sessionId={sessionId} screen="review">
      <CompletionReviewScreen
        key={sessionId}
        sessionId={sessionId}
        onBack={() => router.replace('/student')}
        onExecution={() =>
          router.replace({
            pathname: '/researcher-workflow/[sessionId]/execution',
            params: { sessionId },
          })
        }
        onCleanup={() =>
          router.replace({
            pathname: '/researcher-workflow/[sessionId]/cleanup',
            params: { sessionId },
          })
        }
      />
    </CompletionRouteGate>
  );
}
