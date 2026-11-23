import { describe, expect, jest, test } from '@jest/globals';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { loadWorkEnvironments } from '../src/features/entry/entryEnvironment';
import { createDemoProcedureRepository } from '../src/features/procedures/procedureRepository';
import type { ProcedureDetail } from '../src/features/procedures/procedureModels';
import { createApprovedMockSessionStarter } from '../src/features/researcher-workflow/infrastructure/mock/start-approved-mock-session';
import { MockWorkflowRepository } from '../src/features/researcher-workflow/infrastructure/mock/MockWorkflowRepository';
import { mockProcedure } from '../src/features/researcher-workflow/infrastructure/mock/fixtures';
import { buildMockDiagnostics } from '../src/features/researcher-workflow/infrastructure/mock/device-check-scenarios';
import { buildMockExecutionReport } from '../src/features/researcher-workflow/infrastructure/mock/execution-scenarios';
import {
  buildMockCleanupReport,
  buildMockSubmissionReport,
} from '../src/features/researcher-workflow/infrastructure/mock/completion-scenarios';
import { selectExecution } from '../src/features/researcher-workflow/domain/execution';
import { selectResult } from '../src/features/researcher-workflow/domain/completion';
import type { WorkflowCommand } from '../src/features/researcher-workflow/domain/models';
import { WorkflowProvider } from '../src/features/researcher-workflow/state/WorkflowProvider';
import {
  startApprovedMockSession,
  workflowQueries,
} from '../src/features/researcher-workflow/state/workflow-repository';
import { PreparationScreen } from '../src/features/researcher-workflow/screens/PreparationScreen';
import { ResultSummaryScreen } from '../src/features/researcher-workflow/screens/ResultSummaryScreen';
import { procedureVersionLabel } from '../src/features/researcher-workflow/screens/procedure-version-label';

async function setup() {
  const environment = (await loadWorkEnvironments())[0];
  const input = {
    request: { procedureId: 'demo-led-characteristics', approvedVersion: 'v1.2', environment },
    requestId: 'approved-start',
    operatorId: 'mock-operator',
  };
  const procedures = createDemoProcedureRepository();
  const repository = new MockWorkflowRepository({
    now: () => '2026-11-20T00:00:00.000Z',
    inspect: async (input) => buildMockDiagnostics(input),
    sample: async (input) => buildMockExecutionReport(input),
    cleanup: async (input) => buildMockCleanupReport(input),
    submit: async (input) => buildMockSubmissionReport(input),
  });
  const create = jest.spyOn(repository, 'createSession');
  const start = createApprovedMockSessionStarter(repository, procedures);
  return { input, procedures, repository, create, start };
}

