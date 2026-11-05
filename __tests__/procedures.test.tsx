import { expect, jest, test } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react-native';

import type { WorkEnvironment } from '../src/features/entry/entryEnvironment';
import { ProcedureDetailView } from '../src/features/procedures/ProcedureDetailView';
import { ProcedureListView } from '../src/features/procedures/ProcedureListView';
import type {
  ProcedureDetail,
  ProcedureLookup,
  ProcedureSummary,
} from '../src/features/procedures/procedureModels';

const environment: WorkEnvironment = {
  id: 'iot-lab',
  name: 'IoT 연구실',
  workType: '특성 측정',
  deviceName: 'Orange Pi 5+',
};

const led: ProcedureDetail = {
  id: 'led-characteristics',
  code: 'LED-M03',
  title: 'LED 출력 특성 측정',
  description: '출력 조건을 바꾸며 조도와 전력을 기록합니다.',
  approvedVersion: 'v1.2',
  approvedBy: '박지연',
  estimatedMinutes: 25,
  stepCount: 16,
  category: 'led',
  conditions: [{ label: '50%', repetitions: 3 }],
  equipment: ['BH1750', 'INA219'],
  criteria: [{ title: '공급 전압 4.8–5.2 V', description: '250 mA 초과 시 보류' }],
  steps: ['장비 연결 확인', '조건별 측정'],
  precautions: ['배선 전 전원을 차단하세요.'],
};

const sensor: ProcedureSummary = {
  ...led,
  id: 'sensor-addresses',
  title: 'I2C 센서 주소 점검',
  approvedVersion: 'v1.0',
  category: 'sensor',
};

const noop = () => {};

test('선택 전에는 진행을 막고 선택한 절차와 승인 버전을 그대로 확인 콜백에 전달한다', async () => {
  const onConfirm = jest.fn();
  const screen = await render(
    <ProcedureListView
      environment={environment}
      lookup={{ status: 'ready', data: [led, sensor] }}
      onBack={noop}
      onRetry={noop}
      onConfirm={onConfirm}
    />,
  );
  const action = () => screen.getByRole('button', { name: '선택한 절차 확인' });

  expect(action()).toBeDisabled();
  await fireEvent.press(action());
  expect(onConfirm).not.toHaveBeenCalled();

  await fireEvent.press(screen.getByRole('button', { name: /^LED 출력 특성 측정, 승인,/ }));
  expect(action()).toBeEnabled();
  await fireEvent.press(action());
  expect(onConfirm).toHaveBeenCalledWith(led);
});

test('필터를 바꾸면 이전 선택을 해제하고 빈 필터에서 전체 목록으로 돌아갈 수 있다', async () => {
  const onConfirm = jest.fn();
  const screen = await render(
    <ProcedureListView
      environment={environment}
      lookup={{ status: 'ready', data: [led, sensor] }}
      onBack={noop}
      onRetry={noop}
      onConfirm={onConfirm}
    />,
  );
  const action = () => screen.getByRole('button', { name: '선택한 절차 확인' });

  await fireEvent.press(screen.getByRole('button', { name: /^LED 출력 특성 측정, 승인,/ }));
  await fireEvent.press(screen.getByRole('radio', { name: '센서 점검' }));
  expect(action()).toBeDisabled();
  expect(screen.queryByText(led.title)).toBeNull();
  expect(screen.getByText(sensor.title)).toBeVisible();

  await fireEvent.press(screen.getByRole('radio', { name: '최근 사용' }));
  expect(screen.getByText('필터에 맞는 승인 절차가 없어요.')).toBeVisible();
  await fireEvent.press(action());
  expect(onConfirm).not.toHaveBeenCalled();

  await fireEvent.press(screen.getByRole('button', { name: '전체 절차 보기' }));
  expect(screen.getByText(led.title)).toBeVisible();
  expect(screen.getByText(sensor.title)).toBeVisible();
  expect(action()).toBeDisabled();
});

test('목록이 다른 승인 버전으로 갱신되어도 기존 선택을 최신 버전 선택으로 바꾸지 않는다', async () => {
  const onConfirm = jest.fn();
  const props = { environment, onBack: noop, onRetry: noop, onConfirm };
  const screen = await render(
    <ProcedureListView {...props} lookup={{ status: 'ready', data: [led] }} />,
  );
  await fireEvent.press(screen.getByRole('button', { name: /^LED 출력 특성 측정, 승인,/ }));

  await screen.rerender(
    <ProcedureListView
      {...props}
      lookup={{ status: 'ready', data: [{ ...led, approvedVersion: 'v1.3' }] }}
    />,
  );
  const action = screen.getByRole('button', { name: '선택한 절차 확인' });
  expect(action).toBeDisabled();
  await fireEvent.press(action);
  expect(onConfirm).not.toHaveBeenCalled();
});

