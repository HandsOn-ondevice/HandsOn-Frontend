import { afterEach, expect, jest, test } from '@jest/globals';
import { act, render, renderHook, waitFor } from '@testing-library/react-native';
import { loadEdgeResult } from '@/features/expert-review/edgeResultRepository';
import type { WorkflowRepository } from '@/features/researcher-workflow/application/WorkflowRepository';
import { WorkflowError } from '@/features/researcher-workflow/domain/models';
import { EdgeWorkflowRepository } from '@/features/researcher-workflow/infrastructure/edge/EdgeWorkflowRepository';
import { createEdgeSessionRequest } from '@/features/researcher-workflow/infrastructure/edge/edge-session-request';
import { parseEdgeSession } from '@/features/researcher-workflow/infrastructure/edge/edge-session';
import { EdgeCompletionScreen } from '@/features/researcher-workflow/screens/EdgeCompletionScreen';
import { useWorkflowSession } from '@/features/researcher-workflow/state/useWorkflowSession';
import { WorkflowProvider } from '@/features/researcher-workflow/state/WorkflowProvider';

jest.mock('expo-router', () => ({ router: { replace: jest.fn(), push: jest.fn() } }));
jest.mock('@/features/entry/EntrySelectionProvider', () => ({
  useEntrySelection: () => ({ selection: { environment: { id: 'kit-lab' } } }),
}));
jest.mock('@/features/expert-review/edgeResultRepository', () => ({ loadEdgeResult: jest.fn() }));

const now = '2026-11-24T05:00:00.000Z';
const sessionId = 'session-1';
const checks = ['powerOff', 'cables', 'storage'].map((id) => ({
  id,
  checked: false,
  confirmedAt: null,
  evidenceId: null,
}));
const awaitingCleanup = {
  sessionId,
  phase: 'awaitingCleanup',
  source: 'api',
  dataOrigin: 'simulation',
  workflowVersion: '2.0',
  operatorId: 'operator-01',
  revision: 18,
  createdAt: now,
  updatedAt: now,
  measurementCompletedAt: now,
  pendingJob: null,
  evidence: [],
  events: [],
  checks: [],
  deviceChecks: [],
  procedure: {
    procedureId: 'kit-distance',
    version: '1.1.0',
    approval: 'approved',
    title: '키트 거리 확인',
    deviceId: 'orange-pi-01',
    preparation: [],
    deviceCheck: { deviceId: 'orange-pi-01', title: '장치 점검', sensors: [] },
    execution: {
      provenance: 'approved',
      profileVersion: '1.1.0',
      settlingSeconds: 0,
      conditions: [{ id: '20cm', label: '20 cm', repetitions: 1 }],
    },
  },
  execution: { cursor: null, attempts: [], pendingVoice: null },
  cleanup: { attempts: [], checks, deviceReleasedAt: null },
  submission: { status: 'not_submitted', resultId: null, submittedAt: null },
};

const passedAttempt = {
  attemptId: 'cleanup-1',
  status: 'passed',
  requestedAt: now,
  completedAt: now,
  validUntil: '2026-11-24T05:00:30.000Z',
  bootId: 'boot-1',
  response: { success: true, state: 'off', dataOrigin: 'simulation' },
  evidenceId: 'output-1',
  issue: null,
};
const readyToSubmit = {
  ...awaitingCleanup,
  phase: 'readyToSubmit',
  revision: 22,
  cleanup: {
    attempts: [passedAttempt],
    deviceReleasedAt: now,
    checks: checks.map(({ id }) => ({ id, checked: true, confirmedAt: now, evidenceId: id })),
  },
};
const submitted = {
  ...readyToSubmit,
  phase: 'completed',
  revision: 23,
  submission: { status: 'submitted', sessionId, resultId: sessionId, submittedAt: now },
  submittedAt: now,
  resultId: sessionId,
};

function response(status: number, body: unknown, replay: string | null = null) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    headers: { get: () => replay },
  } as unknown as Response;
}

afterEach(() => {
  jest.restoreAllMocks();
});

