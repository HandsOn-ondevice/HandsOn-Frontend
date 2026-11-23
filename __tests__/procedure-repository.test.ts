import { expect, jest, test } from '@jest/globals';

import { EdgeApiError, type EdgeApi } from '../src/lib/edgeApi';
import type { DemoProcedureEntry } from '../src/features/procedures/demoProcedures';
import type { ProcedureDetail } from '../src/features/procedures/procedureModels';
import {
  createDemoProcedureRepository,
  createEdgeProcedureRepository,
  procedureRepository,
} from '../src/features/procedures/procedureRepository';

const approved: ProcedureDetail = {
  id: 'led-measurement',
  code: 'LED-M03',
  title: 'LED 측정',
  description: '조도와 전력을 기록합니다.',
  approvedVersion: 'v1.2',
  approvedBy: '승인자',
  estimatedMinutes: 25,
  stepCount: 16,
  category: 'led',
  conditions: [],
  equipment: [],
  criteria: [],
  steps: [],
  precautions: [],
};

const catalog: readonly DemoProcedureEntry[] = [
  { status: 'approved', environmentIds: ['lab-a'], detail: approved },
  {
    status: 'draft',
    environmentIds: ['lab-a'],
    detail: { ...approved, id: 'draft' },
  },
  {
    status: 'revoked',
    environmentIds: ['lab-a'],
    detail: { ...approved, id: 'revoked' },
  },
  {
    status: 'approved',
    environmentIds: ['lab-b'],
    detail: { ...approved, id: 'other-lab' },
  },
];

const developmentGlobals = globalThis as typeof globalThis & { __DEV__: boolean };

const edgeSelection = {
  procedureId: 'kit-distance',
  approvedVersion: '1.0.0',
  environmentId: 'kit-lab',
};

const edgeProcedure = {
  procedureId: edgeSelection.procedureId,
  version: edgeSelection.approvedVersion,
  environmentId: edgeSelection.environmentId,
  approval: 'approved',
  title: '키트 거리 확인 절차',
  approvedBy: 'seed-expert',
  estimatedMinutes: 5,
  conditions: [{ label: '거리 배치 확인', repetitions: 3 }],
};

test('Edge 응답의 절차 ID·버전·승인자·예상 소요 시간과 조건을 표시 값으로 사용한다', async () => {
  const get = jest
    .fn<EdgeApi['get']>()
    .mockResolvedValueOnce([
      edgeProcedure,
      {
        ...edgeProcedure,
        procedureId: 'other-lab-procedure',
        environmentId: 'other-lab',
      },
    ])
    .mockResolvedValueOnce(edgeProcedure);
  const repository = createEdgeProcedureRepository({ get });
  const displayFields = {
    id: edgeSelection.procedureId,
    approvedVersion: edgeSelection.approvedVersion,
    title: edgeProcedure.title,
    approvedBy: edgeProcedure.approvedBy,
    estimatedMinutes: edgeProcedure.estimatedMinutes,
  };

  const list = await repository.list(edgeSelection.environmentId);
  expect(list).toHaveLength(1);
  expect(list[0]).toMatchObject(displayFields);
  await expect(repository.getDetail(edgeSelection)).resolves.toMatchObject({
    ...displayFields,
    conditions: edgeProcedure.conditions,
  });
  expect(get.mock.calls).toEqual([
    ['/procedures?environmentId=kit-lab'],
    ['/procedures/kit-distance?version=1.0.0'],
  ]);
});

test.each([
  { approval: 'revoked' },
  { procedureId: 'another-procedure' },
  { version: '2.0.0' },
  { environmentId: 'another-lab' },
])('선택한 승인 절차와 다른 Edge 상세 응답 %j을 준비 대상으로 표시하지 않는다', async (change) => {
  const get = jest.fn<EdgeApi['get']>().mockResolvedValue({ ...edgeProcedure, ...change });
  await expect(createEdgeProcedureRepository({ get }).getDetail(edgeSelection)).resolves.toBeNull();
});

test('Edge 상세의 버전 미발견과 서버 오류를 구분한다', async () => {
  const get = jest
    .fn<EdgeApi['get']>()
    .mockRejectedValueOnce(new EdgeApiError({ kind: 'server', status: 404 }))
    .mockRejectedValueOnce(new EdgeApiError({ kind: 'server', status: 503 }));
  const repository = createEdgeProcedureRepository({ get });

  await expect(repository.getDetail(edgeSelection)).resolves.toBeNull();
  await expect(repository.getDetail(edgeSelection)).rejects.toMatchObject({ status: 503 });
});

