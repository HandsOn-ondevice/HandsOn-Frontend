import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import ResumeRoute from '../src/app/researcher-workflow/[sessionId]/resume';
import { MockWorkflowRepository } from '../src/features/researcher-workflow/infrastructure/mock/MockWorkflowRepository';
import { mockProcedure } from '../src/features/researcher-workflow/infrastructure/mock/fixtures';
import { buildMockDiagnostics } from '../src/features/researcher-workflow/infrastructure/mock/device-check-scenarios';
import { buildMockExecutionReport } from '../src/features/researcher-workflow/infrastructure/mock/execution-scenarios';
import type { WorkflowCommand } from '../src/features/researcher-workflow/domain/models';
import type { WorkflowRepository } from '../src/features/researcher-workflow/application/WorkflowRepository';
import { selectExecution } from '../src/features/researcher-workflow/domain/execution';
import { selectSessionDeviceStatus } from '../src/features/researcher-workflow/domain/session-device-status';
import { createWorkflowQueries } from '../src/features/researcher-workflow/application/workflow-queries';
import { WorkflowProvider } from '../src/features/researcher-workflow/state/WorkflowProvider';
import { ExecutionScreen } from '../src/features/researcher-workflow/screens/ExecutionScreen';
import { SessionMenuScreen } from '../src/features/researcher-workflow/screens/SessionMenuScreen';
import { SessionDeviceStatusScreen } from '../src/features/researcher-workflow/screens/SessionDeviceStatusScreen';

jest.mock('expo-router', () => ({
  useFocusEffect: jest.fn(),
  useLocalSearchParams: jest.fn(),
  Redirect: jest.fn(() => null),
  router: { replace: jest.fn(), dismissTo: jest.fn() },
}));

beforeEach(() => {
  jest.clearAllMocks();
});

async function setup() {
  const inspect = jest.fn(async (input: Parameters<typeof buildMockDiagnostics>[0]) =>
    buildMockDiagnostics(input),
  );
  const sample = jest.fn(async (input: Parameters<typeof buildMockExecutionReport>[0]) =>
    buildMockExecutionReport(input),
  );
  const repo = new MockWorkflowRepository({ inspect, sample });
  const created = await repo.createSession({
    requestId: 'session-menu',
    operatorId: 'researcher',
    procedure: mockProcedure,
  });
  let request = 0;
  const get = () => repo.getSession(created.sessionId);
  const send = async (command: WorkflowCommand) =>
    repo.executeCommand(created.sessionId, command, {
      requestId: `menu-${++request}`,
      expectedRevision: (await get()).revision,
    });
  for (const check of mockProcedure.preparation.filter((item) => item.owner === 'operator'))
    await send({ type: 'setPreparationCheck', checkId: check.id, checked: true });
  await send({ type: 'completePreparation' });
  await send({ type: 'startDeviceCheck' });
  await waitFor(async () => expect((await get()).phase).toBe('readyToExecute'));
  await send({ type: 'startExecution' });
  const measure = async () => {
    const current = await get();
    await send({ type: 'requestExecutionSample', cursorId: current.execution!.cursor!.cursorId });
    await waitFor(async () => expect(selectExecution(await get()).sampling).toBe(false));
    return get();
  };
  return { repo, inspect, sample, get, send, measure, sessionId: created.sessionId };
}

