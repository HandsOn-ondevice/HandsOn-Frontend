import { Redirect, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { useEntrySelection } from '@/features/entry/EntrySelectionProvider';
import { ExpertHomeScreen, type ExpertTask } from '@/features/expert-home/ExpertHomeScreen';
import { loadExpertHome } from '@/features/expert-home/expertHomeData';

export default function ExpertHome() {
  const router = useRouter();
  const { selection } = useEntrySelection();
  const edgeToken = selection?.edgeToken;
  const loadHome = useCallback(
    (environmentId: string) => loadExpertHome(environmentId, edgeToken),
    [edgeToken],
  );
  if (selection?.role !== 'expert') return <Redirect href="/" />;

  function openTask(task: ExpertTask) {
    if (task.kind === 'create') router.push('/expert/procedures/new');
    else if (task.kind === 'draft')
      router.push({ pathname: '/expert/drafts/[draftId]', params: { draftId: task.draftId } });
    else if (task.kind === 'procedure')
      router.push({
        pathname: '/expert/procedures/[procedureId]',
        params: { procedureId: task.procedureId, version: task.version },
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
      loadHome={loadHome}
      onOpenTask={openTask}
      onChangeEnvironment={() => router.replace('/')}
    />
  );
}
