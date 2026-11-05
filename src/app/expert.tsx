import { Redirect, useRouter } from 'expo-router';
import { useEntrySelection } from '@/features/entry/EntrySelectionProvider';
import { ExpertHomeScreen, type ExpertTask } from '@/features/expert-home/ExpertHomeScreen';

export default function ExpertHome() {
  const router = useRouter();
  const { selection } = useEntrySelection();
  if (selection?.role !== 'expert') return <Redirect href="/" />;

  function openTask(task: ExpertTask) {
    if (task.kind === 'create') router.push('/expert/procedures/new');
    else if (task.kind === 'procedure')
      router.push({
        pathname: '/expert/procedures/[procedureId]',
        params: { procedureId: task.procedureId },
      });
    else
      router.push({
        pathname: '/expert/results/[resultId]',
        params: { resultId: task.resultId, procedureId: task.procedureId },
      });
  }

  return (
    <ExpertHomeScreen
      environment={selection.environment}
      onOpenTask={openTask}
      onChangeEnvironment={() => router.replace('/')}
    />
  );
}
