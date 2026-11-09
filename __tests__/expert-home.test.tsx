import { expect, jest, test } from '@jest/globals';
import { act, fireEvent, render } from '@testing-library/react-native';

import { ExpertHomeScreen } from '../src/features/expert-home/ExpertHomeScreen';
import type { WorkEnvironment } from '../src/features/entry/entryEnvironment';
import type { ExpertHomeData, LoadExpertHome } from '../src/features/expert-home/expertHomeData';

jest.mock('expo-router', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  type MockFocusEffect = () => void | (() => void);
  const listeners = new Map<MockFocusEffect, ReturnType<MockFocusEffect>>();
  let focused = true;
  return {
    useFocusEffect: (effect: MockFocusEffect) => {
      React.useEffect(() => {
        listeners.set(effect, focused ? effect() : undefined);
        return () => {
          listeners.get(effect)?.();
          listeners.delete(effect);
        };
      }, [effect]);
    },
    __blur: () => {
      focused = false;
      for (const [effect, cleanup] of listeners) {
        cleanup?.();
        listeners.set(effect, undefined);
      }
    },
    __focus: () => {
      if (focused) return;
      focused = true;
      for (const [effect] of listeners) listeners.set(effect, effect());
    },
  };
});

const environment: WorkEnvironment = {
  id: 'lab-a',
  name: 'IoT 연구실',
  workType: '특성 측정',
  deviceName: 'Orange Pi 5+',
};

const home: ExpertHomeData = {
  displayName: '지연',
  procedures: [
    {
      id: 'draft-42',
      title: 'LED 출력 특성 측정 초안',
      status: 'draft',
      version: 'v0.1',
      updatedLabel: '8분 전',
      summary: '미확정 기준 3개',
      detail: '기준값 검토 필요',
    },
    {
      id: 'approved-17',
      title: '센서 교정 절차',
      status: 'approved',
      version: 'v1.2',
      updatedLabel: '어제',
      summary: '승인된 측정 절차',
    },
  ],
  results: [
    {
      id: 'result-93',
      procedureId: 'approved-17',
      procedureTitle: '센서 교정 절차',
      studentName: '노준혁',
      deviceName: 'LED-M03',
      status: 'pending',
      summary: '보류 1건 · 재측정 2회 · v1.2',
      submittedLabel: '5분 전',
    },
    {
      id: 'result-94',
      procedureId: 'approved-17',
      procedureTitle: '센서 교정 절차',
      studentName: '김민지',
      deviceName: 'LED-M02',
      status: 'reviewed',
      summary: '검토를 마쳤어요',
      submittedLabel: '어제',
    },
  ],
  recentWork: [
    {
      id: 'recent-draft',
      kind: 'procedure',
      procedureId: 'draft-42',
      title: '최근 작성한 초안',
      summary: '작성 중',
      updatedLabel: '8분 전',
    },
    {
      id: 'recent-result',
      kind: 'result',
      resultId: 'result-94',
      procedureId: 'approved-17',
      title: '최근 검토한 결과',
      summary: '검토 완료',
      updatedLabel: '어제',
    },
  ],
};

function props(loadHome: LoadExpertHome) {
  return {
    environment,
    loadHome,
    onOpenTask: jest.fn(),
    onChangeEnvironment: jest.fn(),
  };
}

test('현황을 상태별로 집계하고 초안·결과·최근 작업의 식별자를 전달한다', async () => {
  const loadHome = jest.fn<LoadExpertHome>().mockResolvedValue(home);
  const callbacks = props(loadHome);
  const screen = await render(<ExpertHomeScreen {...callbacks} />);

  expect(loadHome).toHaveBeenCalledWith(environment.id);
  expect(screen.getByRole('button', { name: '초안, 1, 개' })).toBeVisible();
  expect(screen.getByRole('button', { name: '결과 검토, 1, 건' })).toBeVisible();
  expect(screen.getByRole('button', { name: '승인 절차, 1, 개' })).toBeVisible();

  await fireEvent.press(screen.getByRole('button', { name: '새 절차 음성으로 만들기' }));
  expect(callbacks.onOpenTask).toHaveBeenLastCalledWith({ kind: 'create' });
  await fireEvent.press(screen.getByRole('button', { name: /LED 출력 특성 측정 초안/ }));
  expect(callbacks.onOpenTask).toHaveBeenLastCalledWith({
    kind: 'procedure',
    procedureId: 'draft-42',
  });
  await fireEvent.press(screen.getByRole('button', { name: /노준혁.*LED-M03/ }));
  expect(callbacks.onOpenTask).toHaveBeenLastCalledWith({
    kind: 'result',
    resultId: 'result-93',
    procedureId: 'approved-17',
  });
  await fireEvent.press(screen.getByRole('button', { name: /최근 작성한 초안/ }));
  expect(callbacks.onOpenTask).toHaveBeenLastCalledWith({
    kind: 'procedure',
    procedureId: 'draft-42',
  });
  await fireEvent.press(screen.getByRole('button', { name: /최근 검토한 결과/ }));
  expect(callbacks.onOpenTask).toHaveBeenLastCalledWith({
    kind: 'result',
    resultId: 'result-94',
    procedureId: 'approved-17',
  });
});

