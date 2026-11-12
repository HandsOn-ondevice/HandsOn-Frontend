import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEntrySelection } from '@/features/entry/EntrySelectionProvider';
import { ExpertEvidenceScreen } from '@/features/expert-review/ExpertEvidenceScreen';

export default function ResultEvidence() {
  const router = useRouter();
  const { selection } = useEntrySelection();
  const { resultId, procedureId, conditionId } = useLocalSearchParams<{
    resultId?: string;
    procedureId?: string;
    conditionId?: string;
  }>();
  if (selection?.role !== 'expert') return <Redirect href="/" />;
  if (
    typeof resultId !== 'string' ||
    typeof procedureId !== 'string' ||
    typeof conditionId !== 'string'
  ) {
    return <Redirect href="/expert" />;
  }

  const environmentId = selection.environment.id;
  return (
    <ExpertEvidenceScreen
      key={JSON.stringify([environmentId, resultId, procedureId, conditionId])}
      environmentId={environmentId}
      resultId={resultId}
      procedureId={procedureId}
      conditionId={conditionId}
      onBack={() => {
        if (router.canGoBack()) router.back();
        else {
          router.replace({
            pathname: '/expert/results/[resultId]',
            params: { resultId, procedureId },
          });
        }
      }}
    />
  );
}