test('새 세션은 2.0으로 생성하고 이미 완료된 1.0 세션도 읽는다', async () => {
  const created = {
    ...awaitingCleanup,
    phase: 'preparing',
    revision: 0,
    execution: undefined,
    measurementCompletedAt: undefined,
  };
  const fetch = jest.spyOn(global, 'fetch').mockResolvedValue(response(201, created));
  const repository = new EdgeWorkflowRepository(createEdgeSessionRequest('http://localhost:8000'));

  await expect(
    repository.startApprovedSession({ procedureId: 'kit-distance', procedureVersion: '1.1.0' }),
  ).resolves.toMatchObject({ sessionId, workflowVersion: '2.0' });

  const request = fetch.mock.calls[0][1];
  const body = JSON.parse(String(request?.body));
  expect(body).toMatchObject({ workflowVersion: '2.0', procedureVersion: '1.1.0' });
  expect(request?.headers).toMatchObject({ 'Idempotency-Key': body.requestId });
  expect(
    parseEdgeSession({
      ...awaitingCleanup,
      workflowVersion: '1.0',
      phase: 'completed',
      cleanup: null,
      submission: null,
      measurementCompletedAt: null,
    }),
  ).toMatchObject({ sessionId, phase: 'completed' });
});

test('회차 완료의 423 응답에서 저장된 마지막 측정과 출력 종료 실패를 같은 세션으로 읽는다', async () => {
  const cursor = {
    cursorId: 'cursor-1',
    stepId: 'measure:20cm',
    conditionId: '20cm',
    trialIndex: 1,
  };
  const failedOutput = {
    ...awaitingCleanup,
    cleanup: {
      ...awaitingCleanup.cleanup,
      attempts: [
        {
          ...passedAttempt,
          status: 'failed',
          response: { success: false, state: 'unknown', dataOrigin: 'simulation' },
          issue: { code: 'CLEANUP_OUTPUT_FAILED', message: '출력을 확인하지 못했습니다.' },
        },
      ],
    },
    execution: {
      ...awaitingCleanup.execution,
      attempts: [
        {
          attemptId: 'sample-1',
          status: 'valid',
          cursor,
          requestedAt: now,
          receivedAt: now,
          confirmedAt: now,
          report: {
            attemptId: 'sample-1',
            cursorId: cursor.cursorId,
            source: 'api',
            stability: 'stable',
            diagnostics: { deviceId: 'orange-pi-01', checkedAt: now, source: 'api', sensors: [] },
          },
        },
      ],
    },
  };
  jest.spyOn(global, 'fetch').mockResolvedValue(
    response(423, {
      error: {
        code: 'CLEANUP_OUTPUT_FAILED',
        message: '측정은 저장됐지만 출력 종료에 실패했습니다.',
      },
      session: failedOutput,
    }),
  );
  const repository = new EdgeWorkflowRepository(createEdgeSessionRequest('http://localhost:8000'));

  await expect(
    repository.executeCommand(
      sessionId,
      { type: 'completeExecutionStep', cursorId: cursor.cursorId, sampleAttemptId: 'sample-1' },
      { requestId: 'complete-1', expectedRevision: 17 },
    ),
  ).rejects.toMatchObject({ code: 'CLEANUP_OUTPUT_FAILED', session: failedOutput });
});

test('Edge S12는 요약이 1/1이어도 현재 세션에 해당 회차의 수락 근거가 생길 때까지 정리를 열지 않는다', async () => {
  const cursor = {
    cursorId: 'cursor-1',
    stepId: 'distance-measurement',
    conditionId: '20cm',
    trialIndex: 1,
  };
  const attempt = {
    attemptId: 'sample-1',
    cursor,
    status: 'valid',
    requestedAt: now,
    receivedAt: now,
    confirmedAt: now,
    report: {
      attemptId: 'sample-1',
      cursorId: cursor.cursorId,
      source: 'api',
      stability: 'stable',
      diagnostics: { deviceId: 'orange-pi-01', checkedAt: now, source: 'api', sensors: [] },
    },
  };
  const before = parseEdgeSession({
    ...awaitingCleanup,
    execution: { ...awaitingCleanup.execution, attempts: [attempt] },
  });
  const accepted = parseEdgeSession({
    ...before,
    revision: before.revision + 1,
    evidence: [
      {
        evidenceId: 'accepted-1',
        sessionId,
        kind: 'sensor',
        actorId: 'edge-service',
        action: 'measurementAccepted',
        recordedAt: now,
        source: 'api',
        attemptId: attempt.attemptId,
        cursor,
      },
    ],
  });
  jest.mocked(loadEdgeResult).mockResolvedValue({
    result: {
      id: sessionId,
      sessionId,
      procedureId: 'kit-distance',
      procedureTitle: '키트 거리 확인',
      approvedVersion: '1.1.0',
      studentName: 'operator-01',
      deviceName: 'orange-pi-01',
      submittedLabel: '',
      status: 'pending',
      comment: '',
      validCount: 1,
      totalCount: 1,
      unresolvedCount: 0,
      remeasurementCount: 0,
      unit: 'cm',
      conditions: [
        { id: '20cm', label: '20 cm', value: 20, validCount: 1, totalCount: 1, invalidCount: 0 },
      ],
    },
    evidenceByCondition: new Map(),
  });
  let publish: Parameters<WorkflowRepository['subscribe']>[1] = () => {};
  const repository: WorkflowRepository = {
    getSession: jest.fn<WorkflowRepository['getSession']>().mockResolvedValue(before),
    createSession: jest.fn<WorkflowRepository['createSession']>(),
    executeCommand: jest.fn<WorkflowRepository['executeCommand']>(),
    subscribe: (_, listener) => {
      publish = listener;
      return () => {};
    },
  };
  const screen = await render(
    <WorkflowProvider repository={repository}>
      <EdgeCompletionScreen sessionId={sessionId} stage="review" />
    </WorkflowProvider>,
  );
  await screen.findByText('유효 측정 1 / 1');
  expect(screen.getByText('20 cm 조건 1회차를 확인해 주세요')).toBeTruthy();
  expect(screen.queryByRole('button', { name: '장치 정리로 이동' })).toBeNull();

  await act(async () => publish(accepted));

  expect(await screen.findByRole('button', { name: '장치 정리로 이동' })).toBeEnabled();
  expect(screen.queryByText('20 cm 조건 1회차를 확인해 주세요')).toBeNull();
});

