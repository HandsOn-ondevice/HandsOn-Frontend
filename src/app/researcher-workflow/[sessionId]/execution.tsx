import { Redirect, router, useLocalSearchParams } from 'expo-router';
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
  const onMenu = () =>
    router.push({
      pathname: '/researcher-workflow/[sessionId]/session-menu',
      params: { sessionId },
    });
  const onRecovery = () =>
    router.push({ pathname: '/researcher-workflow/[sessionId]/recovery', params: { sessionId } });
  const onPause = () =>
    router.push({ pathname: '/researcher-workflow/[sessionId]/paused', params: { sessionId } });
  if (isEdgeWorkflowEnabled()) {
    return (
      <EdgeExecutionScreen
        key={sessionId}
        sessionId={sessionId}
        onBack={onBack}
        onMenu={onMenu}
        onRecovery={onRecovery}
        onPause={onPause}
        renderCompletion={(phase, outputFailed) => (
          <Redirect
            href={{
              pathname:
                phase === 'awaitingCleanup'
                  ? outputFailed
                    ? '/researcher-workflow/[sessionId]/cleanup'
                    : '/researcher-workflow/[sessionId]/review'
                  : '/researcher-workflow/[sessionId]/results',
              params: { sessionId },
            }}
          />
        )}
      />
    );
  }

  return (
    <CompletionRouteGate sessionId={sessionId} screen="execution">
      <ExecutionScreen
        key={sessionId}
        sessionId={sessionId}
        onMenu={onMenu}
        onBack={onBack}
        onRecovery={onRecovery}
        onRemeasurement={() =>
          router.push({
            pathname: '/researcher-workflow/[sessionId]/remeasurement',
            params: { sessionId },
          })
        }
        onPause={onPause}
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
