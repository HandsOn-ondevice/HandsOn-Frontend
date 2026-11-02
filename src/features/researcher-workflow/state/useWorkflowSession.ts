import { useCallback, useEffect, useRef, useState } from 'react';
import { createRequestId } from '../application/request-id';
import type { ExperimentSession, WorkflowCommand } from '../domain/models';
import { useWorkflowRepository } from './WorkflowProvider';

export function workflowErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : '요청을 처리하지 못했습니다. 다시 시도해 주세요.';
}

interface SessionResource {
  sessionId: string;
  session: ExperimentSession | null;
  loading: boolean;
  error: string | null;
}

export function useWorkflowSession(sessionId: string) {
  const repository = useWorkflowRepository();
  const [resource, setResource] = useState<SessionResource>({
    sessionId,
    session: null,
    loading: true,
    error: null,
  });
  const [pending, setPending] = useState(false);
  const [reload, setReload] = useState(0);
  const busy = useRef(false);
  const lifetime = useRef<{ active: boolean }>({ active: false });
  const session = resource.sessionId === sessionId ? resource.session : null;

  useEffect(() => {
    const scope = { active: true };
    lifetime.current = scope;
    const receive = (next: ExperimentSession) => {
      if (scope.active)
        setResource((previous) => {
          if (
            previous.session?.sessionId === next.sessionId &&
            previous.session.revision > next.revision
          )
            return previous;
          return { sessionId, session: next, loading: false, error: null };
        });
    };
    const unsubscribe = repository.subscribe(sessionId, receive);
    repository
      .getSession(sessionId)
      .then(receive)
      .catch((reason: unknown) => {
        if (scope.active)
          setResource({
            sessionId,
            session: null,
            loading: false,
            error: workflowErrorMessage(reason),
          });
      });
    return () => {
      scope.active = false;
      unsubscribe();
    };
  }, [repository, sessionId, reload]);

  const execute = useCallback(
    async (command: WorkflowCommand) => {
      if (!session || busy.current) return;
      const scope = lifetime.current;
      busy.current = true;
      setPending(true);
      setResource((previous) => ({ ...previous, error: null }));
      try {
        const next = await repository.executeCommand(sessionId, command, {
          requestId: createRequestId(),
          expectedRevision: session.revision,
        });
        if (scope.active)
          setResource((previous) =>
            previous.session && previous.session.revision > next.revision
              ? previous
              : { sessionId, session: next, loading: false, error: null },
          );
        return scope.active ? next : undefined;
      } catch (reason) {
        if (scope.active)
          setResource((previous) => ({ ...previous, error: workflowErrorMessage(reason) }));
      } finally {
        busy.current = false;
        if (scope.active) setPending(false);
      }
    },
    [repository, sessionId, session],
  );

  return {
    session,
    loading: resource.sessionId !== sessionId || resource.loading,
    pending,
    error: resource.sessionId === sessionId ? resource.error : null,
    execute,
    refresh: () => {
      if (busy.current) return;
      setResource({ sessionId, session: null, loading: true, error: null });
      setReload((value) => value + 1);
    },
  };
}
