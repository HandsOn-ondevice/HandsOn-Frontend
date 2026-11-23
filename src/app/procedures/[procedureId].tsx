import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEntrySelection } from '@/features/entry/EntrySelectionProvider';
import { ProcedureDetailScreen } from '@/features/procedures/ProcedureDetailScreen';
import { usePreparationHandoff } from '@/features/procedures/PreparationHandoffProvider';
import {
  isEdgeWorkflowEnabled,
  startApprovedEdgeSession,
} from '@/features/researcher-workflow/state/workflow-repository';

export default function Procedure() {
  const router = useRouter();
  const { selection } = useEntrySelection();
  const { setRequest } = usePreparationHandoff();
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

  const edgeToken =
    'edgeToken' in selection && typeof selection.edgeToken === 'string'
      ? selection.edgeToken
      : undefined;

  return (
    <ProcedureDetailScreen
      key={JSON.stringify([procedureId, approvedVersion, environmentId])}
      environment={selection.environment}
      procedureId={procedureId}
      approvedVersion={approvedVersion}
      onBack={() => {
        if (router.canGoBack()) router.back();
        else router.replace('/procedures');
      }}
      startSession={
        isEdgeWorkflowEnabled()
          ? async (request) => (await startApprovedEdgeSession(request, edgeToken)).sessionId
          : undefined
      }
      onPrepare={(request, sessionId) => {
        if (sessionId) {
          router.push({
            pathname: '/researcher-workflow/[sessionId]/preparation',
            params: { sessionId },
          });
          return;
        }
        setRequest(request);
        router.push('/procedures/preparation');
      }}
    />
  );
}
