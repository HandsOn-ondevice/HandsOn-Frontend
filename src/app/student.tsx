import { Redirect, useRouter } from 'expo-router';
import { useCallback } from 'react';
import type { WorkEnvironment } from '@/features/entry/entryEnvironment';
import { useEntrySelection } from '@/features/entry/EntrySelectionProvider';
import { StudentHomeScreen } from '@/features/student-home/StudentHomeScreen';
import { getStudentHomeDestination } from '@/features/student-home/studentHomeRoutes';
import { useStudentHome } from '@/features/student-home/useStudentHome';
import { loadStudentHome } from '@/features/student-home/studentHomeData';

export default function StudentHome() {
  const { selection } = useEntrySelection();
  if (selection?.role !== 'student') return <Redirect href="/" />;
  return (
    <SelectedStudentHome environment={selection.environment} edgeToken={selection.edgeToken} />
  );
}

function SelectedStudentHome({
  environment,
  edgeToken,
}: {
  environment: WorkEnvironment;
  edgeToken?: string;
}) {
  const router = useRouter();
  const loadHome = useCallback(
    (environment: WorkEnvironment) => loadStudentHome(environment, edgeToken),
    [edgeToken],
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
