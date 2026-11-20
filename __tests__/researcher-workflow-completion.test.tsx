import { describe, expect, jest, test } from '@jest/globals';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';
import {
  WorkflowProvider,
  useWorkflowRepository,
} from '../src/features/researcher-workflow/state/WorkflowProvider';
import {
  developmentRepository,
  workflowQueries,
} from '../src/features/researcher-workflow/state/workflow-repository';
import {
  createWorkflowQueries,
  matchesWorkflowResult,
} from '../src/features/researcher-workflow/application/workflow-queries';
import { CompletionRouteGate } from '../src/features/researcher-workflow/screens/CompletionRouteGate';
import { CleanupScreen } from '../src/features/researcher-workflow/screens/CleanupScreen';
import { CompletionReviewScreen } from '../src/features/researcher-workflow/screens/CompletionReviewScreen';
import { ResultSummaryScreen } from '../src/features/researcher-workflow/screens/ResultSummaryScreen';
import { MeasurementDetailsScreen } from '../src/features/researcher-workflow/screens/MeasurementDetailsScreen';
import {
  MockWorkflowRepository,
  type MockDependencies,
} from '../src/features/researcher-workflow/infrastructure/mock/MockWorkflowRepository';
import { buildMockDiagnostics } from '../src/features/researcher-workflow/infrastructure/mock/device-check-scenarios';
import { buildMockExecutionReport } from '../src/features/researcher-workflow/infrastructure/mock/execution-scenarios';
import {
  buildMockCleanupReport,
  buildMockSubmissionReport,
  type MockSubmissionInput,
} from '../src/features/researcher-workflow/infrastructure/mock/completion-scenarios';
import { mockProcedure } from '../src/features/researcher-workflow/infrastructure/mock/fixtures';
import { selectExecution } from '../src/features/researcher-workflow/domain/execution';
import {
  acceptedMeasurement,
  selectCleanup,
  selectCompletionReview,
  selectResult,
  conditionAverages,
  type CleanupReport,
  type MockSubmissionReport,
} from '../src/features/researcher-workflow/domain/completion';
import {
  finishCleanupOutput,
  finishMockSubmission,
} from '../src/features/researcher-workflow/infrastructure/mock/completion-transitions';
import type { WorkflowCommand } from '../src/features/researcher-workflow/domain/models';

async function fixture(dependencies: MockDependencies = {}) {
  const repository = new MockWorkflowRepository({
    inspect: async (input) => buildMockDiagnostics(input),
    sample: async (input) => buildMockExecutionReport(input),
    cleanup: async (input) => buildMockCleanupReport(input),
    submit: async (input) => buildMockSubmissionReport(input),
    ...dependencies,
  });
  let session = await repository.createSession({
    requestId: 'create-completion',
    operatorId: 'completion-researcher',
    procedure: mockProcedure,
  });
  let requests = 0;
  const get = async () => {
    session = await repository.getSession(session.sessionId);
    return session;
  };
  const send = async (command: WorkflowCommand) => {
    await get();
    session = await repository.executeCommand(session.sessionId, command, {
      requestId: `completion-${requests++}`,
      expectedRevision: session.revision,
    });
    return session;
  };
  const settle = async () => {
    await waitFor(async () => {
      const s = await get();
      expect(s.deviceChecks.at(-1)?.status).not.toBe('checking');
      expect(selectExecution(s).sampling).toBe(false);
      expect(s.completion?.cleanupAttempts.at(-1)?.status).not.toBe('pending');
      expect(s.completion?.submissions.at(-1)?.status).not.toBe('pending');
    });
    return get();
  };
  for (const check of mockProcedure.preparation.filter((item) => item.owner === 'operator'))
    await send({ type: 'setPreparationCheck', checkId: check.id, checked: true });
  await send({ type: 'completePreparation' });
  await send({ type: 'startDeviceCheck' });
  await settle();
  await send({ type: 'startExecution' });
  const measure = async () => {
    const cursor = (await get()).execution!.cursor!;
    await send({ type: 'requestExecutionSample', cursorId: cursor.cursorId });
    await settle();
    const state = selectExecution(await get());
    return send({
      type: 'completeExecutionStep',
      cursorId: cursor.cursorId,
      sampleAttemptId: state.latest!.attemptId,
    });
  };
  const measureAll = async () => {
    for (let i = 0; i < 15; i++) await measure();
    return get();
  };
  return { repository, get, send, settle, measure, measureAll };
}

