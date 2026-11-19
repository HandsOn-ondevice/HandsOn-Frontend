import { router, useLocalSearchParams } from 'expo-router';
import { ExecutionScreen } from '@/features/researcher-workflow/screens/ExecutionScreen';
import { CompletionRouteGate } from '@/features/researcher-workflow/screens/CompletionRouteGate';

export default function ExecutionRoute() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  return (
    <CompletionRouteGate sessionId={sessionId} screen="execution">
      <ExecutionScreen
        key={sessionId}
        sessionId={sessionId}
        onBack={() =>
          router.dismissTo({
            pathname: '/researcher-workflow/[sessionId]/device-check',
            params: { sessionId },
          })
        }
        onRecovery={() =>
          router.push({
            pathname: '/researcher-workflow/[sessionId]/recovery',
            params: { sessionId },
          })
        }
        onRemeasurement={() =>
          router.push({
            pathname: '/researcher-workflow/[sessionId]/remeasurement',
            params: { sessionId },
          })
        }
        onPause={() =>
          router.push({
            pathname: '/researcher-workflow/[sessionId]/paused',
            params: { sessionId },
          })
        }
        onClarification={() =>
          router.push({
            pathname: '/researcher-workflow/[sessionId]/voice-clarification',
            params: { sessionId },
          })
        }
      />
    </CompletionRouteGate>
  );
}