describe('승인 LED 절차와 신규 Mock 세션 연결', () => {
  test('카탈로그 ID·승인 버전·제목과 조건을 보존하고 기존 실행 정의와 새 0/6 상태를 사용한다', async () => {
    const f = await setup();
    const old = await Promise.all(
      ['demo-session-led-m03', 'demo-session-led-m02'].map((id) => f.repository.getSession(id)),
    );
    const detail = (await f.procedures.getDetail({
      procedureId: f.input.request.procedureId,
      approvedVersion: 'v1.2',
      environmentId: f.input.request.environment.id,
    }))!;
    const original = JSON.stringify({ detail, mockProcedure });
    const session = await f.start(f.input);
    expect(session).toMatchObject({
      phase: 'preparing',
      revision: 0,
      evidence: [],
      deviceChecks: [],
      procedure: {
        procedureId: detail.id,
        version: detail.approvedVersion,
        title: detail.title,
        deviceId: detail.code,
        preparation: mockProcedure.preparation,
        deviceCheck: mockProcedure.deviceCheck,
        execution: {
          profileVersion: 'led-draft-1',
          settlingSeconds: mockProcedure.execution!.settlingSeconds,
        },
      },
    });
    expect(session.sessionId).toMatch(/^mock-session-/);
    expect(session.checks).toHaveLength(6);
    expect(session.checks.every((check) => !check.checked)).toBe(true);
    expect(
      session.procedure.execution!.conditions.map(({ label, repetitions }) => ({
        label,
        repetitions,
      })),
    ).toEqual(detail.conditions);
    expect(session.procedure.execution!.conditions.map(({ id }) => id)).toEqual(
      mockProcedure.execution!.conditions.map(({ id }) => id),
    );
    expect(JSON.stringify({ detail, mockProcedure })).toBe(original);
    expect(
      await Promise.all(old.map((session) => f.repository.getSession(session.sessionId))),
    ).toEqual(old);
    (session.procedure as { version: string }).version = 'changed';
    expect((await f.repository.getSession(session.sessionId)).procedure.version).toBe('v1.2');
  });

  test('동일 요청·동시 재시도는 같은 세션, 새 요청은 새 세션이며 요청 ID 충돌은 거절한다', async () => {
    const f = await setup();
    const [first, retry] = await Promise.all([f.start(f.input), f.start(f.input)]);
    expect(retry).toEqual(first);
    expect(await f.start(f.input)).toEqual(first);
    const next = await f.start({ ...f.input, requestId: 'next-start' });
    expect(next.sessionId).not.toBe(first.sessionId);
    await expect(f.start({ ...f.input, operatorId: 'different-operator' })).rejects.toMatchObject({
      code: 'REQUEST_CONFLICT',
    });
    expect(await f.repository.getSession(first.sessionId)).toEqual(first);
  });

  test.each([
    { procedureId: 'demo-i2c-address-check', approvedVersion: 'v1.0' },
    { procedureId: 'unknown' },
    { approvedVersion: 'v1.3' },
    { approvedVersion: '1.2' },
    { environmentId: 'demo-circuits' },
    { environmentId: 'unknown-environment' },
  ])('미지원 선택 %j에서는 세션을 만들지 않는다', async (selection) => {
    const f = await setup();
    await expect(
      f.start({
        ...f.input,
        request: {
          ...f.input.request,
          ...selection,
          environment: {
            ...f.input.request.environment,
            id: selection.environmentId ?? f.input.request.environment.id,
          },
        },
      }),
    ).rejects.toMatchObject({ code: 'INVALID_PROCEDURE' });
    expect(f.create).not.toHaveBeenCalled();
  });

  test.each(['missing', 'version', 'id', 'conditions', 'equipment', 'code'] as const)(
    '승인 재확인 %s 불일치는 기존 LED 정의로 대체하지 않는다',
    async (fault) => {
      const f = await setup();
      const detail = (await f.procedures.getDetail({
        procedureId: f.input.request.procedureId,
        approvedVersion: 'v1.2',
        environmentId: f.input.request.environment.id,
      }))!;
      const changed: ProcedureDetail = {
        ...detail,
        ...(fault === 'version' ? { approvedVersion: 'v1.3' } : {}),
        ...(fault === 'id' ? { id: 'different-procedure' } : {}),
        ...(fault === 'conditions' ? { conditions: [{ label: '0%', repetitions: 1 }] } : {}),
        ...(fault === 'equipment' ? { equipment: [] } : {}),
        ...(fault === 'code' ? { code: 'LED-M99' } : {}),
      };
      const start = createApprovedMockSessionStarter(f.repository, {
        getDetail: async () => (fault === 'missing' ? null : changed),
      });
      await expect(start(f.input)).rejects.toMatchObject({ code: 'INVALID_PROCEDURE' });
      expect(f.create).not.toHaveBeenCalled();
    },
  );

  test.each(['requestId', 'operatorId'] as const)(
    '%s가 비어 있으면 생성하지 않는다',
    async (key) => {
      const f = await setup();
      await expect(f.start({ ...f.input, [key]: ' ' })).rejects.toMatchObject({
        code: 'INVALID_STATE',
      });
      expect(f.create).not.toHaveBeenCalled();
    },
  );

  test('공개 생성 함수는 기존 공통 Repository와 같은 세션을 조회한다', async () => {
    const f = await setup();
    const created = await startApprovedMockSession(f.input);
    expect(await workflowQueries.getSessionSummary(created.sessionId)).toMatchObject({
      sessionId: created.sessionId,
      phase: 'preparing',
      procedureVersion: 'v1.2',
      resultId: null,
    });
  });

  test('승인 v1.2를 유지한 채 기존 준비·측정·정리·제출을 수행하고 버전 접두사를 중복 표시하지 않는다', async () => {
    const f = await setup();
    let session = await f.start(f.input);
    const screen = await render(
      <WorkflowProvider repository={f.repository}>
        <PreparationScreen
          sessionId={session.sessionId}
          onBack={() => {}}
          onDeviceCheck={() => {}}
        />
      </WorkflowProvider>,
    );
    await screen.findByText('준비 진행도 · 0 / 6 항목 완료');
    await fireEvent.press(screen.getByRole('button', { name: '더 보기' }));
    await screen.findByText(`${session.procedure.title} · v1.2`);
    await screen.unmount();
    let count = 0;
    const send = async (command: WorkflowCommand) => {
      session = await f.repository.getSession(session.sessionId);
      session = await f.repository.executeCommand(session.sessionId, command, {
        requestId: `flow-${count++}`,
        expectedRevision: session.revision,
      });
    };
    const settle = async () => {
      await waitFor(async () => {
        session = await f.repository.getSession(session.sessionId);
        expect(session.deviceChecks.at(-1)?.status).not.toBe('checking');
        expect(selectExecution(session).sampling).toBe(false);
        expect(session.completion?.cleanupAttempts.at(-1)?.status).not.toBe('pending');
        expect(session.completion?.submissions.at(-1)?.status).not.toBe('pending');
      });
    };
    for (const check of session.procedure.preparation.filter((item) => item.owner === 'operator'))
      await send({ type: 'setPreparationCheck', checkId: check.id, checked: true });
    await send({ type: 'completePreparation' });
    await send({ type: 'startDeviceCheck' });
    await settle();
    await send({ type: 'startExecution' });
    while (session.execution!.cursor) {
      const cursorId = session.execution!.cursor.cursorId;
      await send({ type: 'requestExecutionSample', cursorId });
      await settle();
      await send({
        type: 'completeExecutionStep',
        cursorId,
        sampleAttemptId: selectExecution(session).latest!.attemptId,
      });
    }
    await send({ type: 'startCleanup' });
    await settle();
    for (const checkId of ['powerOff', 'cables', 'storage'] as const)
      await send({ type: 'setCleanupCheck', checkId, checked: true });
    await send({ type: 'finishExperiment' });
    expect(session.completion!.resultId).toMatch(/^mock-result-/);
    await send({ type: 'submitMockResult' });
    await settle();
    expect(selectResult(session)).toMatchObject({ submitted: true, review: { validCount: 15 } });
    expect(session.procedure).toMatchObject({
      procedureId: 'demo-led-characteristics',
      version: 'v1.2',
    });
    const result = await render(
      <WorkflowProvider repository={f.repository}>
        <ResultSummaryScreen sessionId={session.sessionId} onHome={() => {}} onDetails={() => {}} />
      </WorkflowProvider>,
    );
    await result.findByText(
      `${session.operatorId} · LED-M03 · v1.2\n숙련자의 최종 검토를 기다립니다.`,
    );
    expect(procedureVersionLabel('1.2')).toBe('v1.2');
    expect(procedureVersionLabel('v1.2')).toBe('v1.2');
  });
});
