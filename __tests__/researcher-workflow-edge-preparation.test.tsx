import { beforeEach, expect, jest, test } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react-native';
import { Redirect } from 'expo-router';
import { EdgePreparationScreen } from '@/features/researcher-workflow/screens/EdgePreparationScreen';
import { EdgeApiError, getEdge } from '@/lib/edgeApi';

jest.mock('expo-router', () => ({ Redirect: jest.fn(() => null) }));

jest.mock('@/lib/edgeApi', () => ({
  ...jest.requireActual<typeof import('@/lib/edgeApi')>('@/lib/edgeApi'),
  getEdge: jest.fn(),
}));

const sessionId = 'session-1';
const token = 'test-token';
const session = {
  sessionId,
  phase: 'preparing',
  holdReason: null,
  procedure: {
    title: '키트 거리 확인 절차',
    version: '1.0.0',
    preparation: [
      {
        id: 'device',
        title: '실험 대상 확인',
        description: '키트 회로를 확인하세요.',
        owner: 'operator',
      },
    ],
  },
  checks: [{ id: 'device', checked: true }],
};

beforeEach(() => {
  jest.mocked(getEdge).mockReset();
  jest.mocked(Redirect).mockClear();
});

test('네트워크 실패 뒤 같은 Edge 세션을 읽고 저장된 준비 상태를 표시한다', async () => {
  jest
    .mocked(getEdge)
    .mockRejectedValueOnce(new EdgeApiError('network'))
    .mockResolvedValueOnce(session);
  const screen = await render(
    <EdgePreparationScreen
      sessionId={sessionId}
      token={token}
      onBack={jest.fn()}
      onHome={jest.fn()}
    />,
  );

  await screen.findByText('Edge 서버에 연결할 수 없어요.');
  await fireEvent.press(screen.getByRole('button', { name: '상태 다시 불러오기' }));

  await screen.findByText(`세션 ${sessionId}`);
  expect(screen.getByText('키트 거리 확인 절차 · v1.0.0')).toBeVisible();
  expect(screen.getByText('준비 진행도 · 1 / 1 항목 완료')).toBeVisible();
  expect(screen.getByText('실험 대상 확인')).toBeVisible();
  expect(jest.mocked(getEdge).mock.calls).toEqual([
    ['/sessions/session-1', undefined, token],
    ['/sessions/session-1', undefined, token],
  ]);
});

test.each([
  { phase: 'running', holdReason: null, destination: 'execution' },
  { phase: 'held', holdReason: { code: 'USER_PAUSED' }, destination: 'paused' },
  { phase: 'held', holdReason: { code: 'MEASUREMENT_ERROR' }, destination: 'recovery' },
  { phase: 'awaitingDeviceCheck', holdReason: null, destination: 'device-check' },
  { phase: 'readyToExecute', holdReason: null, destination: 'device-check' },
])(
  'Edge $phase 상태에서 같은 세션 ID로 $destination 경로를 연다',
  async ({ phase, holdReason, destination }) => {
    jest.mocked(getEdge).mockResolvedValueOnce({ ...session, phase, holdReason });
    await render(
      <EdgePreparationScreen
        sessionId={sessionId}
        token={token}
        onBack={jest.fn()}
        onHome={jest.fn()}
      />,
    );

    expect(jest.mocked(Redirect).mock.calls[0]?.[0]).toMatchObject({
      href: {
        pathname: `/researcher-workflow/[sessionId]/${destination}`,
        params: { sessionId },
      },
    });
    expect(getEdge).toHaveBeenCalledTimes(1);
  },
);