test('초안과 승인 절차, 검토 대기와 완료 결과를 각각 필터링한다', async () => {
  const screen = await render(<ExpertHomeScreen {...props(async () => home)} />);

  await fireEvent.press(screen.getByRole('tab', { name: '절차' }));
  expect(screen.getByRole('button', { name: /LED 출력 특성 측정 초안/ })).toBeVisible();
  expect(screen.queryByRole('button', { name: /센서 교정 절차/ })).toBeNull();
  await fireEvent.press(screen.getByRole('radio', { name: '승인 절차' }));
  expect(screen.getByRole('button', { name: /센서 교정 절차/ })).toBeVisible();
  expect(screen.queryByRole('button', { name: /LED 출력 특성 측정 초안/ })).toBeNull();

  await fireEvent.press(screen.getByRole('tab', { name: '현황' }));
  expect(screen.getByRole('button', { name: /노준혁.*LED-M03/ })).toBeVisible();
  expect(screen.queryByRole('button', { name: /김민지.*LED-M02/ })).toBeNull();
  await fireEvent.press(screen.getByRole('radio', { name: '검토 완료' }));
  expect(screen.getByRole('button', { name: /김민지.*LED-M02/ })).toBeVisible();
  expect(screen.queryByRole('button', { name: /노준혁.*LED-M03/ })).toBeNull();
});

test('조회 실패와 재시도 로딩 중에도 새 절차를 시작하고 성공 응답으로 목록을 갱신한다', async () => {
  const retry = Promise.withResolvers<ExpertHomeData>();
  const loadHome = jest
    .fn<LoadExpertHome>()
    .mockRejectedValueOnce(new Error('조회 실패'))
    .mockReturnValueOnce(retry.promise);
  const callbacks = props(loadHome);
  const screen = await render(<ExpertHomeScreen {...callbacks} />);
  const create = () => screen.getByRole('button', { name: '새 절차 음성으로 만들기' });

  expect(screen.getByText('작업 현황을 불러오지 못했어요.')).toBeVisible();
  expect(create()).toBeEnabled();
  await fireEvent.press(create());
  expect(callbacks.onOpenTask).toHaveBeenLastCalledWith({ kind: 'create' });
  await fireEvent.press(screen.getByRole('button', { name: '다시 시도' }));
  expect(screen.getByText('작업 현황을 불러오는 중이에요.')).toBeVisible();
  expect(create()).toBeEnabled();
  expect(screen.queryByRole('button', { name: /LED 출력 특성 측정 초안/ })).toBeNull();
  await act(async () => retry.resolve(home));
  expect(screen.getByRole('button', { name: /LED 출력 특성 측정 초안/ })).toBeVisible();
  expect(loadHome).toHaveBeenCalledTimes(2);
});

test('빈 목록에서도 새 절차 작성과 작업 환경 변경이 가능하다', async () => {
  const callbacks = props(async () => ({ ...home, procedures: [], results: [], recentWork: [] }));
  const screen = await render(<ExpertHomeScreen {...callbacks} />);

  expect(screen.getByText('확인할 항목이 없어요.')).toBeVisible();
  expect(screen.queryByText('작업 현황을 불러오지 못했어요.')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: '새 절차 음성으로 만들기' }));
  expect(callbacks.onOpenTask).toHaveBeenCalledWith({ kind: 'create' });
  expect(screen.queryByRole('button', { name: /LED 출력 특성 측정 초안/ })).toBeNull();
  await fireEvent.press(screen.getByRole('tab', { name: '내 정보' }));
  await fireEvent.press(screen.getByRole('button', { name: '역할·작업 환경 변경' }));
  expect(callbacks.onChangeEnvironment).toHaveBeenCalledTimes(1);
});

test('이전 환경의 늦은 응답이 현재 환경의 목록을 덮어쓰지 않는다', async () => {
  const old = Promise.withResolvers<ExpertHomeData>();
  const loadHome = jest
    .fn<LoadExpertHome>()
    .mockReturnValueOnce(old.promise)
    .mockResolvedValueOnce({ ...home, procedures: [], results: [], recentWork: [] });
  const callbacks = props(loadHome);
  const screen = await render(<ExpertHomeScreen {...callbacks} />);
  await screen.rerender(
    <ExpertHomeScreen {...callbacks} environment={{ ...environment, id: 'lab-b' }} />,
  );
  await act(async () => old.resolve(home));

  expect(loadHome).toHaveBeenLastCalledWith('lab-b');
  expect(screen.queryByRole('button', { name: /LED 출력 특성 측정 초안/ })).toBeNull();
});

test('화면을 떠난 뒤의 응답은 무시하고 홈으로 복귀하면 현황을 다시 조회한다', async () => {
  const navigation = jest.requireMock<{ __blur: () => void; __focus: () => void }>('expo-router');
  const first = Promise.withResolvers<ExpertHomeData>();
  const updatedHome: ExpertHomeData = {
    ...home,
    procedures: [{ ...home.procedures[0], title: '복귀 후 갱신된 초안' }],
    recentWork: [],
  };
  const loadHome = jest
    .fn<LoadExpertHome>()
    .mockReturnValueOnce(first.promise)
    .mockResolvedValueOnce(updatedHome);
  const screen = await render(<ExpertHomeScreen {...props(loadHome)} />);

  await act(async () => navigation.__blur());
  await act(async () => first.resolve(home));
  expect(screen.queryByRole('button', { name: /LED 출력 특성 측정 초안/ })).toBeNull();
  await act(async () => navigation.__focus());

  expect(loadHome).toHaveBeenCalledTimes(2);
  expect(screen.getByRole('button', { name: /복귀 후 갱신된 초안/ })).toBeVisible();
  expect(screen.queryByRole('button', { name: /LED 출력 특성 측정 초안/ })).toBeNull();
});
