import { router, useLocalSearchParams } from 'expo-router';
import { MeasurementDetailsScreen } from '@/features/researcher-workflow/screens/MeasurementDetailsScreen';
import { CompletionRouteGate } from '@/features/researcher-workflow/screens/CompletionRouteGate';

export default function MeasurementDetailsRoute() {
  const { sessionId, conditionId } = useLocalSearchParams<{
    sessionId: string;
    conditionId?: string;
  }>();
  return (
    <CompletionRouteGate sessionId={sessionId} screen="details">
      <MeasurementDetailsScreen
        key={`${sessionId}:${conditionId}`}
        sessionId={sessionId}
        conditionId={conditionId ?? ''}
        onResults={() =>
          router.dismissTo({
            pathname: '/researcher-workflow/[sessionId]/results',
            params: { sessionId },
          })
        }
      />
    </CompletionRouteGate>
  );
}
