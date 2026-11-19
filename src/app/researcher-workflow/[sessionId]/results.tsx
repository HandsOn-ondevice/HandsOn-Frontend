import { router, useLocalSearchParams } from 'expo-router';
import { ResultSummaryScreen } from '@/features/researcher-workflow/screens/ResultSummaryScreen';
import { CompletionRouteGate } from '@/features/researcher-workflow/screens/CompletionRouteGate';

export default function ResultsRoute() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  return (
    <CompletionRouteGate sessionId={sessionId} screen="results">
      <ResultSummaryScreen
        key={sessionId}
        sessionId={sessionId}
        onHome={() => router.replace('/student')}
        onDetails={(conditionId) =>
          router.push({
            pathname: '/researcher-workflow/[sessionId]/measurement-details',
            params: { sessionId, conditionId },
          })
        }
      />
    </CompletionRouteGate>
  );
}
