import { useMemo } from 'react';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEntrySelection } from '@/features/entry/EntrySelectionProvider';
import { ExpertEvidenceScreen } from '@/features/expert-review/ExpertEvidenceScreen';
import { createEdgeResultRepository } from '@/features/expert-review/edgeResultRepository';

export default function ResultEvidence() {
  const router = useRouter();
  const { selection } = useEntrySelection();
  const access = selection?.edge;
  const repository = useMemo(
    () => (access ? createEdgeResultRepository(access) : undefined),
    [access],
  );
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

  const environmentId = selection.environment.edgeEnvironmentId ?? selection.environment.id;
  return (
    <ExpertEvidenceScreen
      key={JSON.stringify([environmentId, resultId, procedureId, conditionId])}
      environmentId={environmentId}
      resultId={resultId}
      procedureId={procedureId}
      conditionId={conditionId}
      repository={repository}
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
