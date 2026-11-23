import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { AppBar, Button, FeedbackPanel, Screen, StatusBar } from '@/design-system';
import type { ExperimentSession } from '@/features/researcher-workflow/domain/models';
import { PreparationScreen } from '@/features/researcher-workflow/screens/PreparationScreen';
import { isEdgeWorkflowEnabled } from '@/features/researcher-workflow/state/workflow-repository';

function getContinuationPath(session: ExperimentSession) {
  switch (session.phase) {
    case 'running':
      return '/researcher-workflow/[sessionId]/execution';
    case 'paused':
      return '/researcher-workflow/[sessionId]/paused';
    case 'held':
      return session.holdReason?.code === 'USER_PAUSED'
        ? '/researcher-workflow/[sessionId]/paused'
        : '/researcher-workflow/[sessionId]/recovery';
    case 'awaitingDeviceCheck':
    case 'readyToExecute':
      return '/researcher-workflow/[sessionId]/device-check';
  }
}

export default function PreparationRoute() {
  const { sessionId, resume } = useLocalSearchParams<{ sessionId: string; resume?: string }>();
  const edge = isEdgeWorkflowEnabled();
  const onBack = () =>
    router.canGoBack() ? router.back() : router.replace(edge ? '/student' : '/researcher-workflow');
  const onHome = () => router.dismissTo('/student');

  return (
    <PreparationScreen
      key={sessionId}
      sessionId={sessionId}
      onBack={onBack}
      onHome={onHome}
      renderResume={(session) => {
        if (session.source === 'api' ? resume !== '1' : session.phase !== 'paused') return null;
        const pathname = getContinuationPath(session);
        if (pathname) return <Redirect href={{ pathname, params: { sessionId } }} />;
        if (session.phase === 'completed' || session.phase === 'cancelled') {
          return (
            <Screen scroll>
              <StatusBar />
              <AppBar title="실험 준비 체크" mode="back" onBack={onBack} />
              <FeedbackPanel
                title="이미 종료된 실험 세션이에요."
                subtitle="연구생 홈에서 진행 중인 실험을 다시 확인해 주세요."
              />
              <Button label="연구생 홈으로" onPress={onHome} />
            </Screen>
          );
        }
        return null;
      }}
      onDeviceCheck={() =>
        router.push({
          pathname: '/researcher-workflow/[sessionId]/device-check',
          params: { sessionId },
        })
      }
    />
  );
}
