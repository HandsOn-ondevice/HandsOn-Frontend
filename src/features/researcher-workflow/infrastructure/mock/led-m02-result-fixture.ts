import type { ExperimentSession } from '../../domain/models';
import { cleanupRequirements, selectCleanup, selectResult } from '../../domain/completion';
import { mockProcedure } from './fixtures';
import { createLedExecutionFixture } from './led-execution-fixture';
import {
  beginExecutionSample,
  finishExecutionSample,
  completeExecutionStep,
} from './execution-transitions';
import { buildMockExecutionReport, type MockExecutionScenario } from './execution-scenarios';
import { beginRecovery } from './recovery-transitions';
import { beginRecoveryRemeasurement } from './remeasurement-transitions';
import {
  transitionCompletion,
  finishCleanupOutput,
  finishMockSubmission,
} from './completion-transitions';
import { buildMockCleanupReport, buildMockSubmissionReport } from './completion-scenarios';

/** 초기 조회용 합성 과거 기록. 실제 측정·백엔드 제출·영구 저장이 아니다. */
export function createLedM02ResultFixture(): ExperimentSession {
  const sessionId = 'demo-session-led-m02';
  const createdAt = '2026-11-18T07:46:00.000Z';
  const procedure: typeof mockProcedure = {
    ...JSON.parse(JSON.stringify(mockProcedure)),
    procedureId: 'demo-procedure-led-output',
    title: 'LED-M02 특성 측정',
    deviceId: 'LED-M02',
    preparation: mockProcedure.preparation.map((item) =>
      item.id === 'device' ? { ...item, title: '장치 ID LED-M02 확인' } : { ...item },
    ),
  };
  const fixture = createLedExecutionFixture(sessionId, createdAt, procedure);
  const { metadata } = fixture;
  let session = fixture.session;

  const finishSample = (scenario: MockExecutionScenario) => {
    const attempt = session.execution!.attempts.at(-1)!;
    const received = metadata();
    session = finishExecutionSample(
      session,
      attempt.attemptId,
      buildMockExecutionReport({
        definition: procedure.deviceCheck!,
        executionDefinition: procedure.execution!,
        cursor: attempt.cursor,
        scenario,
        sampleAttemptId: attempt.attemptId,
        initialStaleObservedAt: createdAt,
        now: () => received.now,
      }),
      received,
    );
  };
  while (session.execution!.cursor) {
    const cursor = session.execution!.cursor;
    const request = metadata();
    session = beginExecutionSample(session, cursor.cursorId, `${request.eventId}:sample`, request);
    if (cursor.conditionId === 'output-50' && cursor.trialIndex === 2) {
      finishSample('stale');
      const recovery = metadata();
      session = beginRecovery(
        session,
        {
          type: 'requestRecovery',
          cursorId: cursor.cursorId,
          blockedAttemptId: session.execution!.attempts.at(-1)!.attemptId,
        },
        `${recovery.eventId}:sample`,
        recovery,
      );
      finishSample('normal');
      const remeasurement = metadata();
      session = beginRecoveryRemeasurement(
        session,
        {
          type: 'requestRecoveryRemeasurement',
          cursorId: cursor.cursorId,
          recoveryId: session.execution!.recoveries!.at(-1)!.recoveryId,
        },
        `${remeasurement.eventId}:sample`,
        remeasurement,
      );
    }
    finishSample('normal');
    const accepted = metadata();
    session = completeExecutionStep(
      session,
      cursor.cursorId,
      session.execution!.attempts.at(-1)!.attemptId,
      `${accepted.eventId}:cursor`,
      accepted,
    );
  }
  const cleanup = metadata();
  const cleanupId = `${cleanup.eventId}:cleanup`;
  session = transitionCompletion(session, { type: 'startCleanup' }, cleanupId, cleanup);
  const cleaned = metadata();
  session = finishCleanupOutput(
    session,
    cleanupId,
    buildMockCleanupReport({
      attemptId: cleanupId,
      sessionId,
      deviceId: procedure.deviceCheck!.deviceId,
      now: () => cleaned.now,
    }),
    cleaned,
  );
  for (const item of cleanupRequirements)
    session = transitionCompletion(
      session,
      {
        type: 'setCleanupCheck',
        checkId: item.id,
        checked: true,
      },
      item.id,
      metadata(),
    );

  if (!selectCleanup(session).canFinish) throw new Error('LED-M02 Mock 정리 근거가 없습니다.');
  const finished = metadata();
  // 고정 과거 기록의 ID다. 새 실험의 mock-result-${id} 생성 규칙과 조회 검증은 유지한다.
  // 다른 결과의 ID를 교체하거나 별칭으로 매핑하지 않고 이 기록에 처음부터 부여한다.
  session = {
    ...session,
    phase: 'completed',
    revision: session.revision + 1,
    updatedAt: finished.now,
    completion: {
      ...session.completion!,
      resultId: 'demo-result-led-m02',
      finishedAt: finished.now,
    },
    evidence: [
      ...session.evidence,
      {
        evidenceId: finished.evidenceId,
        sessionId,
        kind: 'program',
        actorId: 'mock-workflow',
        action: 'experimentFinished',
        source: 'mock',
        recordedAt: finished.now,
      },
    ],
    events: [
      ...session.events,
      {
        eventId: finished.eventId,
        requestId: finished.requestId,
        type: 'experimentFinished',
        occurredAt: finished.now,
        evidenceId: finished.evidenceId,
      },
    ],
  };
  const submission = metadata();
  const submissionId = `${submission.eventId}:submission`;
  session = transitionCompletion(session, { type: 'submitMockResult' }, submissionId, submission);
  const submitted = metadata();
  session = finishMockSubmission(
    session,
    submissionId,
    buildMockSubmissionReport({
      attemptId: submissionId,
      sessionId,
      resultId: session.completion!.resultId!,
      now: () => submitted.now,
    }),
    submitted,
  );
  const result = selectResult(session);
  if (!result.available || !result.submitted) throw new Error('LED-M02 Mock 완료 근거가 없습니다.');
  return session;
}
