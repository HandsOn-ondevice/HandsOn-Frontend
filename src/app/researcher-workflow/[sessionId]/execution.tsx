import { router, useLocalSearchParams } from 'expo-router';
import { ExecutionScreen } from '@/features/researcher-workflow/screens/ExecutionScreen';
import { CompletionRouteGate } from '@/features/researcher-workflow/screens/CompletionRouteGate';
import { EdgeExecutionScreen } from '@/features/researcher-workflow/screens/EdgeExecutionScreen';
import { isEdgeWorkflowEnabled } from '@/features/researcher-workflow/state/workflow-repository';

export default function ExecutionRoute() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const onBack = () =>
    router.dismissTo({
      pathname: '/researcher-workflow/[sessionId]/device-check',
      params: { sessionId },
    });
  const onRecovery = () =>
    router.push({
      pathname: '/researcher-workflow/[sessionId]/recovery',
      params: { sessionId },
    });
  if (isEdgeWorkflowEnabled()) {
    return (
      <EdgeExecutionScreen
        key={sessionId}
        sessionId={sessionId}
        onBack={onBack}
        onRecovery={onRecovery}
      />
    );
  }

  return (
    <CompletionRouteGate sessionId={sessionId} screen="execution">
      <ExecutionScreen
        key={sessionId}
        sessionId={sessionId}
        onMenu={() =>
          router.push({
            pathname: '/researcher-workflow/[sessionId]/session-menu',
            params: { sessionId },
          })
        }
        onBack={onBack}
        onRecovery={onRecovery}
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
