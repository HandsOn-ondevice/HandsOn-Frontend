import { describe, expect, jest, test } from '@jest/globals';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { MockWorkflowRepository } from '../src/features/researcher-workflow/infrastructure/mock/MockWorkflowRepository';
import { buildMockDiagnostics } from '../src/features/researcher-workflow/infrastructure/mock/device-check-scenarios';
import {
  buildMockExecutionReport,
  type MockExecutionRunner,
  type MockExecutionScenario,
} from '../src/features/researcher-workflow/infrastructure/mock/execution-scenarios';
import { mockProcedure } from '../src/features/researcher-workflow/infrastructure/mock/fixtures';
import {
  selectExecution,
  type ExecutionSampleReport,
} from '../src/features/researcher-workflow/domain/execution';
import { selectRemeasurement } from '../src/features/researcher-workflow/domain/remeasurement';
import { selectRecovery } from '../src/features/researcher-workflow/domain/recovery';
import type {
  ExperimentSession,
  WorkflowCommand,
} from '../src/features/researcher-workflow/domain/models';
import { finishExecutionSample } from '../src/features/researcher-workflow/infrastructure/mock/execution-transitions';
import { WorkflowProvider } from '../src/features/researcher-workflow/state/WorkflowProvider';
import { RemeasurementScreen } from '../src/features/researcher-workflow/screens/RemeasurementScreen';
import { RecoveryScreen } from '../src/features/researcher-workflow/screens/RecoveryScreen';

const now = () => '2026-11-08T12:00:00.000Z';
async function send(
  repo: MockWorkflowRepository,
  session: ExperimentSession,
  command: WorkflowCommand,
  requestId = `r-${session.revision}`,
) {
  return repo.executeCommand(session.sessionId, command, {
    requestId,
    expectedRevision: session.revision,
  });
}
async function settled(repo: MockWorkflowRepository, session: ExperimentSession) {
  await waitFor(async () =>
    expect(selectExecution(await repo.getSession(session.sessionId)).sampling).toBe(false),
  );
  return repo.getSession(session.sessionId);
}
function retry(session: ExperimentSession): WorkflowCommand {
  const state = selectRemeasurement(session);
  return {
    type: 'requestRecoveryRemeasurement',
    cursorId: state.cursor!.cursorId,
    recoveryId: state.recovery!.recoveryId,
  };
}
function recover(session: ExperimentSession): WorkflowCommand {
  const state = selectRecovery(session);
  return {
    type: 'requestRecovery',
    cursorId: state.cursor!.cursorId,
    blockedAttemptId: state.blocked!.attemptId,
  };
}
async function setup(
  sample: MockExecutionRunner = async (input) => buildMockExecutionReport(input),
  procedure = mockProcedure,
) {
  const repo = new MockWorkflowRepository({
    now,
    sample,
    inspect: async (input) => buildMockDiagnostics(input),
  });
  let session = await repo.createSession({
    requestId: 'create',
    operatorId: 'researcher',
    procedure,
  });
  const preparing = session;
  for (const item of procedure.preparation.filter((item) => item.owner === 'operator'))
    session = await send(repo, session, {
      type: 'setPreparationCheck',
      checkId: item.id,
      checked: true,
    });
  session = await send(repo, session, { type: 'completePreparation' });
  await send(repo, session, { type: 'startDeviceCheck' });
  await waitFor(async () =>
    expect((await repo.getSession(session.sessionId)).phase).toBe('readyToExecute'),
  );
  session = await send(repo, await repo.getSession(session.sessionId), { type: 'startExecution' });
  const running = session;
  await send(repo, session, {
    type: 'requestExecutionSample',
    cursorId: session.execution!.cursor!.cursorId,
  });
  session = await settled(repo, session);
  // 정상 S06 완료는 기존과 동일하다.
  expect(selectExecution(session).canComplete).toBe(true);
  session = await send(repo, session, {
    type: 'completeExecutionStep',
    cursorId: session.execution!.cursor!.cursorId,
    sampleAttemptId: selectExecution(session).latest!.attemptId,
  });
  session = await send(repo, session, {
    type: 'requestVoiceClarification',
    cursorId: session.execution!.cursor!.cursorId,
    utterance: '다시 해줘',
  });
  session = await send(repo, session, {
    type: 'dismissVoiceClarification',
    commandId: session.execution!.pendingVoice!.commandId,
  });
  repo.setExecutionScenario(session.sessionId, 'stale');
  await send(repo, session, {
    type: 'requestExecutionSample',
    cursorId: session.execution!.cursor!.cursorId,
  });
  const held = await settled(repo, session);
  repo.setExecutionScenario(session.sessionId, 'normal');
  await send(repo, held, recover(held));
  return { repo, session: await settled(repo, held), held, preparing, running };
}