describe('S06 세션 메뉴와 장치 상태 조회', () => {
  test('메뉴·장치 화면 왕복은 같은 회차·완료 기록과 revision을 보존하고 명령을 만들지 않는다', async () => {
    const f = await setup();
    let measured = await f.measure();
    await f.send({
      type: 'completeExecutionStep',
      cursorId: measured.execution!.cursor!.cursorId,
      sampleAttemptId: selectExecution(measured).latest!.attemptId,
    });
    measured = await f.measure();
    const commands = jest.spyOn(f.repo, 'executeCommand');
    const onMenu = jest.fn();
    const onBack = jest.fn();
    const onExecution = jest.fn();
    const onDeviceStatus = jest.fn();
    const execution = (
      <WorkflowProvider repository={f.repo}>
        <ExecutionScreen
          sessionId={f.sessionId}
          onBack={() => {}}
          onClarification={() => {}}
          onMenu={onMenu}
        />
      </WorkflowProvider>
    );
    const screen = await render(execution);
    await screen.findByText('유효 측정 1 / 15회');
    expect(screen.queryByRole('button', { name: '실험 일시정지' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: '더 보기' }));
    expect(onMenu).toHaveBeenCalledTimes(1);
    await screen.rerender(
      <WorkflowProvider repository={f.repo}>
        <SessionMenuScreen
          sessionId={f.sessionId}
          onExecution={onExecution}
          onDeviceStatus={onDeviceStatus}
          onPause={() => {}}
        />
      </WorkflowProvider>,
    );
    await screen.findByText('실험 작업 메뉴');
    await fireEvent.press(screen.getByRole('button', { name: '장치 상태 확인' }));
    expect(onDeviceStatus).toHaveBeenCalledTimes(1);
    await screen.rerender(
      <WorkflowProvider repository={f.repo}>
        <SessionDeviceStatusScreen
          sessionId={f.sessionId}
          onBack={onBack}
          onExecution={onExecution}
        />
      </WorkflowProvider>,
    );
    await screen.findByText('18.4 lx');
    expect(screen.getByText('5.01 V · 83 mA · 416 mW')).toBeTruthy();
    expect(screen.getByText('24.3 °C · 46 %')).toBeTruthy();
    expect(screen.getByText(/시뮬레이션 · 실제 장치 연결/)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: '뒤로가기' }));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onExecution).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: '현재 작업으로 돌아가기' }));
    expect(onExecution).toHaveBeenCalledTimes(1);
    await screen.rerender(execution);
    await screen.findByText('유효 측정 1 / 15회');
    expect(screen.getByRole('button', { name: '완료 요청' })).toBeEnabled();
    expect(await f.get()).toEqual(measured);
    expect(commands).not.toHaveBeenCalled();
  });

  test('S05 성공 기록만 있는 세션은 실행 응답 없음으로 표시하고 점검·측정을 요청하지 않는다', async () => {
    const f = await setup();
    const before = await f.get();
    const commands = jest.spyOn(f.repo, 'executeCommand');
    const screen = await render(
      <WorkflowProvider repository={f.repo}>
        <SessionDeviceStatusScreen
          sessionId={f.sessionId}
          onBack={() => {}}
          onExecution={() => {}}
        />
      </WorkflowProvider>,
    );
    await screen.findByText('Orange Pi 5+ 실행 응답 없음');
    expect(screen.getAllByText('실행 중 응답 없음')).toHaveLength(3);
    expect(screen.queryByText('18.4 lx')).toBeNull();
    expect(screen.queryByText(/5.01 V/)).toBeNull();
    expect(f.inspect).toHaveBeenCalledTimes(1);
    expect(f.sample).not.toHaveBeenCalled();
    expect(commands).not.toHaveBeenCalled();
    expect(await f.get()).toEqual(before);
  });

  test('최신 실패는 이전 성공값을 숨기며 장치 조회 이후에도 오류·복구 이력과 진행 차단을 유지한다', async () => {
    const f = await setup();
    await f.measure();
    f.repo.setExecutionScenario(f.sessionId, 'error');
    const failed = await f.measure();
    expect(selectSessionDeviceStatus(failed).sensors[0].metrics[0].value).toBeNull();
    expect(selectExecution(failed).canComplete).toBe(false);
    const commands = jest.spyOn(f.repo, 'executeCommand');
    const screen = await render(
      <WorkflowProvider repository={f.repo}>
        <SessionDeviceStatusScreen
          sessionId={f.sessionId}
          onBack={() => {}}
          onExecution={() => {}}
        />
      </WorkflowProvider>,
    );
    await screen.findByText(/통신 오류/);
    expect(screen.queryByText('18.4 lx')).toBeNull();
    expect(await f.get()).toEqual(failed);
    expect(commands).not.toHaveBeenCalled();
    commands.mockRestore();
    f.repo.setExecutionScenario(f.sessionId, 'normal');
    await act(async () => {
      await f.send({
        type: 'requestRecovery',
        cursorId: failed.execution!.cursor!.cursorId,
        blockedAttemptId: selectExecution(failed).latest!.attemptId,
      });
    });
    await waitFor(async () =>
      expect((await f.get()).execution?.recoveries?.at(-1)?.status).toBe('recovered'),
    );
    const recovered = await f.get();
    await screen.unmount();
    const reads = jest.spyOn(f.repo, 'executeCommand');
    const again = await render(
      <WorkflowProvider repository={f.repo}>
        <SessionMenuScreen
          sessionId={f.sessionId}
          onExecution={() => {}}
          onDeviceStatus={() => {}}
          onPause={() => {}}
        />
      </WorkflowProvider>,
    );
    await again.findByText('실험 작업 메뉴');
    await fireEvent.press(again.getByRole('button', { name: '현재 작업으로 돌아가기' }));
    expect(await f.get()).toEqual(recovered);
    expect(selectExecution(await f.get()).canComplete).toBe(false);
    expect(reads).not.toHaveBeenCalled();
  });

  test('메뉴의 일시정지 버튼만 명령을 실행하며 저장 성공 후 S10으로 이동한다', async () => {
    const f = await setup();
    const before = await f.measure();
    const onPause = jest.fn();
    const commands = jest.spyOn(f.repo, 'executeCommand');
    const screen = await render(
      <WorkflowProvider repository={f.repo}>
        <SessionMenuScreen
          sessionId={f.sessionId}
          onExecution={() => {}}
          onDeviceStatus={() => {}}
          onPause={onPause}
        />
      </WorkflowProvider>,
    );
    const pause = await screen.findByRole('button', { name: '실험 일시정지' });
    expect(commands).not.toHaveBeenCalled();
    await fireEvent.press(pause);
    await waitFor(() => expect(onPause).toHaveBeenCalledTimes(1));
    const after = await f.get();
    expect(after.phase).toBe('paused');
    expect(after.execution).toEqual(before.execution);
    expect(after.evidence).toEqual(before.evidence);
    expect(after.events.at(-1)?.type).toBe('executionPaused');
    expect(commands).toHaveBeenCalledTimes(1);
  });

  test('일시정지 저장 실패는 메뉴에 남기고 세션과 이동을 변경하지 않는다', async () => {
    const f = await setup();
    const before = await f.get();
    const onPause = jest.fn();
    jest
      .spyOn(f.repo, 'executeCommand')
      .mockRejectedValueOnce(new Error('메뉴 일시정지 저장 실패'));
    const screen = await render(
      <WorkflowProvider repository={f.repo}>
        <SessionMenuScreen
          sessionId={f.sessionId}
          onExecution={() => {}}
          onDeviceStatus={() => {}}
          onPause={onPause}
        />
      </WorkflowProvider>,
    );
    await fireEvent.press(await screen.findByRole('button', { name: '실험 일시정지' }));
    await screen.findByText('메뉴 일시정지 저장 실패');
    expect(onPause).not.toHaveBeenCalled();
    expect(await f.get()).toEqual(before);
  });

  test('새 요청의 응답이 없거나 출처·회차가 틀리면 과거 응답과 S05 값으로 대체하지 않는다', async () => {
    const f = await setup();
    const session = await f.measure();
    const latest = session.execution!.attempts.at(-1)!;
    for (const replacement of [
      { ...latest, status: 'sampling' as const, report: undefined },
      { ...latest, report: { ...latest.report!, cursorId: 'other-cursor' } },
      { ...latest, report: { ...latest.report!, source: 'api' as const } },
    ]) {
      const state = selectSessionDeviceStatus({
        ...session,
        execution: {
          ...session.execution!,
          attempts: [...session.execution!.attempts, replacement],
        },
      });
      expect(state.report).toBeUndefined();
      expect(
        state.sensors.every((item) => item.metrics.every((metric) => metric.value === null)),
      ).toBe(true);
    }
  });
});

