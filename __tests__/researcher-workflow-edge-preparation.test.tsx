import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import ExecutionRoute from '@/app/researcher-workflow/[sessionId]/execution';
import PauseRoute from '@/app/researcher-workflow/[sessionId]/paused';
import PreparationRoute from '@/app/researcher-workflow/[sessionId]/preparation';
import SessionMenuRoute from '@/app/researcher-workflow/[sessionId]/session-menu';
import { EntrySelectionProvider } from '@/features/entry/EntrySelectionProvider';
import type { WorkflowRepository } from '@/features/researcher-workflow/application/WorkflowRepository';
import {
  WorkflowError,
  type ExperimentSession,
} from '@/features/researcher-workflow/domain/models';
import { WorkflowProvider } from '@/features/researcher-workflow/state/WorkflowProvider';
import * as workflowRepository from '@/features/researcher-workflow/state/workflow-repository';

jest.mock('expo-router', () => ({
  Redirect: jest.fn(() => null),
  useFocusEffect: jest.fn(),
  useIsFocused: () => true,
  useLocalSearchParams: jest.fn(),
  router: {
    canGoBack: jest.fn(() => false),
    back: jest.fn(),
    replace: jest.fn(),
    push: jest.fn(),
    dismissTo: jest.fn(),
  },
}));

const sessionId = 'session-1';
const session: ExperimentSession = {
  sessionId,
  source: 'api',
  operatorId: 'operator-01',
  phase: 'preparing',
  revision: 1,
  createdAt: '2026-11-23T00:00:00.000Z',
  updatedAt: '2026-11-23T00:00:00.000Z',
  holdReason: null,
  procedure: {
    procedureId: 'kit-distance',
    approval: 'approved',
    deviceId: 'device-1',
    title: '키트 거리 확인 절차',
    version: '1.0.0',
    preparation: [
      {
        id: 'device',
        title: '실험 대상 확인',
        description: '키트 회로를 확인하세요.',
        guidance: '장치 표시를 확인하세요.',
        owner: 'operator',
        verifiedAt: 'S04',
        requiredForDeviceCheck: true,
      },
    ],
  },
  checks: [{ id: 'device', checked: true, confirmedAt: null, evidenceId: null }],
  evidence: [],
  events: [],
  deviceChecks: [],
};

const running: ExperimentSession = {
  ...session,
  phase: 'running',
  procedure: {
    ...session.procedure,
    execution: {
      provenance: 'approved',
      profileVersion: '1.0.0',
      settlingSeconds: 1,
      conditions: [
        { id: 'placement-10cm', label: '10 cm', repetitions: 3 },
        { id: 'placement-20cm', label: '20 cm', repetitions: 3 },
      ],
    },
  },
  execution: {
    cursor: {
      cursorId: 'cursor-1',
      stepId: 'step-1',
      conditionId: 'placement-20cm',
      trialIndex: 2,
    },
    attempts: [],
    pendingVoice: null,
  },
};

const paused: ExperimentSession = {
  ...running,
  phase: 'held',
  holdReason: { code: 'USER_PAUSED', message: '작업자가 일시정지했습니다.' },
  revision: running.revision + 1,
};

function setup(next = session) {
  const repository = {
    getSession: jest.fn<WorkflowRepository['getSession']>().mockResolvedValue(next),
    createSession: jest.fn<WorkflowRepository['createSession']>(),
    executeCommand: jest.fn<WorkflowRepository['executeCommand']>(),
    subscribe: jest.fn<WorkflowRepository['subscribe']>().mockReturnValue(() => {}),
  };
  const show = () =>
    render(
      <WorkflowProvider repository={repository}>
        <PreparationRoute />
      </WorkflowProvider>,
    );
  return { repository, show };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useLocalSearchParams).mockReturnValue({ sessionId, resume: '1' });
});
afterEach(() => {
  jest.restoreAllMocks();
});

test('네트워크 실패 뒤 같은 Edge 세션을 읽고 저장된 준비 상태를 표시한다', async () => {
  const { repository, show } = setup();
  repository.getSession.mockRejectedValueOnce(new Error('Edge 서버에 연결할 수 없어요.'));
  const screen = await show();

  await screen.findByText('Edge 서버에 연결할 수 없어요.');
  await fireEvent.press(screen.getByRole('button', { name: '상태 다시 불러오기' }));

  await screen.findByText(`세션 ${sessionId}`);
  expect(screen.getByText('키트 거리 확인 절차 · v1.0.0')).toBeVisible();
  expect(screen.getByText('준비 진행도 · 1 / 1 항목 완료')).toBeVisible();
  expect(screen.getByText('실험 대상 확인')).toBeVisible();
  expect(repository.getSession.mock.calls).toEqual([[sessionId], [sessionId]]);
  expect(repository.createSession).not.toHaveBeenCalled();
  expect(repository.executeCommand).not.toHaveBeenCalled();
});

test.each([
  { phase: 'running', holdReason: null, destination: 'execution' },
  {
    phase: 'held',
    holdReason: { code: 'USER_PAUSED', message: '일시정지' },
    destination: 'paused',
  },
  {
    phase: 'held',
    holdReason: { code: 'MEASUREMENT_ERROR', message: '측정 오류' },
    destination: 'recovery',
  },
  { phase: 'awaitingDeviceCheck', holdReason: null, destination: 'device-check' },
  { phase: 'readyToExecute', holdReason: null, destination: 'device-check' },
] as const)(
  'Edge $phase 상태에서 같은 세션 ID로 $destination 경로를 연다',
  async ({ phase, holdReason, destination }) => {
    const { repository, show } = setup({ ...session, phase, holdReason });
    await show();

    expect(jest.mocked(Redirect).mock.calls[0]?.[0]).toMatchObject({
      href: {
        pathname: `/researcher-workflow/[sessionId]/${destination}`,
        params: { sessionId },
      },
    });
    expect(repository.getSession.mock.calls).toEqual([[sessionId]]);
    expect(repository.createSession).not.toHaveBeenCalled();
    expect(repository.executeCommand).not.toHaveBeenCalled();
  },
);

