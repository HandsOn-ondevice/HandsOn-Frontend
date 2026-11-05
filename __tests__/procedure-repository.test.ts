import { expect, jest, test } from '@jest/globals';

import type { DemoProcedureEntry } from '../src/features/procedures/demoProcedures';
import type { ProcedureDetail } from '../src/features/procedures/procedureModels';
import {
  createDemoProcedureRepository,
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

test('기본 합성 카탈로그는 두 개발 환경에 승인 예시만 제공한다', async () => {
  const repository = createDemoProcedureRepository();

  for (const environmentId of ['demo-embedded-iot', 'demo-circuits']) {
    const procedures = await repository.list(environmentId);
    expect(procedures.map(({ id }) => id)).toEqual([
      'demo-led-characteristics',
      'demo-i2c-address-check',
    ]);
    expect(procedures[0]).toMatchObject({ approvedVersion: 'v1.2', stepCount: 16 });
  }
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
