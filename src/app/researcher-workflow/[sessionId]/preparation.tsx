import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEntrySelection } from '@/features/entry/EntrySelectionProvider';
import { EdgePreparationScreen } from '@/features/researcher-workflow/screens/EdgePreparationScreen';
import { PreparationScreen } from '@/features/researcher-workflow/screens/PreparationScreen';
import { useWorkflowSession } from '@/features/researcher-workflow/state/useWorkflowSession';
import { isEdgeDataEnabled } from '@/lib/edgeApi';

export default function PreparationRoute() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  return isEdgeDataEnabled() ? (
    <EdgePreparationRoute key={sessionId} sessionId={sessionId} />
  ) : (
    <MockPreparationRoute sessionId={sessionId} />
  );
}

function EdgePreparationRoute({ sessionId }: { sessionId: string }) {
  const { selection } = useEntrySelection();
  if (selection?.role !== 'student') return <Redirect href="/" />;

  return (
    <EdgePreparationScreen
      sessionId={sessionId}
      token={selection.edgeToken}
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/student'))}
      onHome={() => router.dismissTo('/student')}
    />
  );
}

function MockPreparationRoute({ sessionId }: { sessionId: string }) {
  const { session } = useWorkflowSession(sessionId);
  if (session?.phase === 'paused')
    return (
      <Redirect
        href={{ pathname: '/researcher-workflow/[sessionId]/paused', params: { sessionId } }}
      />
    );
  return (
    <PreparationScreen
      key={sessionId}
      sessionId={sessionId}
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/researcher-workflow'))}
      onHome={() => router.dismissTo('/student')}
      onDeviceCheck={() =>
        router.push({
          pathname: '/researcher-workflow/[sessionId]/device-check',
          params: { sessionId },
        })
      }
    />
  );
}
