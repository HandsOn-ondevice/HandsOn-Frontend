import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEntrySelection } from '@/features/entry/EntrySelectionProvider';
import { ProcedureListScreen } from '@/features/procedures/ProcedureListScreen';
import { useSelectedProcedureRepository } from '@/features/procedures/useSelectedProcedureRepository';

export default function Procedures() {
  const router = useRouter();
  const { selection } = useEntrySelection();
  const repository = useSelectedProcedureRepository();
  const { environmentId } = useLocalSearchParams<{ environmentId?: string | string[] }>();
  if (selection?.role !== 'student') return <Redirect href="/" />;
  if (environmentId !== undefined && environmentId !== selection.environment.id) {
    return <Redirect href="/student" />;
  }

  return (
    <ProcedureListScreen
      environment={selection.environment}
      repository={repository}
      onBack={() => {
        if (router.canGoBack()) router.back();
        else router.replace('/student');
      }}
      onConfirm={(procedure) => {
        router.push({
          pathname: '/procedures/[procedureId]',
          params: {
            procedureId: procedure.id,
            approvedVersion: procedure.approvedVersion,
            environmentId: selection.environment.id,
          },
        });
      }}
    />
  );
}
