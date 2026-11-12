import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEntrySelection } from '@/features/entry/EntrySelectionProvider';
import { ExpertReviewScreen } from '@/features/expert-review/ExpertReviewScreen';

export default function ResultReview() {
  const router = useRouter();
  const { selection } = useEntrySelection();
  const { resultId, procedureId } = useLocalSearchParams<{
    resultId?: string;
    procedureId?: string;
  }>();
  if (selection?.role !== 'expert') return <Redirect href="/" />;
  if (typeof resultId !== 'string' || typeof procedureId !== 'string') {
    return <Redirect href="/expert" />;
  }

  const environmentId = selection.environment.id;
  return (
    <ExpertReviewScreen
      key={JSON.stringify([environmentId, resultId, procedureId])}
      environmentId={environmentId}
      resultId={resultId}
      procedureId={procedureId}
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/expert'))}
      onOpenEvidence={(conditionId) =>
        router.push({
          pathname: '/expert/results/[resultId]/evidence/[conditionId]',
          params: { resultId, procedureId, conditionId },
        })
      }
    />
  );
}
