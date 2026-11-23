import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { AppBar, AppText, Button, FeedbackPanel, Screen, StatusBar } from '@/design-system';
import { currentEdgeHold } from '@/features/researcher-workflow/domain/edge-hold';
import { selectExecution } from '@/features/researcher-workflow/domain/execution';
import type { ExperimentSession } from '@/features/researcher-workflow/domain/models';
import { PreparationScreen } from '@/features/researcher-workflow/screens/PreparationScreen';
import { isEdgeWorkflowEnabled } from '@/features/researcher-workflow/state/workflow-repository';

function getContinuationPath(session: ExperimentSession, fromHome: boolean) {
  const manualPausePath = fromHome
    ? '/researcher-workflow/[sessionId]/resume'
    : '/researcher-workflow/[sessionId]/paused';
  switch (session.phase) {
    case 'running': {
      if (fromHome && session.source === 'mock') {
        const execution = selectExecution(session);
        if (execution.requiresRecovery) return '/researcher-workflow/[sessionId]/recovery';
        if (execution.requiresRemeasurement)
          return '/researcher-workflow/[sessionId]/remeasurement';
      }
      return '/researcher-workflow/[sessionId]/execution';
    }
    case 'paused':
      return manualPausePath;
    case 'held':
      return (currentEdgeHold(session)?.reasonCode ?? session.holdReason?.code) === 'USER_PAUSED'
        ? manualPausePath
        : '/researcher-workflow/[sessionId]/recovery';
    case 'awaitingDeviceCheck':
    case 'readyToExecute':
      return '/researcher-workflow/[sessionId]/device-check';
    case 'cleaningUp':
      return '/researcher-workflow/[sessionId]/cleanup';
    case 'awaitingCleanup':
      return session.cleanup?.attempts.at(-1)?.status === 'failed' ||
        session.cleanup?.deviceReleasedAt
        ? '/researcher-workflow/[sessionId]/cleanup'
        : '/researcher-workflow/[sessionId]/review';
    case 'readyToSubmit':
      return '/researcher-workflow/[sessionId]/results';
    case 'completed':
      if (session.submission?.status === 'submitted') {
        return '/researcher-workflow/[sessionId]/results';
      }
  }
}

export default function PreparationRoute() {
  const { sessionId, resume, fromHome } = useLocalSearchParams<{
    sessionId: string;
    resume?: string;
    fromHome?: string;
  }>();
  const continuingFromHome = fromHome === '1';
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
      continuationLoading={
        continuingFromHome && (
          <Screen>
            <StatusBar />
            <AppBar title="실험 이어서 진행" mode="back" onBack={onBack} />
            <AppText accessibilityLiveRegion="polite">
              저장된 실험 상태를 불러오고 있습니다.
            </AppText>
          </Screen>
        )
      }
      renderResume={(session) => {
        if (
          !continuingFromHome &&
          (session.source === 'api' ? resume !== '1' : session.phase !== 'paused')
        ) {
          return null;
        }
        const pathname = getContinuationPath(session, continuingFromHome);
        if (pathname) {
          const params =
            pathname === '/researcher-workflow/[sessionId]/resume'
              ? { sessionId, fromHome }
              : { sessionId };
          return <Redirect href={{ pathname, params }} />;
        }
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
