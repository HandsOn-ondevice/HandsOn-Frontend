import { Redirect, useRouter } from 'expo-router';
import { AppBar, FeedbackPanel, Screen, StatusBar } from '@/design-system';
import { useEntrySelection } from '@/features/entry/EntrySelectionProvider';
import { isEdgeDataEnabled } from '@/lib/edgeApi';
import RecordingRoute from '../../recording';

export default function NewProcedure() {
  const { selection } = useEntrySelection();
  const router = useRouter();
  if (selection?.role !== 'expert') return <Redirect href="/" />;
  if (!isEdgeDataEnabled()) return <RecordingRoute />;

  return (
    <Screen scroll>
      <StatusBar />
      <AppBar
        title="새 절차 작성"
        mode="back"
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/expert'))}
      />
      <FeedbackPanel
        title="Edge 녹음 연동을 준비하고 있어요."
        subtitle="숙련자 홈에서 이미 작성한 초안을 열 수 있어요."
      />
    </Screen>
  );
}
