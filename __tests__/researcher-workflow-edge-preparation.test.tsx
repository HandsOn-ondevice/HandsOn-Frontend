import { beforeEach, expect, jest, test } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import PreparationRoute from '@/app/researcher-workflow/[sessionId]/preparation';
import type { WorkflowRepository } from '@/features/researcher-workflow/application/WorkflowRepository';
import type { ExperimentSession } from '@/features/researcher-workflow/domain/models';
import { WorkflowProvider } from '@/features/researcher-workflow/state/WorkflowProvider';

jest.mock('expo-router', () => ({
  Redirect: jest.fn(() => null),
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
