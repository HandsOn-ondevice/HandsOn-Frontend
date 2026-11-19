import type { ReactNode } from 'react';
import { Redirect } from 'expo-router';
import { useWorkflowSession } from '../state/useWorkflowSession';

/** URL 진입이나 뒤로 가기는 업무 명령을 실행하거나 종료된 세션을 초기화하지 않는다. */
export function CompletionRouteGate({
  sessionId,
  screen,
  children,
}: {
  sessionId: string;
  screen: 'execution' | 'review' | 'cleanup' | 'results' | 'details';
  children: ReactNode;
}) {
  const { session } = useWorkflowSession(sessionId);
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
