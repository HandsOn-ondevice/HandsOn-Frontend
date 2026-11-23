import { useCallback } from 'react';
import { Redirect, useRouter } from 'expo-router';
import type { WorkEnvironment } from '@/features/entry/entryEnvironment';
import { useEntrySelection } from '@/features/entry/EntrySelectionProvider';
import { useSelectedProcedureRepository } from '@/features/procedures/useSelectedProcedureRepository';
import { StudentHomeScreen } from '@/features/student-home/StudentHomeScreen';
import { loadStudentHome, type LoadStudentHome } from '@/features/student-home/studentHomeData';
import { getStudentHomeDestination } from '@/features/student-home/studentHomeRoutes';
import { useStudentHome } from '@/features/student-home/useStudentHome';

export default function StudentHome() {
  const { selection } = useEntrySelection();
  if (selection?.role !== 'student') return <Redirect href="/" />;
  return <SelectedStudentHome environment={selection.environment} />;
}

function SelectedStudentHome({ environment }: { environment: WorkEnvironment }) {
  const router = useRouter();
  const repository = useSelectedProcedureRepository();
  const loadHome = useCallback<LoadStudentHome>(
    async (workEnvironment) => {
      if (!repository) return loadStudentHome(workEnvironment);
      const procedures = await repository.list(workEnvironment.environmentId ?? workEnvironment.id);
      return {
        researcherName: '연구생',
        deviceStatus: 'unknown',
        ongoingSession: null,
        recentResults: [],
        approvedProcedures: procedures.map((procedure) => ({
          id: procedure.id,
          title: procedure.title,
          version: procedure.approvedVersion,
          equipmentLabel: procedure.code,
          stepCount: procedure.stepCount,
        })),
      };
    },
    [repository],
  );
  const { lookup, reload } = useStudentHome(environment, loadHome);

  return (
    <StudentHomeScreen
      environment={environment}
      lookup={lookup}
      onReload={reload}
      onNavigate={(destination) => router.push(getStudentHomeDestination(destination))}
      onChangeEnvironment={() => {
        if (router.canGoBack()) router.back();
        else router.replace('/');
      }}
    />
  );
}