test('선택한 환경에 승인된 절차만 목록에 반환한다', async () => {
  const repository = createDemoProcedureRepository(catalog);
  const procedures = await repository.list('lab-a');

  expect(procedures.map(({ id }) => id)).toEqual(['led-measurement']);
  expect(procedures[0].approvedVersion).toBe('v1.2');
  expect(await repository.list('unknown-lab')).toEqual([]);
});

test('절차 식별자·승인 버전·환경이 모두 일치하는 승인 상세를 반환한다', async () => {
  const repository = createDemoProcedureRepository(catalog);

  expect(
    await repository.getDetail({
      procedureId: 'led-measurement',
      approvedVersion: 'v1.2',
      environmentId: 'lab-a',
    }),
  ).toEqual(approved);
  expect(
    await repository.getDetail({
      procedureId: 'led-measurement',
      approvedVersion: 'v1.2',
      environmentId: 'lab-b',
    }),
  ).toBeNull();
});

test.each(['draft', 'revoked', 'unknown'])(
  '%s 절차는 직접 상세를 요청해도 실행 대상으로 반환하지 않는다',
  async (procedureId) => {
    const repository = createDemoProcedureRepository(catalog);

    expect(
      await repository.getDetail({
        procedureId,
        approvedVersion: 'v1.2',
        environmentId: 'lab-a',
      }),
    ).toBeNull();
  },
);

test('요청한 승인 버전이 없으면 최신 버전으로 대체하지 않는다', async () => {
  const repository = createDemoProcedureRepository([
    {
      status: 'approved',
      environmentIds: ['lab-a'],
      detail: { ...approved, approvedVersion: 'v1.3' },
    },
  ]);

  expect(
    await repository.getDetail({
      procedureId: 'led-measurement',
      approvedVersion: 'v1.2',
      environmentId: 'lab-a',
    }),
  ).toBeNull();
});

test('새 버전이 함께 승인되어도 요청한 기존 승인 버전의 상세를 유지한다', async () => {
  const repository = createDemoProcedureRepository([
    ...catalog,
    {
      status: 'approved',
      environmentIds: ['lab-a'],
      detail: { ...approved, approvedVersion: 'v1.3' },
    },
  ]);

  const detail = await repository.getDetail({
    procedureId: 'led-measurement',
    approvedVersion: 'v1.2',
    environmentId: 'lab-a',
  });
  expect(detail?.approvedVersion).toBe('v1.2');
});

test('기본 합성 카탈로그는 연구생 홈과 같은 환경에 승인 예시를 제공한다', async () => {
  const repository = createDemoProcedureRepository();
  const procedures = await repository.list('demo-embedded-iot');

  expect(procedures.map(({ id }) => id)).toEqual([
    'demo-led-characteristics',
    'demo-i2c-address-check',
  ]);
  expect(procedures[0]).toMatchObject({ approvedVersion: 'v1.2', stepCount: 16 });
  expect(await repository.list('demo-circuits')).toEqual([]);
});

test('일반 배포 환경에서는 합성 목록과 상세를 반환하지 않고 미연동 오류를 알린다', async () => {
  const development = jest.replaceProperty(developmentGlobals, '__DEV__', false);
  const environment = jest.replaceProperty(process, 'env', {
    ...process.env,
    EXPO_PUBLIC_HANDSON_MAESTRO: undefined,
  });
  try {
    await expect(procedureRepository.list('demo-embedded-iot')).rejects.toThrow(
      '절차 API가 아직 연결되지 않았습니다.',
    );
    await expect(
      procedureRepository.getDetail({
        procedureId: 'demo-led-characteristics',
        approvedVersion: 'v1.2',
        environmentId: 'demo-embedded-iot',
      }),
    ).rejects.toThrow('절차 API가 아직 연결되지 않았습니다.');
  } finally {
    environment.restore();
    development.restore();
  }
});

test('개발 빌드에서는 합성 목록과 선택한 버전의 상세를 제공한다', async () => {
  const development = jest.replaceProperty(developmentGlobals, '__DEV__', true);
  try {
    const procedures = await procedureRepository.list('demo-embedded-iot');
    expect(procedures).toHaveLength(2);
    expect(
      await procedureRepository.getDetail({
        procedureId: procedures[0].id,
        approvedVersion: procedures[0].approvedVersion,
        environmentId: 'demo-embedded-iot',
      }),
    ).toMatchObject({ id: 'demo-led-characteristics', approvedVersion: 'v1.2' });
  } finally {
    development.restore();
  }
});
