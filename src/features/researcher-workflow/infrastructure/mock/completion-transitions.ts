import {
  WorkflowError,
  type ExperimentSession,
  type WorkflowCommand,
  type WorkflowEvent,
} from '../../domain/models';
import {
  cleanupRequirements,
  cleanupReportIssue,
  selectCleanup,
  selectCompletionReview,
  selectResult,
  type CleanupReport,
  type CompletionState,
  type MockSubmissionReport,
} from '../../domain/completion';
import type { TransitionMetadata } from './transition-engine';

type CompletionCommand = Extract<
  WorkflowCommand,
  {
    type:
      | 'requestReviewMeasurement'
      | 'startCleanup'
      | 'retryCleanupOutput'
      | 'setCleanupCheck'
      | 'finishExperiment'
      | 'submitMockResult';
  }
>;
export function isCompletionCommand(command: WorkflowCommand): command is CompletionCommand {
  return [
    'requestReviewMeasurement',
    'startCleanup',
    'retryCleanupOutput',
    'setCleanupCheck',
    'finishExperiment',
    'submitMockResult',
  ].includes(command.type);
}
function initial(): CompletionState {
  return { reviewRequests: [], cleanupAttempts: [], checks: [], submissions: [] };
}
function invalid(message: string): never {
  throw new WorkflowError('INVALID_STATE', message);
}
function event(meta: TransitionMetadata, type: WorkflowEvent['type']): WorkflowEvent {
  return { eventId: meta.eventId, requestId: meta.requestId, occurredAt: meta.now, type };
}
function update(
  session: ExperimentSession,
  meta: TransitionMetadata,
  completion: CompletionState,
  extra: Partial<ExperimentSession>,
  nextEvent: WorkflowEvent,
): ExperimentSession {
  return {
    ...session,
    revision: session.revision + 1,
    updatedAt: meta.now,
    completion,
    ...extra,
    events: [...session.events, nextEvent],
  };
}

/** Mock 전용이다. 실제 제어 API나 승인된 ProcedureSnapshot을 확장하지 않는다. */
export function transitionCompletion(
  session: ExperimentSession,
  command: CompletionCommand,
  id: string,
  meta: TransitionMetadata,
): ExperimentSession {
  if (session.source !== 'mock') invalid('현재 완료 흐름은 Mock 세션에서만 제공됩니다.');
  const review = selectCompletionReview(session);
  const completion = session.completion ?? initial();
  switch (command.type) {
    case 'requestReviewMeasurement': {
      const slot = review.issues.find(
        (item) =>
          item.conditionId === command.conditionId && item.trialIndex === command.trialIndex,
      );
      if (!review.canRemeasure || !slot || !session.execution)
        invalid('누락·무효 회차를 확인한 뒤 재측정을 요청해 주세요.');
      const previous = slot.history.at(-1)?.cursor;
      const current = session.execution.cursor;
      const cursor =
        previous ??
        (current?.conditionId === slot.conditionId && current.trialIndex === slot.trialIndex
          ? current
          : {
              cursorId: id,
              stepId: `measure:${slot.conditionId}`,
              conditionId: slot.conditionId,
              trialIndex: slot.trialIndex,
            });
      return update(
        session,
        meta,
        {
          ...completion,
          reviewRequests: [
            ...completion.reviewRequests,
            {
              requestId: meta.requestId,
              cursor,
              replacesAttemptIds: slot.history.map((item) => item.attemptId),
              requestedAt: meta.now,
            },
          ],
        },
        {
          execution: {
            ...session.execution,
            cursor,
            attempts: session.execution.attempts.map((item) =>
              item.cursor.cursorId === cursor.cursorId && item.status === 'ready'
                ? { ...item, status: 'superseded' as const }
                : item,
            ),
          },
        },
        { ...event(meta, 'reviewMeasurementRequested'), cursor },
      );
    }
    case 'startCleanup':
    case 'retryCleanupOutput': {
      const state = selectCleanup(session);
      if (
        command.type === 'startCleanup'
          ? !review.canCleanup
          : !state.available || state.attempt?.status !== 'failed'
      )
        invalid('유효 측정과 현재 정리 상태를 먼저 확인해 주세요.');
      return update(
        session,
        meta,
        {
          ...completion,
          cleanupAttempts: [
            ...completion.cleanupAttempts,
            { attemptId: id, requestedAt: meta.now, status: 'pending' },
          ],
        },
        { phase: 'cleaningUp' },
        {
          ...event(
            meta,
            command.type === 'startCleanup' ? 'cleanupStarted' : 'cleanupOutputRequested',
          ),
          attemptId: id,
        },
      );
    }
    case 'setCleanupCheck': {
      const state = selectCleanup(session);
      if (!state.available || !state.passed) invalid('출력 종료 응답을 먼저 확인해 주세요.');
      const index = cleanupRequirements.findIndex((item) => item.id === command.checkId);
      if (index < 0) invalid('정리 항목을 확인해 주세요.');
      if (state.checked(command.checkId) === command.checked) return session;
      if (
        command.checked
          ? cleanupRequirements.slice(0, index).some((item) => !state.checked(item.id))
          : cleanupRequirements.slice(index + 1).some((item) => state.checked(item.id))
      )
        invalid('전원 차단·케이블 정리·보관 순서로 확인하고, 취소는 반대 순서로 진행해 주세요.');
      const action = command.checked ? 'cleanupConfirmed' : 'cleanupRevoked';
      return update(
        session,
        meta,
        {
          ...completion,
          checks: command.checked
            ? [
                ...completion.checks,
                { id: command.checkId, confirmedAt: meta.now, evidenceId: meta.evidenceId },
              ]
            : completion.checks.filter((item) => item.id !== command.checkId),
        },
        {
          evidence: [
            ...session.evidence,
            {
              evidenceId: meta.evidenceId,
              sessionId: session.sessionId,
              kind: 'human',
              actorId: session.operatorId,
              action,
              source: 'mock',
              recordedAt: meta.now,
              cleanupCheckId: command.checkId,
            },
          ],
        },
        { ...event(meta, action), evidenceId: meta.evidenceId, cleanupCheckId: command.checkId },
      );
    }
    case 'finishExperiment': {
      if (selectResult(session).finished && ['completed', 'submitted'].includes(session.phase))
        return session;
      if (!selectCleanup(session).canFinish)
        invalid('필수 측정과 장치 정리 확인을 모두 완료해 주세요.');
      return update(
        session,
        meta,
        { ...completion, finishedAt: meta.now, resultId: `mock-result-${id}` },
        {
          phase: 'completed',
          evidence: [
            ...session.evidence,
            {
              evidenceId: meta.evidenceId,
              sessionId: session.sessionId,
              kind: 'program',
              actorId: 'mock-workflow',
              source: 'mock',
              action: 'experimentFinished',
              recordedAt: meta.now,
            },
          ],
        },
        { ...event(meta, 'experimentFinished'), evidenceId: meta.evidenceId },
      );
    }
    case 'submitMockResult': {
      const state = selectResult(session);
      if (state.submitted) return session;
      if (!state.canSubmit)
        invalid('완료된 결과를 확인해 주세요. 제출 처리 중에는 다시 제출할 수 없습니다.');
      return update(
        session,
        meta,
        {
          ...completion,
          submissions: [
            ...completion.submissions,
            { attemptId: id, requestedAt: meta.now, status: 'pending' },
          ],
        },
        {},
        { ...event(meta, 'mockSubmissionRequested'), attemptId: id },
      );
    }
  }
}

