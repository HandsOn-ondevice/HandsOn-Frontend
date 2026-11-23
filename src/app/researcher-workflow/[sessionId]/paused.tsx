import { router, useLocalSearchParams } from 'expo-router';
import { EdgePauseScreen } from '@/features/researcher-workflow/screens/EdgePauseScreen';
import { PauseScreen } from '@/features/researcher-workflow/screens/PauseScreen';
import { isEdgeWorkflowEnabled } from '@/features/researcher-workflow/state/workflow-repository';

export default function PauseRoute() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const onHome = () => router.dismissTo('/student');
  const onResume = () =>
    router.push({ pathname: '/researcher-workflow/[sessionId]/resume', params: { sessionId } });
  if (isEdgeWorkflowEnabled()) {
    return (
      <EdgePauseScreen key={sessionId} sessionId={sessionId} onHome={onHome} onResume={onResume} />
    );
  }

  return (
    <PauseScreen
      key={sessionId}
      sessionId={sessionId}
      onHome={onHome}
      onResume={onResume}
      onBack={() =>
        router.dismissTo({
          pathname: '/researcher-workflow/[sessionId]/execution',
          params: { sessionId },
        })
      }
    />
  );
}
