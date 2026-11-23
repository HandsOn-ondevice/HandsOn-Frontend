import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { PreparationScreen } from '@/features/researcher-workflow/screens/PreparationScreen';
import { useWorkflowSession } from '@/features/researcher-workflow/state/useWorkflowSession';
import { isEdgeWorkflowEnabled } from '@/features/researcher-workflow/state/workflow-repository';

export default function PreparationRoute() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
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
      onBack={() =>
        router.canGoBack()
          ? router.back()
          : router.replace(isEdgeWorkflowEnabled() ? '/student' : '/researcher-workflow')
      }
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
