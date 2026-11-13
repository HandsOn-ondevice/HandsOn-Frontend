import { expect, jest, test } from '@jest/globals';
import { act, fireEvent, render } from '@testing-library/react-native';

import type { WorkEnvironment } from '../src/features/entry/entryEnvironment';
import type { PreparationRequest } from '../src/features/procedures/PreparationHandoffProvider';
import { ProcedureDetailScreen } from '../src/features/procedures/ProcedureDetailScreen';
import { ProcedureListScreen } from '../src/features/procedures/ProcedureListScreen';
import type { ProcedureDetail, ProcedureSummary } from '../src/features/procedures/procedureModels';
import type { ProcedureRepository } from '../src/features/procedures/procedureRepository';

const environment: WorkEnvironment = {
  id: 'iot-lab',
  name: 'IoT 연구실',
  workType: '특성 측정',
  deviceName: 'Orange Pi 5+',
};
const procedure: ProcedureDetail = {
  id: 'led-characteristics',
  code: 'LED-M03',
  title: 'LED 출력 특성 측정',
  description: '출력 조건별 조도와 전력을 기록합니다.',
  approvedVersion: 'v1.2',
  approvedBy: '박지연',
  estimatedMinutes: 25,
  stepCount: 16,
  category: 'led',
  conditions: [{ label: '50%', repetitions: 3 }],
  equipment: ['BH1750'],
  criteria: [{ title: '전압 확인', description: '공급 전압 4.8–5.2 V' }],
  steps: ['전원 차단 후 배선 확인', '조건별 측정'],
  precautions: ['배선 전 전원을 차단하세요.'],
};
const selection = {
  procedureId: procedure.id,
  approvedVersion: procedure.approvedVersion,
  environmentId: environment.id,
};
const noop = () => {};

function createRepository() {
  return {
    list: jest.fn<ProcedureRepository['list']>().mockResolvedValue([procedure]),
    getDetail: jest.fn<ProcedureRepository['getDetail']>().mockResolvedValue(procedure),
  };
}

test('환경을 바꾼 뒤 늦게 도착한 이전 환경 목록은 새 목록과 선택을 덮어쓰지 않는다', async () => {
  const previous = Promise.withResolvers<readonly ProcedureSummary[]>();
  const nextEnvironment = { ...environment, id: 'circuits-lab', name: '전자회로 실험실' };
  const nextProcedure = { ...procedure, id: 'sensor-addresses', title: '센서 주소 점검' };
  const repository = createRepository();
  repository.list.mockReturnValueOnce(previous.promise).mockResolvedValueOnce([nextProcedure]);
  const onConfirm = jest.fn();
  const props = { onBack: noop, onConfirm, repository };
  const screen = await render(<ProcedureListScreen {...props} environment={environment} />);

  await screen.rerender(<ProcedureListScreen {...props} environment={nextEnvironment} />);
  await fireEvent.press(screen.getByRole('button', { name: /^센서 주소 점검, 승인,/ }));
  await act(async () => previous.resolve([procedure]));

  expect(screen.queryByText(procedure.title)).toBeNull();
  expect(screen.getByText(nextProcedure.title)).toBeVisible();
  await fireEvent.press(screen.getByRole('button', { name: '선택한 절차 확인' }));
  expect(onConfirm).toHaveBeenCalledWith(nextProcedure);
  expect(repository.list.mock.calls).toEqual([[environment.id], [nextEnvironment.id]]);
});

test('요청한 승인 버전과 다른 상세 응답은 표시하거나 준비 대상으로 전달하지 않는다', async () => {
  const repository = createRepository();
  repository.getDetail.mockResolvedValue({ ...procedure, approvedVersion: 'v1.3' });
  const onPrepare = jest.fn();
  const screen = await render(
    <ProcedureDetailScreen
      environment={environment}
      procedureId={procedure.id}
      approvedVersion={procedure.approvedVersion}
      onBack={noop}
      onPrepare={onPrepare}
      repository={repository}
    />,
  );

  expect(repository.getDetail).toHaveBeenCalledWith(selection);
  expect(screen.getByText('실행할 수 있는 승인 절차가 없어요.')).toBeVisible();
  const action = screen.getByRole('button', { name: '이 버전으로 준비 시작' });
  expect(action).toBeDisabled();
  await fireEvent.press(action);
  expect(onPrepare).not.toHaveBeenCalled();
  expect(repository.getDetail).toHaveBeenCalledTimes(1);
});

