import { isUserPaused } from '../domain/resume';
import { useWorkflowSession } from '../state/useWorkflowSession';

export function useExecutionSession(
  sessionId: string,
  onDeviceCheck: () => void,
  onPause: () => void,
) {
  const workflow = useWorkflowSession(sessionId);
  const { session, loading, pending, execute, retryCommand, retryCommandType } = workflow;

  async function openConfirmedPause(result: ReturnType<typeof execute>) {
    if (isUserPaused(await result)) onPause();
  }

  const retryPause =
    retryCommandType === 'pauseExecution' ? () => openConfirmedPause(retryCommand()) : undefined;

  function onHeaderBack() {
    if (loading || pending) return;
    if (retryPause) return retryPause();

    const cursor = session?.execution?.cursor;
    if (session?.phase === 'running' && cursor) {
      if (retryCommandType) return;
      return openConfirmedPause(execute({ type: 'pauseExecution', cursorId: cursor.cursorId }));
    }
    onDeviceCheck();
  }

  return { ...workflow, onHeaderBack, retryPause };
}