describe('S12 실제 기록 검토와 필수 재측정', () => {
  test('필수 15개 조건·회차를 근거로 검토하며 표시 숫자·중복 valid·근거 없는 valid로 종료를 허용하지 않는다', async () => {
    const f = await fixture();
    let session = await f.get();
    expect(selectCompletionReview(session)).toMatchObject({
      required: 15,
      validCount: 0,
      allValid: false,
      canCleanup: false,
    });
    await expect(f.send({ type: 'startCleanup' })).rejects.toMatchObject({ code: 'INVALID_STATE' });
    session = await f.measureAll();
    expect(selectCompletionReview(session)).toMatchObject({
      validCount: 15,
      allValid: true,
      canCleanup: true,
    });
    expect(
      session.execution?.attempts.every((attempt) => acceptedMeasurement(session, attempt)),
    ).toBe(true);
    const withoutEvidence = {
      ...session,
      evidence: session.evidence.filter(
        (item) => item.attemptId !== session.execution!.attempts[0].attemptId,
      ),
    };
    expect(selectCompletionReview(withoutEvidence).allValid).toBe(false);
    const duplicate = {
      ...session,
      execution: {
        ...session.execution!,
        attempts: [...session.execution!.attempts, session.execution!.attempts[0]],
      },
    };
    expect(selectCompletionReview(duplicate).validCount).toBe(14);
    expect(
      selectCompletionReview({
        ...session,
        execution: { ...session.execution!, attempts: session.execution!.attempts.slice(0, 14) },
      }).issues,
    ).toHaveLength(1);
  });

  test('누락된 마지막 회차를 명시적으로 재측정하고 같은 세션·승인 버전·기존 기록을 보존한 채 검토로 복귀한다', async () => {
    const f = await fixture();
    for (let i = 0; i < 14; i++) await f.measure();
    const before = await f.get();
    const target = selectCompletionReview(before).issues[0];
    await f.send({
      type: 'requestReviewMeasurement',
      conditionId: target.conditionId,
      trialIndex: target.trialIndex,
    });
    await expect(
      f.send({
        type: 'requestReviewMeasurement',
        conditionId: target.conditionId,
        trialIndex: target.trialIndex,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_STATE' });
    const after = await f.measure();
    expect(after.execution?.cursor).toBeNull();
    expect(after.sessionId).toBe(before.sessionId);
    expect(after.procedure).toEqual(before.procedure);
    expect(after.execution?.attempts.slice(0, 14)).toEqual(before.execution?.attempts);
    expect(after.evidence.slice(0, before.evidence.length)).toEqual(before.evidence);
    expect(selectCompletionReview(after)).toMatchObject({ validCount: 15, canCleanup: true });
    expect(after.completion?.reviewRequests[0]).toMatchObject({
      completedAt: expect.any(String),
      acceptedAttemptId: after.execution?.attempts.at(-1)?.attemptId,
    });
    expect(after.execution?.attempts.at(-1)?.purpose).toBe('remeasurement');
  });

  test('무효 회차는 기존 S08·S09 복구와 새 측정·작업자 완료가 필요하고 원본 오류를 삭제하지 않는다', async () => {
    const f = await fixture();
    let session = await f.get();
    const cursor = session.execution!.cursor!;
    f.repository.setExecutionScenario(session.sessionId, 'error');
    await f.send({ type: 'requestExecutionSample', cursorId: cursor.cursorId });
    await f.settle();
    const failed = selectExecution(await f.get()).latest!;
    expect(selectCompletionReview(await f.get()).issues[0].status).toBe('invalid');
    await f.send({
      type: 'requestReviewMeasurement',
      conditionId: cursor.conditionId,
      trialIndex: cursor.trialIndex,
    });
    expect(selectExecution(await f.get()).requiresRecovery).toBe(true);
    await expect(
      f.send({ type: 'requestExecutionSample', cursorId: cursor.cursorId }),
    ).rejects.toMatchObject({ code: 'INVALID_STATE' });
    f.repository.setExecutionScenario(session.sessionId, 'normal');
    await f.send({
      type: 'requestRecovery',
      cursorId: cursor.cursorId,
      blockedAttemptId: failed.attemptId,
    });
    await f.settle();
    session = await f.get();
    const state = selectExecution(session);
    expect(selectCompletionReview(session).validCount).toBe(0);
    await f.send({
      type: 'requestRecoveryRemeasurement',
      cursorId: cursor.cursorId,
      recoveryId: state.recovery!.recoveryId,
    });
    await f.settle();
    const ready = selectExecution(await f.get());
    session = await f.send({
      type: 'completeExecutionStep',
      cursorId: cursor.cursorId,
      sampleAttemptId: ready.latest!.attemptId,
    });
    expect(session.execution?.cursor).toBeNull();
    expect(session.execution?.attempts[0]).toEqual(failed);
    expect(session.execution?.recoveries).toHaveLength(1);
    expect(selectCompletionReview(session)).toMatchObject({ validCount: 1, canCleanup: false });
    expect(session.completion?.reviewRequests[0].replacesAttemptIds).toContain(failed.attemptId);
  });

  test('일시정지 중에는 검토 재측정이나 정리로 건너뛰지 않는다', async () => {
    const f = await fixture();
    const session = await f.get();
    const cursor = session.execution!.cursor!;
    await f.send({ type: 'pauseExecution', cursorId: cursor.cursorId });
    await expect(
      f.send({ type: 'requestReviewMeasurement', conditionId: cursor.conditionId, trialIndex: 1 }),
    ).rejects.toMatchObject({ code: 'INVALID_STATE' });
    await expect(f.send({ type: 'startCleanup' })).rejects.toMatchObject({ code: 'INVALID_STATE' });
  });
});

describe('S13 시스템 응답과 작업자 정리 확인', () => {
  test('Mock 출력 종료 응답이 작업자 확인을 대신하지 않고 필수 정리 순서를 강제한다', async () => {
    const f = await fixture();
    const measured = await f.measureAll();
    await f.send({ type: 'startCleanup' });
    await f.settle();
    let session = await f.get();
    expect(selectCleanup(session)).toMatchObject({ passed: true, count: 0, canFinish: false });
    await expect(
      f.send({ type: 'setCleanupCheck', checkId: 'cables', checked: true }),
    ).rejects.toMatchObject({ code: 'INVALID_STATE' });
    await expect(f.send({ type: 'finishExperiment' })).rejects.toMatchObject({
      code: 'INVALID_STATE',
    });
    for (const checkId of ['powerOff', 'cables', 'storage'] as const)
      await f.send({ type: 'setCleanupCheck', checkId, checked: true });
    session = await f.get();
    expect(selectCleanup(session).canFinish).toBe(true);
    expect(session.execution).toEqual(measured.execution);
    expect(session.checks).toEqual(measured.checks);
    expect(session.deviceChecks).toEqual(measured.deviceChecks);
    await expect(
      f.send({ type: 'setCleanupCheck', checkId: 'powerOff', checked: false }),
    ).rejects.toMatchObject({ code: 'INVALID_STATE' });
    await f.send({ type: 'setCleanupCheck', checkId: 'storage', checked: false });
    expect(selectCleanup(await f.get()).canFinish).toBe(false);
    expect(
      (await f.get()).evidence.filter((item) => item.action === 'cleanupConfirmed'),
    ).toHaveLength(3);
    expect((await f.get()).evidence.at(-1)?.action).toBe('cleanupRevoked');
  });

  test.each(['failed', 'timeout', 'stale', 'past', 'future', 'wrongId', 'exception'] as const)(
    '%s 출력 응답은 성공 처리하지 않고 재시도 시 원본 시도를 보존한다',
    async (kind) => {
      let count = 0;
      const f = await fixture({
        cleanup: async (input) => {
          const report = buildMockCleanupReport(input);
          if (count++) return report;
          if (kind === 'exception') throw new Error('mock error');
          if (kind === 'past' || kind === 'future')
            return {
              ...report,
              checkedAt: kind === 'past' ? '2000-01-01T00:00:00Z' : '2099-01-01T00:00:00Z',
            };
          if (kind === 'wrongId') return { ...report, attemptId: 'another-attempt' };
          return { ...report, status: kind };
        },
      });
      await f.measureAll();
      await f.send({ type: 'startCleanup' });
      await f.settle();
      expect(selectCleanup(await f.get())).toMatchObject({ passed: false, canFinish: false });
      await expect(
        f.send({ type: 'setCleanupCheck', checkId: 'powerOff', checked: true }),
      ).rejects.toMatchObject({ code: 'INVALID_STATE' });
      const failed = (await f.get()).completion!.cleanupAttempts[0];
      await f.send({ type: 'retryCleanupOutput' });
      await f.settle();
      expect(selectCleanup(await f.get()).passed).toBe(true);
      expect((await f.get()).completion!.cleanupAttempts[0]).toEqual(failed);
    },
  );
});

async function finishFixture(dependencies: MockDependencies = {}) {
  const f = await fixture(dependencies);
  await f.measureAll();
  await f.send({ type: 'startCleanup' });
  await f.settle();
  for (const checkId of ['powerOff', 'cables', 'storage'] as const)
    await f.send({ type: 'setCleanupCheck', checkId, checked: true });
  const before = await f.get();
  await f.send({ type: 'finishExperiment' });
  return { ...f, before };
}

describe('읽기 전용 워크플로 조회 계약', () => {
  test('기본 Provider와 외부 조회는 같은 저장소를 읽으며 M03 초기 상태를 바꾸거나 M02를 생성하지 않는다', async () => {
    const before = await developmentRepository.getSession('demo-session-led-m03');
    let captured: unknown;
    function CaptureRepository() {
      captured = useWorkflowRepository();
      return null;
    }
    await render(
      <WorkflowProvider>
        <CaptureRepository />
      </WorkflowProvider>,
    );
    expect(captured).toBe(developmentRepository);
    const commands = jest.spyOn(developmentRepository, 'executeCommand');
    const summary = await workflowQueries.getSessionSummary('demo-session-led-m03');
    expect(summary).toMatchObject({
      sessionId: 'demo-session-led-m03',
      phase: 'preparing',
      source: 'mock',
      cursor: null,
      condition: null,
      resultId: null,
      canOpenResume: false,
      progress: { validMeasurements: 0, totalMeasurements: 15, percentage: 0 },
    });
    expect(Object.keys(workflowQueries).sort()).toEqual(['getResult', 'getSessionSummary']);
    await expect(workflowQueries.getSessionSummary('demo-session-led-m02')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(commands).not.toHaveBeenCalled();
    expect(await developmentRepository.getSession(before.sessionId)).toEqual(before);
    commands.mockRestore();
  });

  test('실제 완료·제출 결과만 ID 쌍으로 조회하며 잘못된 ID·다중 ID·없는 세션은 허용하지 않는다', async () => {
    const f = await finishFixture();
    const queries = createWorkflowQueries(f.repository);
    const completed = await f.get();
    const resultId = completed.completion!.resultId!;
    expect(await queries.getResult(completed.sessionId, resultId)).toEqual(completed);
    for (const id of ['', 'demo-result-led-m02', 'mock-result-missing'])
      await expect(queries.getResult(completed.sessionId, id)).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    expect(matchesWorkflowResult(completed, [resultId])).toBe(false);
    await expect(queries.getResult('missing', resultId)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(queries.getResult('demo-session-led-m03', resultId)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await f.send({ type: 'submitMockResult' });
    await f.settle();
    const submitted = await f.get();
    const commands = jest.spyOn(f.repository, 'executeCommand');
    expect(await queries.getSessionSummary(submitted.sessionId)).toMatchObject({
      phase: 'submitted',
      resultId,
      cursor: null,
      canOpenResume: false,
      progress: { validMeasurements: 15, totalMeasurements: 15, percentage: 100 },
    });
    const snapshot = await queries.getResult(submitted.sessionId, resultId);
    (snapshot as { phase: string }).phase = 'preparing';
    expect(await f.get()).toEqual(submitted);
    expect(commands).not.toHaveBeenCalled();
  });

  test('명시한 결과 ID가 틀리면 결과 화면을 마운트하지 않으며 올바른 ID만 조회한다', async () => {
    const f = await finishFixture();
    const before = await f.get();
    const commands = jest.spyOn(f.repository, 'executeCommand');
    const content = (resultId: string | readonly string[]) => (
      <WorkflowProvider repository={f.repository}>
        <CompletionRouteGate sessionId={before.sessionId} screen="results" resultId={resultId}>
          <Text>허용된 결과 화면</Text>
        </CompletionRouteGate>
      </WorkflowProvider>
    );
    const screen = await render(content('missing-result'));
    expect(screen.queryByText('허용된 결과 화면')).toBeNull();
    await screen.findByText('결과를 찾을 수 없습니다');
    await screen.rerender(content([before.completion!.resultId!]));
    expect(screen.queryByText('허용된 결과 화면')).toBeNull();
    await screen.rerender(content(before.completion!.resultId!));
    await screen.findByText('허용된 결과 화면');
    expect(commands).not.toHaveBeenCalled();
    expect(await f.get()).toEqual(before);
  });

  test('접수 안내는 조회 버튼 없이 유지하고 외부 결과 조회·상세 이동은 ID·revision·제출과 측정 이력을 보존한다', async () => {
    const f = await finishFixture();
    await f.send({ type: 'submitMockResult' });
    await f.settle();
    const before = await f.get();
    const commands = jest.spyOn(f.repository, 'executeCommand');
    const details = jest.fn();
    const results = jest.fn();
    const screen = await render(
      <WorkflowProvider repository={f.repository}>
        <ResultSummaryScreen sessionId={before.sessionId} onHome={() => {}} onDetails={details} />
      </WorkflowProvider>,
    );
    await screen.findByText('결과를 제출했습니다');
    expect(screen.queryByRole('button', { name: '제출한 결과 조회' })).toBeNull();
    expect(screen.queryByRole('button', { name: '상세 이력' })).toBeNull();
    expect(screen.getByRole('button', { name: '홈으로' })).toBeTruthy();
    await screen.rerender(
      <WorkflowProvider repository={f.repository}>
        <ResultSummaryScreen
          sessionId={before.sessionId}
          onHome={() => {}}
          onDetails={details}
          showSubmittedResult
        />
      </WorkflowProvider>,
    );
    await screen.findByText('제출 완료 · 읽기 전용');
    expect(screen.getByText('조건별 측정 · 15 / 15')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '숙련자에게 제출' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: '50% 조건 상세 보기' }));
    expect(details).toHaveBeenCalledWith('output-50', before.completion!.resultId);
    await screen.rerender(
      <WorkflowProvider repository={f.repository}>
        <MeasurementDetailsScreen
          sessionId={before.sessionId}
          conditionId="output-50"
          onResults={results}
        />
      </WorkflowProvider>,
    );
    await screen.findByText('420.0 lx');
    await fireEvent.press(screen.getByRole('button', { name: '전체 결과로 돌아가기' }));
    expect(results).toHaveBeenCalledWith(before.completion!.resultId);
    expect(commands).not.toHaveBeenCalled();
    expect(await f.get()).toEqual(before);
  });
});

describe('S14 종료·Mock 제출과 S15 실제 결과', () => {
  test('종료와 제출 중복을 막고 기존 측정·작업자·정리 이력 및 실제 조건별 평균을 유지한다', async () => {
    const f = await finishFixture();
    const finished = await f.get();
    expect(finished.phase).toBe('completed');
    expect(selectResult(finished)).toMatchObject({
      available: true,
      canSubmit: true,
      submitted: false,
    });
    expect(finished.execution).toEqual(f.before.execution);
    expect(finished.evidence.slice(0, f.before.evidence.length)).toEqual(f.before.evidence);
    expect(await f.send({ type: 'finishExperiment' })).toEqual(finished);
    for (const command of [
      { type: 'startExecution' },
      { type: 'completePreparation' },
      { type: 'pauseExecution', cursorId: 'old' },
      { type: 'setCleanupCheck', checkId: 'storage', checked: false },
    ] as const)
      await expect(f.send(command)).rejects.toMatchObject({ code: 'INVALID_STATE' });
    expect(conditionAverages(finished, 'output-50')).toMatchObject({
      illuminance: 420,
      current: 83,
      power: 416,
      deviation: 0,
    });
    await f.send({ type: 'submitMockResult' });
    await f.settle();
    const submitted = await f.get();
    expect(selectResult(submitted).submitted).toBe(true);
    expect(submitted.completion?.submissions).toHaveLength(1);
    expect(submitted.completion?.submissions[0].report).toMatchObject({
      source: 'mock',
      persistent: false,
      destination: 'mock-review-queue',
      receiptId: expect.any(String),
    });
    expect(await f.send({ type: 'submitMockResult' })).toEqual(submitted);
    expect(await f.send({ type: 'finishExperiment' })).toEqual(submitted);
    expect(submitted.execution).toEqual(finished.execution);
    expect(submitted.completion?.checks).toEqual(finished.completion?.checks);
  });

  test('제출 대기 중 중복 요청과 이전 requestId의 다른 명령을 차단하며 구독 복귀로 새 제출을 만들지 않는다', async () => {
    let resolve!: (report: MockSubmissionReport) => void;
    const submit = jest.fn(
      async () =>
        new Promise<MockSubmissionReport>((done) => {
          resolve = done;
        }),
    );
    const f = await finishFixture({ submit });
    const before = await f.get();
    const context = { requestId: 'submit-once', expectedRevision: before.revision };
    const pending = await f.repository.executeCommand(
      before.sessionId,
      { type: 'submitMockResult' },
      context,
    );
    expect(
      await f.repository.executeCommand(before.sessionId, { type: 'submitMockResult' }, context),
    ).toEqual(pending);
    await expect(f.send({ type: 'submitMockResult' })).rejects.toMatchObject({
      code: 'INVALID_STATE',
    });
    await expect(
      f.repository.executeCommand(before.sessionId, { type: 'finishExperiment' }, context),
    ).rejects.toMatchObject({ code: 'REQUEST_CONFLICT' });
    const listener = jest.fn();
    const unsubscribe = f.repository.subscribe(before.sessionId, listener);
    unsubscribe();
    expect(submit).toHaveBeenCalledTimes(1);
    resolve(
      buildMockSubmissionReport({
        sessionId: before.sessionId,
        attemptId: pending.completion!.submissions[0].attemptId,
        resultId: before.completion!.resultId!,
        now: () => new Date().toISOString(),
      }),
    );
    await f.settle();
    expect(selectResult(await f.get()).submitted).toBe(true);
    expect(listener).not.toHaveBeenCalled();
  });

  test.each(['failed', 'timeout', 'past', 'future', 'wrongId', 'exception'] as const)(
    '%s 제출 응답은 성공으로 위장하지 않고 실패 기록과 동일 결과를 보존한 채 재시도한다',
    async (kind) => {
      let count = 0;
      const f = await finishFixture({
        submit: async (input) => {
          const report = buildMockSubmissionReport(input);
          if (count++) return report;
          if (kind === 'exception') throw new Error('Mock submission error');
          if (kind === 'past' || kind === 'future')
            return {
              ...report,
              receivedAt: kind === 'past' ? '2000-01-01T00:00:00Z' : '2099-01-01T00:00:00Z',
            };
          if (kind === 'wrongId') return { ...report, resultId: 'different-result' };
          return { ...report, status: kind };
        },
      });
      await f.send({ type: 'submitMockResult' });
      await f.settle();
      const failed = await f.get();
      expect(selectResult(failed)).toMatchObject({ submitted: false, canSubmit: true });
      expect(failed.phase).toBe('completed');
      await f.send({ type: 'submitMockResult' });
      await f.settle();
      const after = await f.get();
      expect(selectResult(after).submitted).toBe(true);
      expect(after.completion?.submissions[0]).toEqual(failed.completion?.submissions[0]);
      expect(after.completion?.resultId).toBe(failed.completion?.resultId);
      expect(after.execution).toEqual(failed.execution);
    },
  );

  test('이미 완료되었거나 다른 시도의 늦은 시스템 응답은 세션을 변경하지 않는다', async () => {
    const f = await finishFixture();
    const session = await f.get();
    const cleanup = session.completion!.cleanupAttempts[0];
    const meta = {
      requestId: 'late',
      eventId: 'late-event',
      evidenceId: 'late-evidence',
      now: new Date().toISOString(),
    };
    expect(
      finishCleanupOutput(session, cleanup.attemptId, cleanup.report as CleanupReport, meta),
    ).toBe(session);
    expect(finishMockSubmission(session, 'another-attempt', undefined, meta)).toBe(session);
  });
});

describe('S12~S15 화면과 동일 Repository 연결', () => {
  test('S12의 14/15 검토에서 선택 조건의 문구·이력을 유지하고 실제 미완료 회차만 재측정한다', async () => {
    const f = await fixture();
    for (let i = 0; i < 11; i++) await f.measure();
    const cursor = (await f.get()).execution!.cursor!;
    f.repository.setExecutionScenario((await f.get()).sessionId, 'error');
    await f.send({ type: 'requestExecutionSample', cursorId: cursor.cursorId });
    await f.settle();
    f.repository.setExecutionScenario((await f.get()).sessionId, 'normal');
    for (const trialIndex of [1, 2, 3]) {
      await f.send({ type: 'requestReviewMeasurement', conditionId: 'output-100', trialIndex });
      await f.measure();
    }
    const before = await f.get();
    expect(selectCompletionReview(before).validCount).toBe(14);
    const onExecution = jest.fn();
    const screen = await render(
      <WorkflowProvider repository={f.repository}>
        <CompletionReviewScreen
          sessionId={before.sessionId}
          onBack={() => {}}
          onExecution={onExecution}
          onCleanup={() => {}}
        />
      </WorkflowProvider>,
    );
    await screen.findByText('75% 조건 3회차가 부족해요');
    expect(screen.getByText('유효 측정 2건 · 무효 1건 · 필수')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '장치 정리로 이동' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: '0% 조건 상세 보기' }));
    expect(screen.getByText('0% 조건의 유효 측정이 확인되었습니다')).toBeTruthy();
    expect(screen.getByText('유효 측정 3건 · 무효 0건')).toBeTruthy();
    expect(await f.get()).toEqual(before);
    await fireEvent.press(screen.getByRole('button', { name: '75% 조건 3회차 재측정' }));
    expect(onExecution).toHaveBeenCalledTimes(1);
    const after = await f.get();
    expect(after.execution?.cursor).toMatchObject({ conditionId: 'output-75', trialIndex: 3 });
    expect(after.execution?.attempts).toEqual(before.execution?.attempts);
  });

  test('정리 화면은 센서 응답 뒤에도 직접 확인을 요구하고 세 항목 확인 후에만 종료한다', async () => {
    const f = await fixture();
    await f.measureAll();
    await f.send({ type: 'startCleanup' });
    await f.settle();
    const session = await f.get();
    const onResults = jest.fn();
    const screen = await render(
      <WorkflowProvider repository={f.repository}>
        <CleanupScreen sessionId={session.sessionId} onBack={() => {}} onResults={onResults} />
      </WorkflowProvider>,
    );
    await screen.findByText('모든 측정이 완료되었습니다');
    expect(screen.getByRole('button', { name: '정리 확인 후 종료 가능' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: '센서 케이블 분리와 정리' })).toBeDisabled();
    const powerOff = screen.getByRole('checkbox', { name: 'USB 전원 장치 OFF 확인' });
    await fireEvent.press(powerOff);
    // S13-2: 시스템 출력과 물리 전원만 확인된 상태에서도 종료할 수 없다.
    expect(powerOff).toBeChecked();
    expect(powerOff).toHaveStyle({ backgroundColor: '#E1F3EB' });
    expect(screen.getByRole('button', { name: 'LED 출력 0% 명령 전송' })).toHaveStyle({
      backgroundColor: '#E1F3EB',
    });
    expect(screen.getByRole('button', { name: '정리 확인 후 종료 가능' })).toBeDisabled();
    const cables = screen.getByRole('checkbox', { name: '센서 케이블 분리와 정리' });
    const storage = screen.getByRole('checkbox', { name: 'LED 모듈·지그 원위치' });
    expect(cables).toHaveStyle({ backgroundColor: '#FFF1D6' });
    expect(storage).toHaveStyle({ backgroundColor: '#FFFFFF' });
    expect(storage).toBeDisabled();
    await fireEvent.press(cables);
    // S13-3: 잠긴 완료 항목도 초록이며 보관 확인 전에는 종료할 수 없다.
    expect(powerOff).toBeDisabled();
    expect(powerOff).toHaveStyle({ backgroundColor: '#E1F3EB' });
    expect(cables).toHaveStyle({ backgroundColor: '#E1F3EB' });
    expect(storage).toHaveStyle({ backgroundColor: '#FFF1D6' });
    expect(screen.getByRole('button', { name: '정리 확인 후 종료 가능' })).toBeDisabled();
    await fireEvent.press(storage);
    // S13-4: 모든 완료 항목이 초록이고 종료가 활성화된다.
    for (const item of [powerOff, cables, storage])
      expect(item).toHaveStyle({ backgroundColor: '#E1F3EB' });
    expect(screen.getByRole('button', { name: '완료하고 결과 보기' })).toBeEnabled();
    await fireEvent.press(screen.getByRole('button', { name: '완료하고 결과 보기' }));
    await waitFor(() => expect(onResults).toHaveBeenCalledTimes(1));
    expect((await f.get()).phase).toBe('completed');
  });

  test('S14 제출 대기·실패·재시도를 표시하고 같은 결과와 측정 이력을 보존한다', async () => {
    const requests: {
      input: MockSubmissionInput;
      resolve: (report: MockSubmissionReport) => void;
    }[] = [];
    const f = await finishFixture({
      submit: (input) => new Promise((resolve) => requests.push({ input, resolve })),
    });
    const before = await f.get();
    const screen = await render(
      <WorkflowProvider repository={f.repository}>
        <ResultSummaryScreen sessionId={before.sessionId} onHome={() => {}} onDetails={() => {}} />
      </WorkflowProvider>,
    );
    await screen.findByText('조건별 측정 · 15 / 15');
    await fireEvent.press(screen.getByRole('button', { name: '숙련자에게 제출' }));
    expect(screen.getByRole('button', { name: '숙련자에게 제출' })).toBeDisabled();
    expect(requests).toHaveLength(1);
    await act(async () => {
      requests[0].resolve({ ...buildMockSubmissionReport(requests[0].input), status: 'failed' });
    });
    await screen.findByText('제출 상태를 확인해 주세요');
    expect(screen.getByRole('button', { name: '숙련자에게 제출' })).toBeEnabled();
    await fireEvent.press(screen.getByRole('button', { name: '숙련자에게 제출' }));
    expect(requests).toHaveLength(2);
    await act(async () => {
      requests[1].resolve(buildMockSubmissionReport(requests[1].input));
    });
    await screen.findByText('결과를 제출했습니다');
    const after = await f.get();
    expect(after.completion?.resultId).toBe(before.completion?.resultId);
    expect(after.execution).toEqual(before.execution);
    expect(after.completion?.submissions.map((item) => item.status)).toEqual([
      'failed',
      'submitted',
    ]);
  });

  test('결과·상세는 실제 조건 평균과 기록을 읽고 Mock 제출 응답 후 처리 결과로 바뀐다', async () => {
    const f = await finishFixture();
    const session = await f.get();
    const onDetails = jest.fn();
    const onHome = jest.fn();
    const summary = (
      <WorkflowProvider repository={f.repository}>
        <ResultSummaryScreen sessionId={session.sessionId} onHome={onHome} onDetails={onDetails} />
      </WorkflowProvider>
    );
    const screen = await render(summary);
    await screen.findByText('조건별 측정 · 15 / 15');
    await fireEvent.press(screen.getByRole('button', { name: '50% 조건 상세 보기' }));
    expect(onDetails).toHaveBeenCalledWith('output-50', session.completion!.resultId);
    await screen.rerender(
      <WorkflowProvider repository={f.repository}>
        <MeasurementDetailsScreen
          sessionId={session.sessionId}
          conditionId="output-50"
          onResults={() => {}}
        />
      </WorkflowProvider>,
    );
    await screen.findByText('420.0 lx');
    expect(screen.getByText('유효 3건 · 무효 0건')).toBeTruthy();
    await screen.rerender(summary);
    await screen.findByText('조건별 측정 · 15 / 15');
    await fireEvent.press(screen.getByRole('button', { name: '숙련자에게 제출' }));
    await screen.findByText('결과를 제출했습니다');
    expect(
      screen.getByText(
        `${session.operatorId} · ${session.procedure.deviceId} · v${session.procedure.version}\n숙련자의 최종 검토를 기다립니다.`,
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/Mock 시연용 제출 · 앱 메모리 내 접수 완료/)).toBeNull();
    expect(screen.queryByRole('button', { name: '숙련자에게 제출' })).toBeNull();
    expect((await f.get()).completion?.submissions).toHaveLength(1);
    expect((await f.get()).completion?.submissions[0].report).toMatchObject({
      source: 'mock',
      destination: 'mock-review-queue',
      persistent: false,
    });
  });
});