test('준비 시작은 같은 버전을 한 번 재확인한 뒤 변경 불가능한 환경 사본을 전달한다', async () => {
  const recheck = Promise.withResolvers<ProcedureDetail | null>();
  const repository = createRepository();
  repository.getDetail.mockResolvedValueOnce(procedure).mockReturnValueOnce(recheck.promise);
  const currentEnvironment = { ...environment };
  const onPrepare = jest.fn<(request: PreparationRequest) => void>();
  const screen = await render(
    <ProcedureDetailScreen
      environment={currentEnvironment}
      procedureId={procedure.id}
      approvedVersion={procedure.approvedVersion}
      onBack={noop}
      onPrepare={onPrepare}
      repository={repository}
    />,
  );
  const action = () => screen.getByRole('button', { name: '이 버전으로 준비 시작' });

  await fireEvent.press(action());
  await fireEvent.press(action());
  expect(action()).toBeDisabled();
  expect(repository.getDetail.mock.calls).toEqual([[selection], [selection]]);
  expect(onPrepare).not.toHaveBeenCalled();
  await act(async () => recheck.resolve(procedure));

  expect(onPrepare).toHaveBeenCalledTimes(1);
  const request = onPrepare.mock.calls[0][0];
  expect(request).toEqual({
    procedureId: procedure.id,
    approvedVersion: 'v1.2',
    environment,
  });
  expect(request.environment).not.toBe(currentEnvironment);
  expect(Object.isFrozen(request)).toBe(true);
  expect(Object.isFrozen(request.environment)).toBe(true);
  currentEnvironment.name = '이후 변경한 환경명';
  expect(request.environment.name).toBe(environment.name);
});

test.each([
  ['승인 취소 또는 환경 부적합', null],
  ['다른 승인 버전', { ...procedure, approvedVersion: 'v1.3' }],
] as const)('시작 재확인에서 %s 응답을 받으면 준비를 차단한다', async (_, response) => {
  const repository = createRepository();
  repository.getDetail.mockResolvedValueOnce(procedure).mockResolvedValueOnce(response);
  const onPrepare = jest.fn();
  const screen = await render(
    <ProcedureDetailScreen
      environment={environment}
      procedureId={procedure.id}
      approvedVersion={procedure.approvedVersion}
      onBack={noop}
      onPrepare={onPrepare}
      repository={repository}
    />,
  );
  const action = () => screen.getByRole('button', { name: '이 버전으로 준비 시작' });

  await fireEvent.press(action());
  expect(
    screen.getByText('선택한 절차·버전을 더 이상 준비할 수 없어요. 목록에서 다시 선택해 주세요.'),
  ).toBeVisible();
  expect(action()).toBeDisabled();
  await fireEvent.press(action());
  expect(onPrepare).not.toHaveBeenCalled();
  expect(repository.getDetail.mock.calls).toEqual([[selection], [selection]]);
  expect(screen.getByText('LED-M03 · 승인 버전 v1.2')).toBeVisible();
});

test('시작 재확인에 실패하면 안내 후 같은 승인 버전으로 다시 시도할 수 있다', async () => {
  const repository = createRepository();
  repository.getDetail
    .mockResolvedValueOnce(procedure)
    .mockRejectedValueOnce(new Error('연결 실패'))
    .mockResolvedValueOnce(procedure);
  const onPrepare = jest.fn();
  const screen = await render(
    <ProcedureDetailScreen
      environment={environment}
      procedureId={procedure.id}
      approvedVersion={procedure.approvedVersion}
      onBack={noop}
      onPrepare={onPrepare}
      repository={repository}
    />,
  );
  const action = () => screen.getByRole('button', { name: '이 버전으로 준비 시작' });

  await fireEvent.press(action());
  expect(screen.getByText('시작 가능 여부를 확인하지 못했어요. 다시 시도해 주세요.')).toBeVisible();
  expect(action()).toBeEnabled();
  expect(onPrepare).not.toHaveBeenCalled();

  await fireEvent.press(action());
  expect(onPrepare).toHaveBeenCalledWith({
    procedureId: procedure.id,
    approvedVersion: procedure.approvedVersion,
    environment,
  });
  expect(repository.getDetail.mock.calls).toEqual([[selection], [selection], [selection]]);
});

test.each(['화면 종료', '선택 변경'] as const)(
  '재확인 중 %s 후 늦게 도착한 응답은 준비 요청을 전달하지 않는다',
  async (transition) => {
    const recheck = Promise.withResolvers<ProcedureDetail | null>();
    const repository = createRepository();
    repository.getDetail
      .mockResolvedValueOnce(procedure)
      .mockReturnValueOnce(recheck.promise)
      .mockResolvedValueOnce({ ...procedure, approvedVersion: 'v1.3' });
    const onPrepare = jest.fn();
    const props = {
      environment,
      procedureId: procedure.id,
      approvedVersion: procedure.approvedVersion,
      onBack: noop,
      onPrepare,
      repository,
    };
    const screen = await render(<ProcedureDetailScreen {...props} />);
    await fireEvent.press(screen.getByRole('button', { name: '이 버전으로 준비 시작' }));

    if (transition === '화면 종료') {
      await screen.unmount();
    } else {
      await screen.rerender(<ProcedureDetailScreen {...props} approvedVersion="v1.3" />);
      expect(screen.getByText('LED-M03 · 승인 버전 v1.3')).toBeVisible();
    }
    await act(async () => recheck.resolve(procedure));
    expect(onPrepare).not.toHaveBeenCalled();
  },
);
