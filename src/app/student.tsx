import { useCallback } from 'react';
import { Redirect, useRouter } from 'expo-router';
import type { EntrySelection, WorkEnvironment } from '@/features/entry/entryEnvironment';
import { useEntrySelection } from '@/features/entry/EntrySelectionProvider';
import { StudentHomeScreen } from '@/features/student-home/StudentHomeScreen';
import { getStudentHomeDestination } from '@/features/student-home/studentHomeRoutes';
import { loadEdgeStudentHome, loadStudentHome } from '@/features/student-home/studentHomeData';
import { useStudentHome } from '@/features/student-home/useStudentHome';

export default function StudentHome() {
  const { selection } = useEntrySelection();
  if (selection?.role !== 'student') return <Redirect href="/" />;
  return <SelectedStudentHome selection={selection} />;
}

function SelectedStudentHome({ selection: { environment, edge } }: { selection: EntrySelection }) {
  const router = useRouter();
  const loadHome = useCallback(
    (selected: WorkEnvironment) =>
      edge ? loadEdgeStudentHome(selected, edge) : loadStudentHome(selected),
    [edge],
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