test.each([
  [{ status: 'loading' }, '승인 절차를 불러오는 중', undefined],
  [{ status: 'error' }, '승인 절차를 불러오지 못했어요.', '다시 시도'],
  [{ status: 'ready', data: [] }, '이 작업 환경에 승인된 절차가 없어요.', '새로고침'],
] as const)(
  '목록 %j 상태에서 확인을 차단하고 필요한 재조회를 제공한다',
  async (lookup, message, retryLabel) => {
    const onConfirm = jest.fn();
    const onRetry = jest.fn();
    const screen = await render(
      <ProcedureListView
        environment={environment}
        lookup={lookup}
        onBack={noop}
        onRetry={onRetry}
        onConfirm={onConfirm}
      />,
    );
    const action = screen.getByRole('button', { name: '선택한 절차 확인' });
    expect(screen.getByText(message)).toBeVisible();
    expect(action).toBeDisabled();
    await fireEvent.press(action);
    expect(onConfirm).not.toHaveBeenCalled();
    if (retryLabel) {
      await fireEvent.press(screen.getByRole('button', { name: retryLabel }));
      expect(onRetry).toHaveBeenCalledTimes(1);
    }
  },
);

test('상세에 선택한 승인 버전과 조건·장비·단계·주의사항을 표시하고 준비 시작을 요청한다', async () => {
  const onStart = jest.fn();
  const screen = await render(
    <ProcedureDetailView
      lookup={{ status: 'ready', data: led }}
      onBack={noop}
      onRetry={noop}
      onStart={onStart}
    />,
  );

  expect(screen.getByText('LED-M03 · 승인 버전 v1.2')).toBeVisible();
  expect(screen.getByText('50%')).toBeVisible();
  expect(screen.getByText('3회')).toBeVisible();
  expect(screen.getByText('BH1750')).toBeVisible();
  expect(screen.getByText('공급 전압 4.8–5.2 V')).toBeVisible();
  expect(screen.getByText('장비 연결 확인')).toBeVisible();
  expect(screen.getByText('배선 전 전원을 차단하세요.')).toBeVisible();
  expect(screen.getByText('세션을 시작하면 완료할 때까지 절차 v1.2를 유지합니다.')).toBeVisible();

  await fireEvent.press(screen.getByRole('button', { name: '이 버전으로 준비 시작' }));
  expect(onStart).toHaveBeenCalledTimes(1);
});

test.each([
  { status: 'loading' },
  { status: 'error' },
  { status: 'ready', data: null },
] satisfies ProcedureLookup<ProcedureDetail | null>[])(
  '상세 %j 상태에서는 준비를 시작하지 않는다',
  async (lookup) => {
    const onStart = jest.fn();
    const onRetry = jest.fn();
    const screen = await render(
      <ProcedureDetailView lookup={lookup} onBack={noop} onRetry={onRetry} onStart={onStart} />,
    );
    const action = screen.getByRole('button', { name: '이 버전으로 준비 시작' });
    expect(action).toBeDisabled();
    await fireEvent.press(action);
    expect(onStart).not.toHaveBeenCalled();
    if (lookup.status === 'error') {
      await fireEvent.press(screen.getByRole('button', { name: '다시 시도' }));
      expect(onRetry).toHaveBeenCalledTimes(1);
    }
  },
);

test('선택 후 실행할 수 없게 된 절차는 안내를 표시하고 준비 시작을 차단한다', async () => {
  const onStart = jest.fn();
  const blockedReason = '선택한 버전의 승인이 취소되었어요.';
  const screen = await render(
    <ProcedureDetailView
      lookup={{ status: 'ready', data: led }}
      onBack={noop}
      onRetry={noop}
      onStart={onStart}
      blockedReason={blockedReason}
    />,
  );
  expect(screen.getByText(blockedReason)).toBeVisible();
  const action = screen.getByRole('button', { name: '이 버전으로 준비 시작' });
  expect(action).toBeDisabled();
  await fireEvent.press(action);
  expect(onStart).not.toHaveBeenCalled();
});

test('준비 시작 요청 중에는 중복 요청을 차단한다', async () => {
  const onStart = jest.fn();
  const screen = await render(
    <ProcedureDetailView
      lookup={{ status: 'ready', data: led }}
      onBack={noop}
      onRetry={noop}
      onStart={onStart}
      starting
    />,
  );
  const action = screen.getByRole('button', { name: '이 버전으로 준비 시작' });
  expect(action).toBeDisabled();
  await fireEvent.press(action);
  expect(onStart).not.toHaveBeenCalled();
});