describe('S09 복구 확인과 별도 재측정', () => {
  test('복구 확인값의 직접 완료·일반 측정·음성 우회를 차단하고 새 연결 시도만 완료한다', async () => {
    const { repo, session } = await setup();
    const state = selectRemeasurement(session);
    expect(state).toMatchObject({
      available: true,
      canRemeasure: true,
      canComplete: false,
      canSample: false,
      canClarify: false,
      completedCount: 1,
    });
    expect(state.probe?.purpose).toBe('recoveryCheck');
    for (const command of [
      {
        type: 'completeExecutionStep',
        cursorId: state.cursor!.cursorId,
        sampleAttemptId: state.probe!.attemptId,
      },
      { type: 'requestExecutionSample', cursorId: state.cursor!.cursorId },
      {
        type: 'requestVoiceClarification',
        cursorId: state.cursor!.cursorId,
        utterance: '다시 해줘',
      },
    ] as const)
      await expect(send(repo, session, command, `blocked-${command.type}`)).rejects.toMatchObject({
        code: 'INVALID_STATE',
      });
    expect(await repo.getSession(session.sessionId)).toEqual(session);
    const checking = await send(repo, session, retry(session));
    const attempt = selectExecution(checking).latest!;
    expect(attempt).toMatchObject({
      purpose: 'remeasurement',
      recoveryId: state.recovery!.recoveryId,
      cursor: session.execution!.cursor,
      status: 'sampling',
    });
    expect(attempt.attemptId).not.toBe(state.probe!.attemptId);
    expect(selectExecution(checking)).toMatchObject({ canComplete: false, completedCount: 1 });
    const measured = await settled(repo, checking);
    expect(selectExecution(measured)).toMatchObject({ canComplete: true, completedCount: 1 });
    const accepted = await send(repo, measured, {
      type: 'completeExecutionStep',
      cursorId: state.cursor!.cursorId,
      sampleAttemptId: attempt.attemptId,
    });
    expect(selectExecution(accepted).completedCount).toBe(2);
    expect(accepted.execution!.recoveries).toEqual(session.execution!.recoveries);
    expect(accepted.execution!.voiceResolutions).toEqual(session.execution!.voiceResolutions);
    expect(accepted.procedure).toEqual(session.procedure);
    expect(accepted.evidence.slice(0, session.evidence.length)).toEqual(session.evidence);
    expect(accepted.events.slice(0, session.events.length)).toEqual(session.events);
    expect(accepted.execution!.attempts[0]).toEqual(session.execution!.attempts[0]);
    expect(
      accepted.execution!.attempts.find((a) => a.attemptId === state.probe!.attemptId)?.report,
    ).toEqual(state.probe!.report);
    const duplicate = await send(
      repo,
      accepted,
      {
        type: 'completeExecutionStep',
        cursorId: state.cursor!.cursorId,
        sampleAttemptId: attempt.attemptId,
      },
      'duplicate-complete',
    );
    expect(duplicate).toEqual(accepted);
    expect(selectRemeasurement(accepted).available).toBe(false);
  });

  test('중복 클릭의 다른 요청 ID·오래된 revision·다른 커서·복구·없는 세션을 거절한다', async () => {
    let delay = false;
    let resolve!: (r: ExecutionSampleReport) => void;
    let input!: Parameters<MockExecutionRunner>[0];
    const { repo, session } = await setup(async (value) => {
      if (delay) {
        input = value;
        return new Promise((done) => {
          resolve = done;
        });
      }
      return buildMockExecutionReport(value);
    });
    const command = retry(session);
    for (const wrong of [
      { ...command, cursorId: 'other' },
      { ...command, recoveryId: 'other' },
    ])
      await expect(
        send(repo, session, wrong as WorkflowCommand, JSON.stringify(wrong)),
      ).rejects.toMatchObject({ code: 'INVALID_STATE' });
    await expect(
      repo.executeCommand('missing', command, { requestId: 'missing', expectedRevision: 0 }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    delay = true;
    const checking = await send(repo, session, command, 'once');
    expect(await send(repo, session, command, 'once')).toEqual(checking);
    await expect(send(repo, checking, command, 'second')).rejects.toMatchObject({
      code: 'INVALID_STATE',
    });
    await expect(send(repo, session, command, 'stale')).rejects.toMatchObject({
      code: 'REVISION_CONFLICT',
    });
    await expect(
      send(
        repo,
        checking,
        { type: 'requestExecutionSample', cursorId: checking.execution!.cursor!.cursorId },
        'once',
      ),
    ).rejects.toMatchObject({ code: 'REQUEST_CONFLICT' });
    resolve(buildMockExecutionReport(input));
    const measured = await settled(repo, checking);
    expect(await send(repo, session, command, 'once')).toEqual(measured);
    await expect(send(repo, measured, command, 'again')).rejects.toMatchObject({
      code: 'INVALID_STATE',
    });
    const probe = selectRemeasurement(session).probe!;
    expect(
      finishExecutionSample(measured, probe.attemptId, probe.report!, {
        now: now(),
        requestId: 'late',
        eventId: 'late',
        evidenceId: 'late',
      }),
    ).toBe(measured);
    expect(measured.execution!.attempts).toHaveLength(session.execution!.attempts.length + 1);
  });

  test.each(['attempt', 'cursor', 'oldTime', 'futureTime', 'unit', 'source'])(
    '%s가 잘못된 새 재측정 응답은 정상 표시와 관계없이 완료를 차단한다',
    async (variant) => {
      let corrupt = false;
      const { repo, session } = await setup(async (input) => {
        const raw = JSON.parse(JSON.stringify(buildMockExecutionReport(input)));
        if (corrupt) {
          if (variant === 'attempt') raw.attemptId = 'previous-probe';
          if (variant === 'cursor') raw.cursorId = 'other-cursor';
          if (variant === 'oldTime')
            raw.diagnostics.sensors[0].readings[0].observedAt = new Date(
              Date.parse(now()) - 1,
            ).toISOString();
          if (variant === 'futureTime')
            raw.diagnostics.sensors[0].readings[0].observedAt = new Date(
              Date.parse(now()) + 1,
            ).toISOString();
          if (variant === 'unit') raw.diagnostics.sensors[0].readings[0].unit = 'wrong';
          if (variant === 'source') raw.source = 'api';
        }
        return raw;
      });
      corrupt = true;
      await send(repo, session, retry(session));
      const failed = await settled(repo, session);
      expect(selectExecution(failed)).toMatchObject({
        canComplete: false,
        requiresRecovery: true,
        completedCount: 1,
      });
      expect(failed.execution!.recoveries).toEqual(session.execution!.recoveries);
      expect(failed.events.slice(0, session.events.length)).toEqual(session.events);
    },
  );

  test.each<MockExecutionScenario>(['stale', 'error', 'noResponse', 'held'])(
    '%s 재실패 뒤 새 복구 기록으로 재시도하며 이전 이력을 보존한다',
    async (scenario) => {
      const { repo, session } = await setup();
      repo.setExecutionScenario(session.sessionId, scenario);
      await send(repo, session, retry(session));
      const failed = await settled(repo, session);
      expect(selectExecution(failed)).toMatchObject({
        requiresRecovery: true,
        canRecover: true,
        canComplete: false,
      });
      repo.setExecutionScenario(session.sessionId, 'normal');
      await send(repo, failed, recover(failed));
      const recoveredAgain = await settled(repo, failed);
      expect(selectRemeasurement(recoveredAgain).canRemeasure).toBe(true);
      expect(recoveredAgain.execution!.recoveries).toHaveLength(2);
      expect(recoveredAgain.execution!.recoveries![0]).toEqual(session.execution!.recoveries![0]);
      expect(recoveredAgain.execution!.recoveries![1].blockedAttemptId).toBe(
        failed.execution!.attempts.at(-1)!.attemptId,
      );
      expect(recoveredAgain.evidence.slice(0, failed.evidence.length)).toEqual(failed.evidence);
      expect(recoveredAgain.events.slice(0, failed.events.length)).toEqual(failed.events);
    },
  );

  test('안정화 대기는 완료하지 않고 같은 복구 기록에 연결된 새 응답으로 재요청한다', async () => {
    const { repo, session } = await setup();
    repo.setExecutionScenario(session.sessionId, 'waiting');
    await send(repo, session, retry(session));
    const waiting = await settled(repo, session);
    expect(selectExecution(waiting)).toMatchObject({
      canComplete: false,
      canSample: true,
      completedCount: 1,
    });
    repo.setExecutionScenario(session.sessionId, 'normal');
    await send(repo, waiting, {
      type: 'requestExecutionSample',
      cursorId: waiting.execution!.cursor!.cursorId,
    });
    const ready = await settled(repo, waiting);
    expect(selectExecution(ready).canComplete).toBe(true);
    expect(selectExecution(ready).latest).toMatchObject({
      purpose: 'remeasurement',
      recoveryId: selectRemeasurement(session).recovery!.recoveryId,
    });
    expect(ready.execution!.attempts.at(-1)!.attemptId).not.toBe(
      waiting.execution!.attempts.at(-1)!.attemptId,
    );
    expect(ready.execution!.recoveries).toEqual(session.execution!.recoveries);
  });

  test('미점검·일반 실행·보류·다른 세션의 복구 기록으로 S09를 실행하지 않는다', async () => {
    const { repo, session, preparing, running, held } = await setup();
    for (const invalid of [preparing, running, held])
      expect(selectRemeasurement(invalid).canRemeasure).toBe(false);
    const other = await repo.createSession({
      requestId: 'other',
      operatorId: 'other',
      procedure: mockProcedure,
    });
    await expect(send(repo, other, retry(session))).rejects.toMatchObject({
      code: 'INVALID_STATE',
    });
    expect(await repo.getSession(other.sessionId)).toEqual(other);
    expect(await repo.getSession(session.sessionId)).toEqual(session);
  });
});

describe('S09 화면과 진입', () => {
  test('조회·뒤로 가기·재진입은 명령을 만들지 않으며 버튼으로 새 시도를 한 번 요청한다', async () => {
    let delay = false;
    let resolve!: (r: ExecutionSampleReport) => void;
    let input!: Parameters<MockExecutionRunner>[0];
    const { repo, session } = await setup(async (value) => {
      if (delay) {
        input = value;
        return new Promise((done) => {
          resolve = done;
        });
      }
      return buildMockExecutionReport(value);
    });
    const onBack = jest.fn();
    const onExecution = jest.fn();
    const view = () => (
      <WorkflowProvider repository={repo}>
        <RemeasurementScreen
          sessionId={session.sessionId}
          onBack={onBack}
          onExecution={onExecution}
        />
      </WorkflowProvider>
    );
    let screen = await render(view());
    await screen.findByText('새 조도값이 수신되었습니다');
    expect(screen.queryByText('새 센서값이 수신되었습니다')).toBeNull();
    expect(screen.queryByText(/I2C 케이블 재연결/)).toBeNull();
    expect(screen.queryByText(/5 \/ 5|5\/5/)).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: '뒤로가기' }));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(await repo.getSession(session.sessionId)).toEqual(session);
    await screen.unmount();
    screen = await render(view());
    const button = await screen.findByRole('button', { name: '2회차 다시 측정' });
    delay = true;
    await fireEvent.press(button);
    await fireEvent.press(button);
    await waitFor(() => expect(onExecution).toHaveBeenCalledTimes(1));
    expect((await repo.getSession(session.sessionId)).execution!.attempts).toHaveLength(
      session.execution!.attempts.length + 1,
    );
    await screen.unmount();
    await act(async () => resolve(buildMockExecutionReport(input)));
    const measured = await settled(repo, session);
    screen = await render(view());
    await screen.findByText('재측정 요청 완료');
    expect(screen.queryByText('재측정 준비 완료')).toBeNull();
    await fireEvent.press(await screen.findByRole('button', { name: '현재 회차 측정 확인' }));
    expect(onExecution).toHaveBeenCalledTimes(2);
    expect(await repo.getSession(session.sessionId)).toEqual(measured);
  });

  test('성공 제목은 문제 센서의 측정 정의를 따르며 다른 센서를 조도로 표시하지 않는다', async () => {
    const sensors = mockProcedure.deviceCheck!.sensors;
    const { repo, session } = await setup(undefined, {
      ...mockProcedure,
      deviceCheck: { ...mockProcedure.deviceCheck!, sensors: [...sensors.slice(1), sensors[0]] },
    });
    const screen = await render(
      <WorkflowProvider repository={repo}>
        <RemeasurementScreen
          sessionId={session.sessionId}
          onBack={jest.fn()}
          onExecution={jest.fn()}
        />
      </WorkflowProvider>,
    );
    await screen.findByText('새 전압값이 수신되었습니다');
    expect(screen.queryByText('새 조도값이 수신되었습니다')).toBeNull();
    expect(screen.getByText('재측정 준비 완료')).toBeTruthy();
    expect(await repo.getSession(session.sessionId)).toEqual(session);
  });

  test.each([
    { kind: '조도', label: '', value: '18.4 lx' },
    { kind: '조도', label: '센서', value: '18.4 lx' },
    { kind: '전압', label: '', value: '5.01 V' },
  ])(
    '$kind 라벨이 "$label"이어도 실제 측정 종류로 제목을 표시하고 원본은 유지한다',
    async ({ kind, label, value }) => {
      const sensors = mockProcedure.deviceCheck!.sensors;
      const ordered = kind === '전압' ? [...sensors.slice(1), sensors[0]] : sensors;
      const { repo, session } = await setup(undefined, {
        ...mockProcedure,
        deviceCheck: {
          ...mockProcedure.deviceCheck!,
          sensors: ordered.map((sensor, index) =>
            index === 0
              ? {
                  ...sensor,
                  metrics: sensor.metrics.map((metric, metricIndex) =>
                    metricIndex === 0 ? { ...metric, label } : metric,
                  ),
                }
              : sensor,
          ),
        },
      });
      const screen = await render(
        <WorkflowProvider repository={repo}>
          <RemeasurementScreen
            sessionId={session.sessionId}
            onBack={jest.fn()}
            onExecution={jest.fn()}
          />
        </WorkflowProvider>,
      );
      await screen.findByText(`새 ${kind}값이 수신되었습니다`);
      expect(screen.queryByText('새 센서값이 수신되었습니다')).toBeNull();
      if (kind === '전압') expect(screen.queryByText('새 조도값이 수신되었습니다')).toBeNull();
      expect(screen.getByText(value)).toBeTruthy();
      expect(selectRemeasurement(session).cursor?.trialIndex).toBe(2);
      expect(await repo.getSession(session.sessionId)).toEqual(session);
    },
  );

  test('3개보다 많은 실패·재시도 이력을 시간순으로 모두 표시하고 원본 기록을 바꾸지 않는다', async () => {
    const { repo, session } = await setup();
    repo.setExecutionScenario(session.sessionId, 'error');
    await send(repo, session, retry(session));
    let current = await settled(repo, session);
    for (let index = 0; index < 2; index++) {
      await send(repo, current, recover(current));
      current = await settled(repo, current);
    }
    repo.setExecutionScenario(session.sessionId, 'normal');
    await send(repo, current, recover(current));
    const recovered = await settled(repo, current);
    const history = selectRemeasurement(recovered).history;
    expect(history.length).toBeGreaterThan(3);
    const execute = jest.spyOn(repo, 'executeCommand');
    const screen = await render(
      <WorkflowProvider repository={repo}>
        <RemeasurementScreen
          sessionId={session.sessionId}
          onBack={jest.fn()}
          onExecution={jest.fn()}
        />
      </WorkflowProvider>,
    );
    await screen.findByText('새 조도값이 수신되었습니다');
    const labels = screen.getAllByText(/^\d{2}:\d{2}:\d{2} ·/).map((node) => node.props.children);
    expect(labels).toHaveLength(history.length);
    expect(labels.map((label) => label.split(' · ')[1])).toEqual(
      history.map((event) =>
        event.type === 'recoveryRequested'
          ? '센서 재확인 요청'
          : event.type === 'recoverySucceeded'
            ? '센서 응답 재확인 완료'
            : '측정 보류·오류 기록',
      ),
    );
    expect(screen.getByText('재측정 준비 완료')).toBeTruthy();
    expect(execute).not.toHaveBeenCalled();
    expect(await repo.getSession(session.sessionId)).toEqual(recovered);
  });

  test('없는 세션은 오류·재조회만 제공하고 세션을 새로 만들지 않는다', async () => {
    const repo = new MockWorkflowRepository();
    const create = jest.spyOn(repo, 'createSession');
    const execute = jest.spyOn(repo, 'executeCommand');
    const screen = await render(
      <WorkflowProvider repository={repo}>
        <RemeasurementScreen sessionId="missing" onBack={jest.fn()} onExecution={jest.fn()} />
      </WorkflowProvider>,
    );
    await screen.findByText('실험 기록을 찾을 수 없습니다. 새 실험을 시작해 주세요.');
    expect(screen.getByRole('button', { name: '현재 회차 다시 측정' })).toBeDisabled();
    await fireEvent.press(screen.getByRole('button', { name: '복구 기록 다시 불러오기' }));
    await screen.findByText('실험 기록을 찾을 수 없습니다. 새 실험을 시작해 주세요.');
    expect(create).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  test('S08 성공 상태 재진입은 자동 이동하지 않으며 버튼으로 S09를 다시 연다', async () => {
    const { repo, session, held } = await setup();
    const next = jest.fn();
    const back = jest.fn();
    const screen = await render(
      <WorkflowProvider repository={repo}>
        <RecoveryScreen sessionId={session.sessionId} onBack={back} onRemeasurement={next} />
      </WorkflowProvider>,
    );
    await screen.findByText('새 센서값이 수신되었습니다');
    expect(next).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: '복구 후 재측정 안내' }));
    expect(next).toHaveBeenCalledTimes(1);
    expect(await repo.getSession(session.sessionId)).toEqual(session);
    expect(selectExecution(held).requiresRecovery).toBe(true);
  });

  test('S08 실패는 이동하지 않고 성공 재시도만 S09로 한 번 연결한다', async () => {
    const { repo, session } = await setup();
    repo.setExecutionScenario(session.sessionId, 'error');
    await send(repo, session, retry(session));
    await settled(repo, session);
    const next = jest.fn();
    const screen = await render(
      <WorkflowProvider repository={repo}>
        <RecoveryScreen sessionId={session.sessionId} onBack={jest.fn()} onRemeasurement={next} />
      </WorkflowProvider>,
    );
    await fireEvent.press(await screen.findByRole('button', { name: '센서 다시 확인' }));
    await screen.findByText('센서 상태를 다시 확인해 주세요');
    expect(next).not.toHaveBeenCalled();
    const failed = await repo.getSession(session.sessionId);
    expect(failed.execution!.recoveries).toHaveLength(2);
    repo.setExecutionScenario(session.sessionId, 'normal');
    await fireEvent.press(screen.getByRole('button', { name: '센서 다시 확인' }));
    await waitFor(() => expect(next).toHaveBeenCalledTimes(1));
    const recovered = await repo.getSession(session.sessionId);
    expect(recovered.execution!.recoveries!.slice(0, 2)).toEqual(failed.execution!.recoveries);
    expect(selectExecution(recovered)).toMatchObject({ canComplete: false, completedCount: 1 });
  });
});
