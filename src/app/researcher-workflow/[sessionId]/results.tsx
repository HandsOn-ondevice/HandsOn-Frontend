import { router, useLocalSearchParams } from 'expo-router';
import { ResultSummaryScreen } from '@/features/researcher-workflow/screens/ResultSummaryScreen';
import { CompletionRouteGate } from '@/features/researcher-workflow/screens/CompletionRouteGate';
import { EdgeCompletionScreen } from '@/features/researcher-workflow/screens/EdgeCompletionScreen';
import { isEdgeWorkflowEnabled } from '@/features/researcher-workflow/state/workflow-repository';

export default function ResultsRoute() {
  const { sessionId, resultId, view } = useLocalSearchParams<{
    sessionId: string;
    resultId?: string;
    view?: string;
  }>();
  if (isEdgeWorkflowEnabled()) {
    return (
      <EdgeCompletionScreen
        key={sessionId}
        stage="results"
        sessionId={sessionId}
        resultId={resultId}
      />
    );
  }
  return (
    <CompletionRouteGate sessionId={sessionId} screen="results" resultId={resultId}>
      <ResultSummaryScreen
        key={sessionId}
        sessionId={sessionId}
        showSubmittedResult={view === 'summary'}
        onHome={() => router.replace('/student')}
        onDetails={(conditionId, resolvedResultId) =>
          router.push({
            pathname: '/researcher-workflow/[sessionId]/measurement-details',
            params: { sessionId, conditionId, resultId: resolvedResultId },
          })
        }
      />
    </CompletionRouteGate>
  );
}
