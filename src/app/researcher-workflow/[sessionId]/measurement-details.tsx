import { router, useLocalSearchParams } from 'expo-router';
import { MeasurementDetailsScreen } from '@/features/researcher-workflow/screens/MeasurementDetailsScreen';
import { CompletionRouteGate } from '@/features/researcher-workflow/screens/CompletionRouteGate';

export default function MeasurementDetailsRoute() {
  const { sessionId, conditionId, resultId } = useLocalSearchParams<{
    sessionId: string;
    conditionId?: string;
    resultId?: string;
  }>();
  return (
    <CompletionRouteGate sessionId={sessionId} screen="details" resultId={resultId}>
      <MeasurementDetailsScreen
        key={`${sessionId}:${conditionId}`}
        sessionId={sessionId}
        conditionId={conditionId ?? ''}
        onResults={(resolvedResultId) =>
          router.dismissTo({
            pathname: '/researcher-workflow/[sessionId]/results',
            params: { sessionId, resultId: resolvedResultId, view: 'summary' },
          })
        }
      />
    </CompletionRouteGate>
  );
}
