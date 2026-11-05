import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEntrySelection } from '@/features/entry/EntrySelectionProvider';
import { ProcedureListScreen } from '@/features/procedures/ProcedureListScreen';

export default function Procedures() {
  const router = useRouter();
  const { selection } = useEntrySelection();
  const { environmentId } = useLocalSearchParams<{ environmentId?: string | string[] }>();
  if (selection?.role !== 'student') return <Redirect href="/" />;
  if (environmentId !== undefined && environmentId !== selection.environment.id) {
    return <Redirect href="/student" />;
  }

  return (
    <ProcedureListScreen
      environment={selection.environment}
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
