import { Redirect, useRouter } from 'expo-router';
import type { WorkEnvironment } from '@/features/entry/entryEnvironment';
import { useEntrySelection } from '@/features/entry/EntrySelectionProvider';
import { StudentHomeScreen } from '@/features/student-home/StudentHomeScreen';
import { getStudentHomeDestination } from '@/features/student-home/studentHomeRoutes';
import { useStudentHome } from '@/features/student-home/useStudentHome';

export default function StudentHome() {
  const { selection } = useEntrySelection();
  if (selection?.role !== 'student') return <Redirect href="/" />;
  return <SelectedStudentHome environment={selection.environment} />;
}

function SelectedStudentHome({ environment }: { environment: WorkEnvironment }) {
  const router = useRouter();
  const { lookup, reload } = useStudentHome(environment);

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