export function finishCleanupOutput(
  session: ExperimentSession,
  attemptId: string,
  report: CleanupReport | undefined,
  meta: TransitionMetadata,
): ExperimentSession {
  const attempt = session.completion?.cleanupAttempts.at(-1);
  if (
    session.phase !== 'cleaningUp' ||
    !session.completion ||
    attempt?.attemptId !== attemptId ||
    attempt.status !== 'pending'
  )
    return session;
  const issue = report
    ? cleanupReportIssue(session, attempt, report, meta.now)
    : {
        code: 'CLEANUP_ERROR',
        message: '출력 종료 응답을 받지 못했습니다. 항목을 눌러 다시 요청해 주세요.',
      };
  const type = issue ? 'cleanupOutputFailed' : 'cleanupOutputConfirmed';
  return update(
    session,
    meta,
    {
      ...session.completion,
      cleanupAttempts: session.completion.cleanupAttempts.map((item) =>
        item === attempt
          ? { ...item, status: issue ? 'failed' : 'passed', completedAt: meta.now, report, issue }
          : item,
      ),
    },
    {
      evidence: issue
        ? session.evidence
        : [
            ...session.evidence,
            {
              evidenceId: meta.evidenceId,
              sessionId: session.sessionId,
              kind: 'program',
              actorId: 'mock-output-command',
              action: 'cleanupOutputConfirmed',
              recordedAt: meta.now,
              source: 'mock',
              attemptId,
              readings: report!.readings,
            },
          ],
    },
    { ...event(meta, type), attemptId, ...(issue ? {} : { evidenceId: meta.evidenceId }) },
  );
}

export function finishMockSubmission(
  session: ExperimentSession,
  attemptId: string,
  report: MockSubmissionReport | undefined,
  meta: TransitionMetadata,
): ExperimentSession {
  const completion = session.completion;
  const attempt = completion?.submissions.at(-1);
  if (
    session.phase !== 'completed' ||
    !completion ||
    attempt?.attemptId !== attemptId ||
    attempt.status !== 'pending'
  )
    return session;
  const passed =
    selectResult(session).finished &&
    report?.source === 'mock' &&
    report.attemptId === attemptId &&
    report.sessionId === session.sessionId &&
    report.resultId === completion.resultId &&
    report.destination === 'mock-review-queue' &&
    report.persistent === false &&
    report.status === 'accepted' &&
    !!report.receiptId &&
    Number.isFinite(Date.parse(report.receivedAt)) &&
    Date.parse(report.receivedAt) >= Date.parse(attempt.requestedAt) &&
    Date.parse(report.receivedAt) <= Date.parse(meta.now);
  const type = passed ? 'mockResultSubmitted' : 'mockSubmissionFailed';
  return update(
    session,
    meta,
    {
      ...completion,
      submissions: completion.submissions.map((item) =>
        item === attempt
          ? {
              ...item,
              status: passed ? 'submitted' : 'failed',
              completedAt: meta.now,
              report,
              issue: passed
                ? undefined
                : {
                    code: 'MOCK_SUBMISSION_FAILED',
                    message:
                      '시연용 제출 응답을 확인하지 못했습니다. 기록을 유지한 채 다시 시도해 주세요.',
                  },
            }
          : item,
      ),
    },
    {
      phase: passed ? 'submitted' : 'completed',
      evidence: passed
        ? [
            ...session.evidence,
            {
              evidenceId: meta.evidenceId,
              sessionId: session.sessionId,
              kind: 'program',
              actorId: 'mock-review-queue',
              action: 'mockResultSubmitted',
              source: 'mock',
              recordedAt: meta.now,
              attemptId,
            },
          ]
        : session.evidence,
    },
    { ...event(meta, type), attemptId },
  );
}
