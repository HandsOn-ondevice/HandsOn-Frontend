import { router, useLocalSearchParams } from 'expo-router';
import { CleanupScreen } from '@/features/researcher-workflow/screens/CleanupScreen';
import { CompletionRouteGate } from '@/features/researcher-workflow/screens/CompletionRouteGate';

export default function CleanupRoute() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
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
