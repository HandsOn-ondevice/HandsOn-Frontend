import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import { act, fireEvent, render } from '@testing-library/react-native';
import { AppState, Button, Text } from 'react-native';

import type { WorkEnvironment } from '../src/features/entry/entryEnvironment';
import {
  loadStudentHome,
  type LoadStudentHome,
  type StudentHomeData,
} from '../src/features/student-home/studentHomeData';
import { useStudentHome } from '../src/features/student-home/useStudentHome';

let mockFocused = true;
const mockFocusListeners = new Set<(focused: boolean) => void>();

jest.mock('expo-router', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    useFocusEffect: (callback: () => void | (() => void)) => {
      React.useEffect(() => {
        let cleanup: void | (() => void);
        const changeFocus = (focused: boolean) => {
          cleanup?.();
          cleanup = focused ? callback() : undefined;
        };
        mockFocusListeners.add(changeFocus);
        if (mockFocused) changeFocus(true);
        return () => {
          cleanup?.();
          mockFocusListeners.delete(changeFocus);
        };
      }, [callback]);
    },
  };
});

const environment: WorkEnvironment = {
  id: 'demo-embedded-iot',
  name: 'IoT 연구실',
  workType: '특성 측정',
  deviceName: 'Orange Pi 5+',
};
const anotherEnvironment: WorkEnvironment = { ...environment, id: 'demo-circuits' };

function homeData(researcherName: string): StudentHomeData {
  return {
    researcherName,
    deviceStatus: 'unknown',
    ongoingSession: null,
    approvedProcedures: [],
    recentResults: [],
  };
}

function HomeHarness({
  selectedEnvironment = environment,
  loadHome,
}: {
  selectedEnvironment?: WorkEnvironment;
  loadHome: LoadStudentHome;
}) {
  const { lookup, reload } = useStudentHome(selectedEnvironment, loadHome);
  return (
    <>
      <Text>{lookup.status === 'ready' ? lookup.data.researcherName : lookup.status}</Text>
      <Button title="다시 조회" onPress={reload} />
    </>
  );
}

function setFocused(focused: boolean) {
  mockFocused = focused;
  mockFocusListeners.forEach((listener) => listener(focused));
}

beforeEach(() => {
  mockFocused = true;
});

afterEach(() => {
  jest.restoreAllMocks();
});

test('조회 중에는 로딩을 표시하고 성공한 홈 데이터를 전달한다', async () => {
  const pending = Promise.withResolvers<StudentHomeData>();
  const loadHome = jest.fn<LoadStudentHome>().mockReturnValue(pending.promise);
  const screen = await render(<HomeHarness loadHome={loadHome} />);

  expect(screen.getByText('loading')).toBeVisible();
  expect(loadHome).toHaveBeenCalledWith(environment);
  await act(async () => pending.resolve(homeData('준혁')));
  expect(screen.getByText('준혁')).toBeVisible();
});

test('조회 오류 후 재시도에서 로딩을 거쳐 홈을 다시 불러온다', async () => {
  const retry = Promise.withResolvers<StudentHomeData>();
  const loadHome = jest
    .fn<LoadStudentHome>()
    .mockRejectedValueOnce(new Error('조회 실패'))
    .mockReturnValueOnce(retry.promise);
  const screen = await render(<HomeHarness loadHome={loadHome} />);

  expect(screen.getByText('error')).toBeVisible();
  await fireEvent.press(screen.getByRole('button', { name: '다시 조회' }));
  expect(screen.getByText('loading')).toBeVisible();
  await act(async () => retry.resolve(homeData('재시도 결과')));
  expect(screen.getByText('재시도 결과')).toBeVisible();
  expect(loadHome).toHaveBeenCalledTimes(2);
});

