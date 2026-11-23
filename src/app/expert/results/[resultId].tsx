import { useMemo } from 'react';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEntrySelection } from '@/features/entry/EntrySelectionProvider';
import { ExpertReviewScreen } from '@/features/expert-review/ExpertReviewScreen';
import { createEdgeResultRepository } from '@/features/expert-review/edgeResultRepository';

export default function ResultReview() {
  const router = useRouter();
  const { selection } = useEntrySelection();
  const access = selection?.edge;
  const repository = useMemo(
    () => (access ? createEdgeResultRepository(access) : undefined),
    [access],
  );
  const { resultId, procedureId } = useLocalSearchParams<{
    resultId?: string;
    procedureId?: string;
  }>();
  if (selection?.role !== 'expert') return <Redirect href="/" />;
  if (typeof resultId !== 'string' || typeof procedureId !== 'string') {
    return <Redirect href="/expert" />;
  }

  const environmentId = selection.environment.edgeEnvironmentId ?? selection.environment.id;
  return (
    <ExpertReviewScreen
      key={JSON.stringify([environmentId, resultId, procedureId])}
      environmentId={environmentId}
      resultId={resultId}
      procedureId={procedureId}
      repository={repository}
      lockFailedSubmission={Boolean(access)}
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/expert'))}
      onOpenEvidence={(conditionId, result) =>
        router.push({
          pathname: '/expert/results/[resultId]/evidence/[conditionId]',
          params: { resultId: result.id, procedureId: result.procedureId, conditionId },
        })
      }
    />
  );
}
