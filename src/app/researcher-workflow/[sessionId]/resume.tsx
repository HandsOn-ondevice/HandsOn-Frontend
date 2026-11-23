import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { AppText, Button, FeedbackPanel, Screen } from '@/design-system';
import { EdgeResumeScreen } from '@/features/researcher-workflow/screens/EdgeResumeScreen';
import { ResumeScreen } from '@/features/researcher-workflow/screens/ResumeScreen';
import type { ExperimentSession } from '@/features/researcher-workflow/domain/models';
import { selectResume } from '@/features/researcher-workflow/domain/resume';
import { useWorkflowSession } from '@/features/researcher-workflow/state/useWorkflowSession';
import { isEdgeWorkflowEnabled } from '@/features/researcher-workflow/state/workflow-repository';

export default function ResumeRoute() {
  const { sessionId, fromHome } = useLocalSearchParams<{ sessionId: string; fromHome?: string }>();
  const onBack = () => {
    if (fromHome === '1') {
      router.dismissTo('/student');
      return;
    }
    router.dismissTo({
      pathname: '/researcher-workflow/[sessionId]/paused',
      params: { sessionId },
    });
  };
  const onExecution = () =>
    router.dismissTo({
      pathname: '/researcher-workflow/[sessionId]/execution',
      params: { sessionId },
    });
  if (isEdgeWorkflowEnabled()) {
    return (
      <EdgeResumeScreen
        key={sessionId}
        sessionId={sessionId}
        onBack={onBack}
        onContinue={(session: ExperimentSession) => {
          if (session.phase === 'running') onExecution();
          else {
            router.dismissTo({
              pathname: '/researcher-workflow/[sessionId]/preparation',
              params: { sessionId, resume: '1' },
            });
          }
        }}
        onOtherHold={() =>
          router.replace({
            pathname: '/researcher-workflow/[sessionId]/recovery',
            params: { sessionId },
          })
        }
      />
    );
  }
  return (
    <MockResumeRoute
      key={sessionId}
      sessionId={sessionId}
      onBack={onBack}
      onExecution={onExecution}
    />
  );
}

function MockResumeRoute({
  sessionId,
  onBack,
  onExecution,
}: {
  sessionId: string;
  onBack: () => void;
  onExecution: () => void;
}) {
  const { session, loading } = useWorkflowSession(sessionId);
  const [admittedSession, setAdmittedSession] = useState<string | null>(null);
  const paused = session ? selectResume(session).paused : false;
  if (paused && admittedSession !== sessionId) setAdmittedSession(sessionId);
  // 정상 재개 뒤에는 ResumeScreen의 기존 dismissTo 콜백이 복귀를 소유한다.
  // 진입 가드가 먼저 화면을 교체하면 그 콜백이 취소되고 S06이 중복 생성될 수 있다.
  const resumedHere = session?.phase === 'running' && admittedSession === sessionId;
  if (loading)
    return (
      <Screen>
        <AppText>재개 전 상태를 불러오고 있습니다.</AppText>
      </Screen>
    );
  if (session && !paused && !resumedHere) {
    if (session.phase === 'paused')
      return (
        <Screen>
          <FeedbackPanel
            title="유효한 일시정지 기록이 없습니다"
            subtitle="현재 회차와 일시정지 이벤트를 다시 확인해 주세요."
            tone="warning"
          />
          <Button
            label="현재 작업으로 돌아가기"
            onPress={() =>
              router.replace({
                pathname: '/researcher-workflow/[sessionId]/execution',
                params: { sessionId },
              })
            }
          />
        </Screen>
      );
    const pathname =
      session.phase === 'running'
        ? '/researcher-workflow/[sessionId]/execution'
        : session.phase === 'cleaningUp'
          ? '/researcher-workflow/[sessionId]/cleanup'
          : session.phase === 'completed' || session.phase === 'submitted'
            ? '/researcher-workflow/[sessionId]/results'
            : session.phase === 'preparing'
              ? '/researcher-workflow/[sessionId]/preparation'
              : '/researcher-workflow/[sessionId]/device-check';
    return <Redirect href={{ pathname, params: { sessionId } }} />;
  }
  return <ResumeScreen sessionId={sessionId} onBack={onBack} onExecution={onExecution} />;
}
