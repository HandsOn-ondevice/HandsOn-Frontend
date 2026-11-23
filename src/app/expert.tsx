import { useCallback } from 'react';
import { Redirect, useRouter } from 'expo-router';
import type { EntrySelection } from '@/features/entry/entryEnvironment';
import { useEntrySelection } from '@/features/entry/EntrySelectionProvider';
import { ExpertHomeScreen, type ExpertTask } from '@/features/expert-home/ExpertHomeScreen';
import { loadEdgeExpertHome, loadExpertHome } from '@/features/expert-home/expertHomeData';

export default function ExpertHome() {
  const { selection } = useEntrySelection();
  if (selection?.role !== 'expert') return <Redirect href="/" />;
  return <SelectedExpertHome selection={selection} />;
}

function SelectedExpertHome({ selection: { environment, edge } }: { selection: EntrySelection }) {
  const router = useRouter();
  const loadHome = useCallback(
    (profileId: string) =>
      edge
        ? loadEdgeExpertHome(environment.edgeEnvironmentId ?? profileId, edge)
        : loadExpertHome(profileId),
    [edge, environment.edgeEnvironmentId],
  );

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
      environment={environment}
      loadHome={loadHome}
      onOpenTask={openTask}
      onChangeEnvironment={() => router.replace('/')}
    />
  );
}
