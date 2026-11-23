import { router, useLocalSearchParams } from 'expo-router';
import { EdgeRemeasurementScreen } from '@/features/researcher-workflow/screens/EdgeRemeasurementScreen';
import { RemeasurementScreen } from '@/features/researcher-workflow/screens/RemeasurementScreen';
import { isEdgeWorkflowEnabled } from '@/features/researcher-workflow/state/workflow-repository';

export default function RemeasurementRoute() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const onBack = () =>
    router.dismissTo({
      pathname: '/researcher-workflow/[sessionId]/recovery',
      params: { sessionId },
    });
  const onExecution = () =>
    router.dismissTo({
      pathname: '/researcher-workflow/[sessionId]/execution',
      params: { sessionId },
    });
  if (isEdgeWorkflowEnabled()) {
    return (
      <EdgeRemeasurementScreen
        key={sessionId}
        sessionId={sessionId}
        onBack={onBack}
        onExecution={onExecution}
      />
    );
  }
  return (
    <RemeasurementScreen
      key={sessionId}
      sessionId={sessionId}
      onBack={onBack}
      onExecution={onExecution}
    />
  );
}
