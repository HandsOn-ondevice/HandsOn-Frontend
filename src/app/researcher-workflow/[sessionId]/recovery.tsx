import { router, useLocalSearchParams } from 'expo-router';
import { EdgeRecoveryScreen } from '@/features/researcher-workflow/screens/EdgeRecoveryScreen';
import { RecoveryScreen } from '@/features/researcher-workflow/screens/RecoveryScreen';
import { isEdgeWorkflowEnabled } from '@/features/researcher-workflow/state/workflow-repository';

export default function RecoveryRoute() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const onBack = () =>
    router.dismissTo({
      pathname: '/researcher-workflow/[sessionId]/execution',
      params: { sessionId },
    });
  if (isEdgeWorkflowEnabled()) {
    return (
      <EdgeRecoveryScreen
        key={sessionId}
        sessionId={sessionId}
        onBack={onBack}
        onRemeasurement={() =>
          router.push({
            pathname: '/researcher-workflow/[sessionId]/remeasurement',
            params: { sessionId },
          })
        }
      />
    );
  }
  return (
    <RecoveryScreen
      key={sessionId}
      sessionId={sessionId}
      onRemeasurement={() =>
        router.push({
          pathname: '/researcher-workflow/[sessionId]/remeasurement',
          params: { sessionId },
        })
      }
      onBack={onBack}
    />
  );
}