test('환경 변경 시 이전 데이터를 숨기고 늦게 도착한 이전 환경의 응답을 무시한다', async () => {
  const oldRequest = Promise.withResolvers<StudentHomeData>();
  const newRequest = Promise.withResolvers<StudentHomeData>();
  const loadHome = jest
    .fn<LoadStudentHome>()
    .mockResolvedValueOnce(homeData('이전 홈'))
    .mockReturnValueOnce(oldRequest.promise)
    .mockReturnValueOnce(newRequest.promise);
  const screen = await render(<HomeHarness loadHome={loadHome} />);
  expect(screen.getByText('이전 홈')).toBeVisible();

  await fireEvent.press(screen.getByRole('button', { name: '다시 조회' }));
  expect(screen.queryByText('이전 홈')).toBeNull();
  await screen.rerender(
    <HomeHarness selectedEnvironment={anotherEnvironment} loadHome={loadHome} />,
  );
  await act(async () => oldRequest.resolve(homeData('오래된 응답')));
  expect(screen.getByText('loading')).toBeVisible();
  expect(screen.queryByText('오래된 응답')).toBeNull();

  await act(async () => newRequest.resolve(homeData('새 환경 홈')));
  expect(screen.getByText('새 환경 홈')).toBeVisible();
  expect(loadHome).toHaveBeenLastCalledWith(anotherEnvironment);
});

test('화면을 떠난 뒤 도착한 응답을 무시하고 다시 돌아오면 새로 조회한다', async () => {
  const blurredRequest = Promise.withResolvers<StudentHomeData>();
  const focusedRequest = Promise.withResolvers<StudentHomeData>();
  const loadHome = jest
    .fn<LoadStudentHome>()
    .mockReturnValueOnce(blurredRequest.promise)
    .mockReturnValueOnce(focusedRequest.promise);
  const screen = await render(<HomeHarness loadHome={loadHome} />);

  await act(async () => setFocused(false));
  await act(async () => blurredRequest.resolve(homeData('떠난 화면 응답')));
  expect(screen.queryByText('떠난 화면 응답')).toBeNull();
  await act(async () => setFocused(true));
  expect(loadHome).toHaveBeenCalledTimes(2);
  await act(async () => focusedRequest.resolve(homeData('갱신된 홈')));
  expect(screen.getByText('갱신된 홈')).toBeVisible();
});

test('앱이 다시 활성화되면 홈을 갱신하고 화면을 떠나면 구독을 해제한다', async () => {
  let notifyAppState: Parameters<typeof AppState.addEventListener>[1] | undefined;
  const remove = jest.fn();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, handler) => {
    notifyAppState = handler;
    return { remove };
  });
  const foregroundRequest = Promise.withResolvers<StudentHomeData>();
  const loadHome = jest
    .fn<LoadStudentHome>()
    .mockResolvedValueOnce(homeData('처음 홈'))
    .mockReturnValueOnce(foregroundRequest.promise);
  const screen = await render(<HomeHarness loadHome={loadHome} />);
  expect(screen.getByText('처음 홈')).toBeVisible();

  await act(async () => {
    notifyAppState?.('background');
    notifyAppState?.('active');
  });
  expect(screen.getByText('loading')).toBeVisible();
  expect(screen.queryByText('처음 홈')).toBeNull();
  await act(async () => foregroundRequest.resolve(homeData('복귀 후 홈')));
  expect(screen.getByText('복귀 후 홈')).toBeVisible();

  await screen.unmount();
  expect(remove).toHaveBeenCalledTimes(1);
});

test('합성 홈은 기존 세션과 승인 버전을 유지하며 빈 환경에는 작업을 만들지 않는다', async () => {
  const ongoingHome = await loadStudentHome(environment);
  const repeatedHome = await loadStudentHome(environment);
  const emptyHome = await loadStudentHome(anotherEnvironment);

  expect(ongoingHome.ongoingSession).toMatchObject({
    id: 'demo-session-led-m03',
    environmentId: environment.id,
    procedureVersion: 'v1.2',
    status: 'paused',
  });
  expect(repeatedHome.ongoingSession).toEqual(ongoingHome.ongoingSession);
  expect(emptyHome.ongoingSession).toBeNull();
  expect(emptyHome.approvedProcedures).toEqual([]);
  expect(emptyHome.recentResults).toEqual([]);
});