test('홈에서 다시 연 Edge 사용자 일시정지에서 서버의 회차를 표시하고 홈과 재개 확인을 연다', async () => {
  jest.spyOn(workflowRepository, 'isEdgeWorkflowEnabled').mockReturnValue(true);
  const { repository, show } = setup(paused);
  const screen = await show();

  expect(jest.mocked(Redirect).mock.calls[0]?.[0]).toMatchObject({
    href: { pathname: '/researcher-workflow/[sessionId]/paused', params: { sessionId } },
  });
  await screen.rerender(
    <WorkflowProvider repository={repository}>
      <PauseRoute />
    </WorkflowProvider>,
  );

  expect(await screen.findByText('작업자가 일시정지했습니다.')).toBeVisible();
  expect(screen.getByRole('header', { name: '실험 일시정지' })).toBeVisible();
  expect(screen.getByText(`세션 ${sessionId}`)).toBeVisible();
  expect(screen.getByText('다음 작업 · 20 cm 2회차')).toBeVisible();
  expect(screen.getByText('완료한 측정 0회')).toBeVisible();

  await fireEvent.press(screen.getByRole('button', { name: '바로 재개' }));
  expect(router.push).toHaveBeenCalledWith({
    pathname: '/researcher-workflow/[sessionId]/resume',
    params: { sessionId },
  });
  await fireEvent.press(screen.getByRole('button', { name: '홈으로' }));
  expect(router.dismissTo).toHaveBeenCalledWith('/student');
  expect(repository.getSession.mock.calls).toEqual([[sessionId], [sessionId]]);
  expect(repository.createSession).not.toHaveBeenCalled();
  expect(repository.executeCommand).not.toHaveBeenCalled();
});

test('Edge 실행 메뉴는 결과를 받지 못한 일시정지 요청을 같은 ID로 재시도하고 서버 수락 후에만 이동한다', async () => {
  jest.spyOn(workflowRepository, 'isEdgeWorkflowEnabled').mockReturnValue(true);
  const { repository } = setup(running);
  repository.executeCommand
    .mockRejectedValueOnce(new WorkflowError('OUTCOME_UNKNOWN', 'Edge 응답을 받지 못했어요.'))
    .mockResolvedValueOnce(paused);
  const screen = await render(
    <WorkflowProvider repository={repository}>
      <ExecutionRoute />
    </WorkflowProvider>,
    { wrapper: EntrySelectionProvider },
  );

  await fireEvent.press(await screen.findByRole('button', { name: '더 보기' }));
  expect(router.push).toHaveBeenCalledWith({
    pathname: '/researcher-workflow/[sessionId]/session-menu',
    params: { sessionId },
  });
  await screen.rerender(
    <WorkflowProvider repository={repository}>
      <SessionMenuRoute />
    </WorkflowProvider>,
  );

  await fireEvent.press(await screen.findByRole('button', { name: '실험 일시정지' }));
  await screen.findByText('Edge 응답을 받지 못했어요.');
  expect(router.replace).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: '실험 일시정지' })).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: '이전 요청 다시 시도' }));

  expect(repository.executeCommand).toHaveBeenCalledTimes(2);
  expect(repository.executeCommand).toHaveBeenNthCalledWith(
    1,
    sessionId,
    { type: 'pauseExecution', cursorId: 'cursor-1' },
    { expectedRevision: running.revision, requestId: expect.any(String) },
  );
  expect(repository.executeCommand.mock.calls[1]).toEqual(repository.executeCommand.mock.calls[0]);
  expect(router.replace).toHaveBeenCalledWith({
    pathname: '/researcher-workflow/[sessionId]/paused',
    params: { sessionId },
  });
});

test('홈에서 연 기존 준비 세션에서 확인 완료를 누르면 #48 명령으로 같은 세션을 진행한다', async () => {
  const { repository, show } = setup();
  repository.executeCommand.mockResolvedValue({
    ...session,
    phase: 'awaitingDeviceCheck',
    revision: session.revision + 1,
  });
  const screen = await show();

  await fireEvent.press(await screen.findByRole('button', { name: '확인 완료' }));

  expect(repository.executeCommand).toHaveBeenCalledWith(
    sessionId,
    { type: 'completePreparation' },
    { expectedRevision: session.revision, requestId: expect.any(String) },
  );
  expect(router.push).toHaveBeenCalledWith({
    pathname: '/researcher-workflow/[sessionId]/device-check',
    params: { sessionId },
  });
  expect(Redirect).not.toHaveBeenCalled();
  expect(repository.createSession).not.toHaveBeenCalled();
});

test('S05에서 준비 화면을 직접 다시 열면 서버의 확인 항목을 표시한다', async () => {
  jest.mocked(useLocalSearchParams).mockReturnValue({ sessionId });
  const { repository, show } = setup({ ...session, phase: 'awaitingDeviceCheck' });
  const screen = await show();

  expect(await screen.findByRole('checkbox', { name: '실험 대상 확인' })).toBeChecked();
  expect(Redirect).not.toHaveBeenCalled();
  expect(repository.getSession.mock.calls).toEqual([[sessionId]]);
  expect(repository.executeCommand).not.toHaveBeenCalled();
});
