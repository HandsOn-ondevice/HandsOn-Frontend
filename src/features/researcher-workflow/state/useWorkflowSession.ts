import { useCallback, useEffect, useRef, useState } from 'react';
import { createRequestId } from '../application/request-id';
import type { WorkflowRepository } from '../application/WorkflowRepository';
import {
  WorkflowError,
  type CommandContext,
  type ExperimentSession,
  type WorkflowCommand,
  type WorkflowErrorCode,
} from '../domain/models';
import { useWorkflowRepository } from './WorkflowProvider';

export function workflowErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : '요청을 처리하지 못했습니다. 다시 시도해 주세요.';
}

interface SessionResource {
  sessionId: string;
  session: ExperimentSession | null;
  loading: boolean;
  error: string | null;
  errorCode: WorkflowErrorCode | null;
}

type CommandAttempt = {
  sessionId: string;
  command: WorkflowCommand;
  context: CommandContext;
};

type PendingSubmission = {
  repository: WorkflowRepository;
  attempt: CommandAttempt;
};

const failure = (reason: unknown) => ({
  error: workflowErrorMessage(reason),
  errorCode: reason instanceof WorkflowError ? reason.code : null,
});

export function useWorkflowSession(sessionId: string) {
  const repository = useWorkflowRepository();
  const [resource, setResource] = useState<SessionResource>({
    sessionId,
    session: null,
    loading: true,
    error: null,
    errorCode: null,
  });
  const [pending, setPending] = useState(false);
  const [reload, setReload] = useState(0);
  const [retry, setRetry] = useState<CommandAttempt | null>(null);
  const busy = useRef(false);
  const lifetime = useRef<{ active: boolean }>({ active: false });
  const pendingSubmission = useRef<PendingSubmission | null>(null);
  const session = resource.sessionId === sessionId ? resource.session : null;
  const retryable = retry?.sessionId === sessionId ? retry : null;

  useEffect(() => {
    const scope = { active: true };
    lifetime.current = scope;
    const awaitingSubmission = () =>
      pendingSubmission.current?.repository === repository &&
      pendingSubmission.current.attempt.sessionId === sessionId;
    const receive = (next: ExperimentSession) => {
      // A background read can observe a committed write whose response never reached this screen.
      if (scope.active && !awaitingSubmission()) {
        setResource((previous) => {
          if (
            previous.session?.sessionId === next.sessionId &&
            previous.session.revision > next.revision
          )
            return previous;
          return {
            sessionId,
            session: next,
            loading: false,
            error: null,
            errorCode: null,
          };
        });
      }
    };
    const unsubscribe = repository.subscribe(sessionId, receive, (reason) => {
      if (scope.active && !awaitingSubmission())
        setResource((previous) => ({ ...previous, ...failure(reason) }));
    });
    repository
      .getSession(sessionId)
      .then(receive)
      .catch((reason: unknown) => {
        if (scope.active && !awaitingSubmission())
          setResource((previous) =>
            previous.sessionId === sessionId && previous.session && !previous.loading
              ? previous
              : { sessionId, session: null, loading: false, ...failure(reason) },
          );
      });
    return () => {
      scope.active = false;
      unsubscribe();
    };
  }, [repository, sessionId, reload]);

  const send = useCallback(
    async (attempt: CommandAttempt) => {
      const { sessionId: target, command, context } = attempt;
      if (!session || target !== sessionId || busy.current) return;
      const scope = lifetime.current;
      const submission = command.type === 'submitResult' ? { repository, attempt } : null;
      if (submission) pendingSubmission.current = submission;
      let keepSubmission = false;
      busy.current = true;
      setPending(true);
      setResource((previous) => ({ ...previous, error: null, errorCode: null }));
      try {
        const next = await repository.executeCommand(target, command, context);
        if (scope.active) {
          setRetry(null);
          setResource((previous) =>
            previous.session?.sessionId === target && previous.session.revision > next.revision
              ? previous
              : { sessionId: target, session: next, loading: false, error: null, errorCode: null },
          );
          return next;
        }
      } catch (reason) {
        const error = failure(reason);
        const rejected = reason instanceof WorkflowError ? reason : undefined;
        keepSubmission = Boolean(submission && error.errorCode === 'OUTCOME_UNKNOWN');
        // Edge may commit a new revision even when the requested operation fails.
        const latest =
          rejected?.session ??
          (session.source === 'api' && error.errorCode !== 'OUTCOME_UNKNOWN'
            ? await repository.getSession(target).catch(() => null)
            : null);
        if (scope.active) {
          setRetry(error.errorCode === 'OUTCOME_UNKNOWN' ? attempt : null);
          if (
            command.type === 'submitResult' &&
            rejected?.code === 'ALREADY_SUBMITTED' &&
            rejected.resultId === target &&
            latest?.submission?.status === 'submitted' &&
            latest.submission.resultId === rejected.resultId
          ) {
            setResource({
              sessionId: target,
              session: latest,
              loading: false,
              error: null,
              errorCode: null,
            });
            return latest;
          }
          setResource((previous) => ({
            ...previous,
            session:
              latest && (!previous.session || latest.revision >= previous.session.revision)
                ? latest
                : previous.session,
            ...error,
          }));
        }
      } finally {
        if (
          submission &&
          pendingSubmission.current === submission &&
          (!scope.active || !keepSubmission)
        )
          pendingSubmission.current = null;
        busy.current = false;
        if (scope.active) setPending(false);
      }
    },
    [repository, sessionId, session],
  );

  const execute = useCallback(
    (command: WorkflowCommand) => {
      if (!session || retryable) return;
      return send({
        sessionId,
        command,
        context: { requestId: createRequestId(), expectedRevision: session.revision },
      });
    },
    [retryable, send, session, sessionId],
  );
  const heartbeat = useCallback(
    async (signal?: AbortSignal) => {
      if (!repository.heartbeat || signal?.aborted) return;
      try {
        await repository.heartbeat(sessionId, signal);
      } finally {
        if (!signal?.aborted) await repository.getSession(sessionId);
      }
    },
    [repository, sessionId],
  );

  return {
    session,
    loading: resource.sessionId !== sessionId || resource.loading,
    pending,
    error: resource.sessionId === sessionId ? resource.error : null,
    errorCode: resource.sessionId === sessionId ? resource.errorCode : null,
    execute,
    heartbeat,
    canRetryCommand: retryable !== null,
    retryCommand: () => {
      if (retryable) return send(retryable);
    },
    refresh: () => {
      if (busy.current || retryable?.command.type === 'submitResult') return;
      setResource({ sessionId, session: null, loading: true, error: null, errorCode: null });
      setReload((value) => value + 1);
    },
  };
}