test('제출 응답을 받지 못하면 명시적 재시도 때만 동일 키와 본문을 보낸다', async () => {
  const fetch = jest
    .spyOn(global, 'fetch')
    .mockRejectedValueOnce(new TypeError('연결 종료'))
    .mockResolvedValueOnce(response(200, submitted, 'true'))
    .mockResolvedValueOnce(response(200, submitted));
  const repository = new EdgeWorkflowRepository(createEdgeSessionRequest('http://localhost:8000'));
  const execute = () =>
    repository.executeCommand(
      sessionId,
      { type: 'submitResult' },
      { requestId: 'same-id', expectedRevision: 22 },
    );

  await expect(execute()).rejects.toMatchObject({ code: 'OUTCOME_UNKNOWN' });
  expect(fetch).toHaveBeenCalledTimes(1);
  await expect(execute()).resolves.toMatchObject({ resultId: sessionId, revision: 23 });
  const [first, retry, refresh] = fetch.mock.calls.map(([, options]) => options);
  expect(retry?.body).toBe(first?.body);
  expect(retry?.headers).toEqual(first?.headers);
  expect(refresh?.method).toBe('GET');
});

test('서버가 제출했다고 보고해도 응답을 유실한 화면은 요청 재시도를 유지한다', async () => {
  const ready = parseEdgeSession(readyToSubmit);
  const completed = parseEdgeSession(submitted);
  let publish: Parameters<WorkflowRepository['subscribe']>[1] = () => {};
  const repository: WorkflowRepository = {
    getSession: jest.fn<WorkflowRepository['getSession']>().mockResolvedValue(ready),
    createSession: jest.fn<WorkflowRepository['createSession']>(),
    executeCommand: jest
      .fn<WorkflowRepository['executeCommand']>()
      .mockImplementationOnce(async () => {
        publish(completed);
        throw new WorkflowError('OUTCOME_UNKNOWN', '응답을 확인하지 못했어요.');
      })
      .mockResolvedValueOnce(completed),
    subscribe: (_, listener) => {
      publish = listener;
      return () => {};
    },
  };
  const { result } = await renderHook(() => useWorkflowSession(sessionId), {
    wrapper: ({ children }) => (
      <WorkflowProvider repository={repository}>{children}</WorkflowProvider>
    ),
  });
  await waitFor(() => expect(result.current.session?.phase).toBe('readyToSubmit'));
  await act(async () => {
    await result.current.execute({ type: 'submitResult' });
    publish(completed);
  });

  expect(result.current.session?.phase).toBe('readyToSubmit');
  expect(result.current.errorCode).toBe('OUTCOME_UNKNOWN');
  expect(result.current.canRetryCommand).toBe(true);

  await act(async () => {
    await result.current.retryCommand();
  });

  expect(result.current.session?.submission).toMatchObject({ resultId: sessionId });
  expect(result.current.canRetryCommand).toBe(false);
  const [first, retry] = jest.mocked(repository.executeCommand).mock.calls;
  expect(retry).toEqual(first);
});

test('2.0 완료 응답의 제출 결과가 현재 세션을 가리키지 않으면 거부한다', () => {
  expect(() => parseEdgeSession({ ...submitted, resultId: 'other-session' })).toThrow(
    'Edge 세션 응답 형식을 확인해 주세요.',
  );
});