describe('S11 직접 URL 진입 가드', () => {
  test('유효한 S11에서 재개하면 진입 Redirect 없이 기존 S06으로 한 번만 복귀한다', async () => {
    const f = await setup();
    const running = await f.measure();
    const paused = await f.send({
      type: 'pauseExecution',
      cursorId: running.execution!.cursor!.cursorId,
    });
    const queries = createWorkflowQueries(f.repo);
    expect(await queries.getSessionSummary(f.sessionId)).toMatchObject({
      phase: 'paused',
      canOpenResume: true,
      cursor: paused.execution!.cursor,
      condition: { id: paused.execution!.cursor!.conditionId },
    });
    jest.mocked(useLocalSearchParams).mockReturnValue({ sessionId: f.sessionId });
    const screen = await render(
      <WorkflowProvider repository={f.repo}>
        <ResumeRoute />
      </WorkflowProvider>,
    );
    await screen.findByTestId('resume-screen');
    expect(Redirect).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText('Orange Pi 5+와 필수 센서 3개 연결'));
    await screen.findByText(/최신 연결 응답/);
    await fireEvent.press(screen.getByText('공급 전압 확인 필요'));
    await screen.findByText('공급 전압 5.01 V');
    await fireEvent.press(screen.getByText('거리 20cm와 지그 고정 확인'));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '확인하고 재개' })).toBeEnabled(),
    );
    await fireEvent.press(screen.getByRole('button', { name: '확인하고 재개' }));
    await waitFor(() => expect(router.dismissTo).toHaveBeenCalledTimes(1));
    expect(router.dismissTo).toHaveBeenCalledWith({
      pathname: '/researcher-workflow/[sessionId]/execution',
      params: { sessionId: f.sessionId },
    });
    expect(Redirect).not.toHaveBeenCalled();
    const resumed = await f.get();
    expect(await queries.getSessionSummary(f.sessionId)).toMatchObject({
      phase: 'running',
      canOpenResume: false,
      cursor: paused.execution!.cursor,
    });
    expect(resumed.execution?.cursor).toEqual(paused.execution?.cursor);
    expect(resumed.execution?.attempts).toHaveLength(paused.execution!.attempts.length);
  });

  test('실행 중 세션은 S06으로 보내며 재개 명령을 실행하지 않는다', async () => {
    const f = await setup();
    jest.mocked(useLocalSearchParams).mockReturnValue({ sessionId: f.sessionId });
    const before = await f.get();
    const commands = jest.spyOn(f.repo, 'executeCommand');
    await render(
      <WorkflowProvider repository={f.repo}>
        <ResumeRoute />
      </WorkflowProvider>,
    );
    await waitFor(() => expect(Redirect).toHaveBeenCalled());
    expect(jest.mocked(Redirect).mock.calls.at(-1)?.[0]).toMatchObject({
      href: {
        pathname: '/researcher-workflow/[sessionId]/execution',
        params: { sessionId: f.sessionId },
      },
    });
    expect(commands).not.toHaveBeenCalled();
    expect(await f.get()).toEqual(before);
  });

  test('유효한 paused는 조회만 하고 이벤트가 없는 paused는 재개 UI를 열지 않는다', async () => {
    const f = await setup();
    const running = await f.get();
    const paused = await f.send({
      type: 'pauseExecution',
      cursorId: running.execution!.cursor!.cursorId,
    });
    jest.mocked(useLocalSearchParams).mockReturnValue({ sessionId: f.sessionId });
    const commands = jest.spyOn(f.repo, 'executeCommand');
    const screen = await render(
      <WorkflowProvider repository={f.repo}>
        <ResumeRoute />
      </WorkflowProvider>,
    );
    await screen.findByTestId('resume-screen');
    expect(screen.getByRole('button', { name: '확인하고 재개' })).toBeDisabled();
    expect(await f.get()).toEqual(paused);
    expect(commands).not.toHaveBeenCalled();
    const invalid: WorkflowRepository = {
      createSession: (input) => f.repo.createSession(input),
      getSession: async () => ({ ...paused, events: [] }),
      executeCommand: (...args) => f.repo.executeCommand(...args),
      subscribe: () => () => {},
    };
    await screen.rerender(
      <WorkflowProvider repository={invalid}>
        <ResumeRoute />
      </WorkflowProvider>,
    );
    await screen.findByText('유효한 일시정지 기록이 없습니다');
    expect(screen.queryByTestId('resume-screen')).toBeNull();
    expect(commands).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
  });
});
