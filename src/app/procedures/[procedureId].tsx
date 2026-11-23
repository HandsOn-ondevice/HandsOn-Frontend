import { useMemo } from 'react';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEntrySelection } from '@/features/entry/EntrySelectionProvider';
import { ProcedureDetailScreen } from '@/features/procedures/ProcedureDetailScreen';
import { usePreparationHandoff } from '@/features/procedures/PreparationHandoffProvider';
import { createEdgeProcedureRepository } from '@/features/procedures/procedureRepository';
import {
  acknowledgeEdgePreparation,
  startEdgePreparation,
} from '@/features/researcher-workflow/infrastructure/edge/edgePreparationRepository';

export default function Procedure() {
  const router = useRouter();
  const { selection, edge } = useEntrySelection();
  const { setRequest } = usePreparationHandoff();
  const repository = useMemo(
    () => (edge ? createEdgeProcedureRepository(edge) : undefined),
    [edge],
  );
  const { procedureId, approvedVersion, environmentId } = useLocalSearchParams<{
    procedureId?: string | string[];
    approvedVersion?: string | string[];
    environmentId?: string | string[];
  }>();

  if (selection?.role !== 'student') return <Redirect href="/" />;
  if (
    typeof procedureId !== 'string' ||
    !procedureId.trim() ||
    typeof approvedVersion !== 'string' ||
    !approvedVersion.trim() ||
    environmentId !== selection.environment.id
  ) {
    return <Redirect href="/procedures" />;
  }

  return (
    <ProcedureDetailScreen
      key={JSON.stringify([procedureId, approvedVersion, environmentId])}
      environment={selection.environment}
      procedureId={procedureId}
      approvedVersion={approvedVersion}
      repository={repository}
      edgePreparation={
        edge
          ? {
              start: (chosen) => startEdgePreparation(edge, chosen),
              onReady: (sessionId, chosen) => {
                router.push({ pathname: '/procedures/preparation', params: { sessionId } });
                if (chosen) acknowledgeEdgePreparation(edge, chosen);
              },
            }
          : undefined
      }
      onBack={() => {
        if (router.canGoBack()) router.back();
        else router.replace('/procedures');
      }}
      onPrepare={(request) => {
        setRequest(request);
        router.push('/procedures/preparation');
      }}
    />
  );
}
