import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { AppText, Button, FeedbackPanel, Screen } from '@/design-system';
import { matchesWorkflowResult } from '../application/workflow-queries';
import { useWorkflowSession } from '../state/useWorkflowSession';

/** URL 진입이나 뒤로 가기는 업무 명령을 실행하거나 종료된 세션을 초기화하지 않는다. */
export function CompletionRouteGate({
  sessionId,
  screen,
  resultId,
  fromReview = false,
  children,
}: {
  sessionId: string;
  screen: 'execution' | 'review' | 'cleanup' | 'results' | 'details';
  resultId?: string | readonly string[];
  fromReview?: boolean;
  children: ReactNode;
}) {
  const { session, loading } = useWorkflowSession(sessionId);
  const checkResult = ['results', 'details'].includes(screen) && resultId !== undefined;
  if (checkResult && loading)
    return (
      <Screen>
        <AppText>완료 결과를 확인하고 있습니다.</AppText>
      </Screen>
    );
  if (checkResult && (!session || !matchesWorkflowResult(session, resultId)))
    return (
      <Screen>
        <View testID="unavailable-workflow-result">
          <FeedbackPanel
            title="결과를 찾을 수 없습니다"
            subtitle="요청한 결과 ID가 이 세션의 완료 기록과 일치하지 않습니다."
            tone="warning"
          />
          <Button
            label="세션 결과 확인"
            onPress={() =>
              router.replace({
                pathname: '/researcher-workflow/[sessionId]/results',
                params: { sessionId },
              })
            }
          />
        </View>
      </Screen>
    );
  if (session) {
    if (
      ['completed', 'submitted'].includes(session.phase) &&
      !['results', 'details'].includes(screen)
    )
      return (
        <Redirect
          href={{ pathname: '/researcher-workflow/[sessionId]/results', params: { sessionId } }}
        />
      );
    if (session.phase === 'cleaningUp' && screen === 'execution')
      return (
        <Redirect
          href={{ pathname: '/researcher-workflow/[sessionId]/cleanup', params: { sessionId } }}
        />
      );
    if (
      screen === 'execution' &&
      !fromReview &&
      session.phase === 'running' &&
      session.execution &&
      !session.execution.cursor
    )
      return (
        <Redirect
          href={{ pathname: '/researcher-workflow/[sessionId]/review', params: { sessionId } }}
        />
      );
  }
  return children;
}
