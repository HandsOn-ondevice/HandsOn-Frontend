import { Redirect, useRouter } from 'expo-router';
import { AppText, Button, Screen, StatusBar, SurfaceCard } from '@/design-system';
import type { EntrySelection } from './entryEnvironment';
import { useEntrySelection } from './EntrySelectionProvider';

export function RoleHome({ role }: { role: EntrySelection['role'] }) {
  const router = useRouter();
  const { selection } = useEntrySelection();

  if (selection?.role !== role) return <Redirect href="/" />;

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }

  return (
    <Screen scroll>
      <StatusBar />
      <AppText variant="heading" accessibilityRole="header">
        {role === 'student' ? '연구생 홈' : '숙련자 홈'}
      </AppText>
      <SurfaceCard title="작업 환경" subtitle={selection.environment.name} />
      {role === 'student' ? (
        <Button label="승인 절차 선택" icon="flask" onPress={() => router.push('/procedures')} />
      ) : null}
      <Button label="뒤로가기" variant="secondary" icon="back" onPress={goBack} />
    </Screen>
  );
}
