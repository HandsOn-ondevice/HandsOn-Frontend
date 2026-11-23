import { describe, expect, jest, test } from '@jest/globals';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';
import ResultsRoute from '../src/app/researcher-workflow/[sessionId]/results';
import MeasurementDetailsRoute from '../src/app/researcher-workflow/[sessionId]/measurement-details';
import { WorkflowProvider } from '../src/features/researcher-workflow/state/WorkflowProvider';
import { createWorkflowQueries } from '../src/features/researcher-workflow/application/workflow-queries';
import {
  MockWorkflowRepository,
  type MockDependencies,
} from '../src/features/researcher-workflow/infrastructure/mock/MockWorkflowRepository';
import { mockProcedure } from '../src/features/researcher-workflow/infrastructure/mock/fixtures';
import {
  acceptedMeasurement,
  conditionAverages,
  selectResult,
} from '../src/features/researcher-workflow/domain/completion';

jest.mock('expo-router', () => ({
  useLocalSearchParams: jest.fn(),
  Redirect: () => null,
  router: { push: jest.fn(), replace: jest.fn(), dismissTo: jest.fn() },
}));

const sessionId = 'demo-session-led-m02';
const resultId = 'demo-result-led-m02';

describe('LED-M02 초기 완료·제출 Mock 기록', () => {
  test('실제 완료·정리·제출 근거와 조건별 유효 3회, 무효·복구·재측정을 보존한다', async () => {
    const repository = new MockWorkflowRepository();
    const session = await repository.getSession(sessionId);
    const result = selectResult(session);
    expect(session).toMatchObject({
      sessionId,
      source: 'mock',
      phase: 'submitted',
      procedure: {
        title: 'LED-M02 특성 측정',
        deviceId: 'LED-M02',
        version: '1.2',
        approval: 'approved',
      },
      execution: { cursor: null },
      completion: { resultId },
    });
    expect(result).toMatchObject({
      available: true,
      finished: true,
      submitted: true,
      canSubmit: false,
      review: { allValid: true, validCount: 15, required: 15 },
    });
    expect(result.submission!.report).toMatchObject({
      sessionId,
      resultId,
      source: 'mock',
      destination: 'mock-review-queue',
      persistent: false,
    });
    for (const condition of session.procedure.execution!.conditions) {
      const valid = session.execution!.attempts.filter(
        (attempt) =>
          attempt.cursor.conditionId === condition.id && acceptedMeasurement(session, attempt),
      );
      expect(valid.map((attempt) => attempt.cursor.trialIndex)).toEqual([1, 2, 3]);
      expect(conditionAverages(session, condition.id)).toMatchObject({
        voltage: 5.01,
        current: 83,
        power: 416,
      });
    }
    const failed = session.execution!.attempts.find((attempt) => attempt.status === 'held')!;
    const recovery = session.execution!.recoveries![0];
    const remeasurement = session.execution!.attempts.find(
      (attempt) => attempt.purpose === 'remeasurement',
    )!;
    expect(failed.cursor).toMatchObject({ conditionId: 'output-50', trialIndex: 2 });
    expect(acceptedMeasurement(session, failed)).toBe(false);
    expect(recovery).toMatchObject({
      blockedAttemptId: failed.attemptId,
      cursor: failed.cursor,
      status: 'recovered',
    });
    expect(remeasurement).toMatchObject({
      cursor: failed.cursor,
      recoveryId: recovery.recoveryId,
      status: 'valid',
    });
    expect(session.events.map((event) => event.type)).toEqual(
      expect.arrayContaining([
        'executionSampleRejected',
        'recoveryRequested',
        'recoverySucceeded',
        'cleanupOutputConfirmed',
        'experimentFinished',
        'mockResultSubmitted',
      ]),
    );
    expect(
      session.evidence.every((item) => item.sessionId === sessionId && item.source === 'mock'),
    ).toBe(true);
    expect(
      selectResult({
        ...session,
        events: session.events.filter((event) => event.type !== 'experimentFinished'),
      }).available,
    ).toBe(false);
    expect(
      selectResult({ ...session, completion: { ...session.completion!, checks: [] } }).available,
    ).toBe(false);
    expect(
      selectResult({
        ...session,
        evidence: session.evidence.filter((item) => item.action !== 'measurementConfirmed'),
      }).available,
    ).toBe(false);
  });

  test('조회·재생성은 읽기 전용이며 잘못된 ID와 다른 세션의 결과는 거절한다', async () => {
    const repository = new MockWorkflowRepository();
    const queries = createWorkflowQueries(repository);
    const before = await repository.getSession(sessionId);
    const commands = jest.spyOn(repository, 'executeCommand');
    expect(await queries.getSessionSummary(sessionId)).toMatchObject({
      sessionId,
      resultId,
      phase: 'submitted',
      cursor: null,
      progress: { validMeasurements: 15, totalMeasurements: 15, percentage: 100 },
    });
    expect(await queries.getResult(sessionId, resultId)).toEqual(before);
    for (const [sid, rid] of [
      [sessionId, 'missing-result'],
      ['missing-session', resultId],
      ['demo-session-led-m03', resultId],
      [sessionId, 'mock-result-demo-result-led-m02'],
    ])
      await expect(queries.getResult(sid, rid)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const snapshot = await queries.getResult(sessionId, resultId);
    (snapshot as { phase: string }).phase = 'preparing';
    expect(await repository.getSession(sessionId)).toEqual(before);
    expect(await new MockWorkflowRepository().getSession(sessionId)).toEqual(before);
    expect(commands).not.toHaveBeenCalled();
    const repeated = await repository.executeCommand(
      sessionId,
      { type: 'submitMockResult' },
      {
        requestId: 'repeat-demo-submit',
        expectedRevision: before.revision,
      },
    );
    expect(repeated).toEqual(before);
  });

  test('초기 데모 구성은 주입된 시계·ID·runner 및 M03와 새 세션의 초기 상태를 변경하지 않는다', async () => {
    const now = jest.fn(() => '2026-11-20T00:00:00.000Z');
    const id = jest.fn(() => 'new-id');
    const inspect = jest.fn<NonNullable<MockDependencies['inspect']>>();
    const repository = new MockWorkflowRepository({ now, id, inspect });
    expect(now).not.toHaveBeenCalled();
    expect(id).not.toHaveBeenCalled();
    expect(inspect).not.toHaveBeenCalled();
    expect(await repository.getSession('demo-session-led-m03')).toMatchObject({
      phase: 'preparing',
      revision: 0,
      evidence: [],
      deviceChecks: [],
    });
    const created = await repository.createSession({
      requestId: 'new-session',
      operatorId: 'new-operator',
      procedure: mockProcedure,
    });
    expect(created).toMatchObject({
      sessionId: 'mock-session-new-id',
      phase: 'preparing',
      revision: 0,
      evidence: [],
      deviceChecks: [],
    });
    expect(created.execution).toBeUndefined();
    expect(created.completion).toBeUndefined();
  });

  test('실제 S14·S15 라우트에서 동일 ID와 모든 조건의 측정값·무효 이력을 읽기 전용으로 표시한다', async () => {
    const repository = new MockWorkflowRepository();
    const before = await repository.getSession(sessionId);
    const commands = jest.spyOn(repository, 'executeCommand');
    jest.mocked(router.push).mockClear();
    jest.mocked(router.dismissTo).mockClear();
    jest.mocked(useLocalSearchParams).mockReturnValue({ sessionId, resultId, view: 'summary' });
    const screen = await render(
      <WorkflowProvider repository={repository}>
        <ResultsRoute />
      </WorkflowProvider>,
    );
    await screen.findByText('제출 완료 · 읽기 전용');
    expect(screen.getByText('조건별 측정 · 15 / 15')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '숙련자에게 제출' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: '50% 조건 상세 보기' }));
    expect(jest.mocked(router.push).mock.calls).toEqual([
      [
        {
          pathname: '/researcher-workflow/[sessionId]/measurement-details',
          params: { sessionId, conditionId: 'output-50', resultId },
        },
      ],
    ]);
    for (const [conditionId, value] of [
      ['output-0', '18.4'],
      ['output-25', '210.0'],
      ['output-50', '420.0'],
      ['output-75', '610.0'],
      ['output-100', '810.0'],
    ]) {
      jest.mocked(useLocalSearchParams).mockReturnValue({ sessionId, resultId, conditionId });
      await screen.rerender(
        <WorkflowProvider repository={repository}>
          <MeasurementDetailsRoute />
        </WorkflowProvider>,
      );
      await screen.findByText(`${value} lx`);
      await screen.findByText(`유효 3건 · 무효 ${conditionId === 'output-50' ? 1 : 0}건`);
      if (conditionId === 'output-50') {
        expect(screen.getByText(/2회차 재측정 · 유효/)).toBeTruthy();
        expect(screen.getByText('2회차 · 무효 · 420 lx')).toBeTruthy();
      }
    }
    await fireEvent.press(screen.getByRole('button', { name: '전체 결과로 돌아가기' }));
    expect(jest.mocked(router.dismissTo).mock.calls).toEqual([
      [
        {
          pathname: '/researcher-workflow/[sessionId]/results',
          params: { sessionId, resultId, view: 'summary' },
        },
      ],
    ]);
    for (const Route of [ResultsRoute, MeasurementDetailsRoute]) {
      jest.mocked(useLocalSearchParams).mockReturnValue({
        sessionId,
        resultId: 'missing-result',
        conditionId: 'output-50',
        view: 'summary',
      });
      await screen.rerender(
        <WorkflowProvider repository={repository}>
          <Route />
        </WorkflowProvider>,
      );
      await waitFor(() => expect(screen.getByText('결과를 찾을 수 없습니다')).toBeTruthy());
    }
    expect(commands).not.toHaveBeenCalled();
    expect(await repository.getSession(sessionId)).toEqual(before);
  });
});
