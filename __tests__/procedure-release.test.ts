import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import { Platform } from 'react-native';
import { loadWorkEnvironments } from '@/features/entry/entryEnvironment';
import { loadExpertHome } from '@/features/expert-home/expertHomeData';
import {
  getDemoProcedureDraftId,
  procedureDraftRepository,
} from '@/features/procedure-draft/procedureDraftRepository';
import { emptyProcedureDraftStepCriteria } from '@/features/procedure-draft/stepCriteria';
import {
  ProcedureReleaseRejected,
  procedureReleaseRepository,
} from '@/features/procedure-release/procedureReleaseRepository';
import { procedureRepository } from '@/features/procedures/procedureRepository';
import { MockWorkflowRepository } from '@/features/researcher-workflow/infrastructure/mock/MockWorkflowRepository';
import { loadStudentHome } from '@/features/student-home/studentHomeData';

const environmentId = 'demo-embedded-iot';
const draftId = getDemoProcedureDraftId(environmentId);
const storage = new Map<string, string>();

beforeEach(() => {
  jest.replaceProperty(Platform, 'OS', 'web');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, data: string) => storage.set(key, data),
    },
  });
});

afterEach(() => {
  jest.restoreAllMocks();
  Reflect.deleteProperty(globalThis, 'localStorage');
  storage.clear();
});

async function createSavedDraft() {
  const draft = await procedureDraftRepository.load(environmentId, draftId);
  if (!draft) throw new Error('Expected the LED draft fixture');
  return procedureDraftRepository.save(environmentId, draft);
}

const confirmations = { reviewConfirmed: true, equipmentConfirmed: true };
const checkedCriteria = { ...emptyProcedureDraftStepCriteria, equipmentVerified: true };

test('미확정 기준과 미확인 장비가 있으면 배포하지 않고 기존 승인 버전을 유지한다', async () => {
  const draft = await createSavedDraft();
  const review = await procedureReleaseRepository.load(environmentId, draftId);
  expect(review?.blockers).toEqual(
    expect.arrayContaining([
      '필수 기준 미확정 · 공급 전압 범위',
      '실장비 확인 필요 · 센서값 갱신 확인',
    ]),
  );
  await expect(
    procedureReleaseRepository.publish({ environmentId, draft, ...confirmations }),
  ).rejects.toBeInstanceOf(ProcedureReleaseRejected);
  expect(await procedureRepository.list(environmentId)).toEqual(
    expect.arrayContaining([expect.objectContaining({ approvedVersion: 'v1.2' })]),
  );
});

test('같은 배포 요청의 결과를 복원하고 목록을 갱신하며 앞서 시작한 세션 스냅샷을 유지한다', async () => {
  await createSavedDraft();
  const stale = await procedureDraftRepository.saveStepCriteria(
    environmentId,
    draftId,
    'power-range',
    {
      ...checkedCriteria,
      voltageMin: 4.9,
      voltageMax: 5.1,
      overcurrentLimit: 240,
    },
  );
  const draft = await procedureDraftRepository.saveStepCriteria(
    environmentId,
    draftId,
    'sensor-freshness',
    { ...checkedCriteria, freshnessLimit: 0 },
  );
  const review = await procedureReleaseRepository.load(environmentId, draftId);
  expect(review?.blockers).toEqual([]);
  await expect(
    procedureReleaseRepository.publish({ environmentId, draft: stale, ...confirmations }),
  ).rejects.toThrow('초안이 변경됐어요');
  await expect(
    procedureReleaseRepository.publish({
      environmentId,
      draft,
      ...confirmations,
      reviewConfirmed: false,
    }),
  ).rejects.toThrow('장비와 절차 검토를 모두 확인해 주세요');

  const [environment] = await loadWorkEnvironments();
  const before = await loadStudentHome(environment);
  const sessions = new MockWorkflowRepository();
  const sessionId = before.ongoingSession!.id;
  const session = await sessions.getSession(sessionId);

  const release = await procedureReleaseRepository.publish({
    environmentId,
    draft,
    ...confirmations,
  });
  expect(release.approvedVersion).toBe(review?.proposedVersion);
  expect(release.criteria).toContainEqual({
    title: '센서값 갱신 확인',
    description: '센서값 최대 경과 0초',
  });
  expect(
    await procedureReleaseRepository.publish({ environmentId, draft, ...confirmations }),
  ).toEqual(release);
  expect((await procedureReleaseRepository.load(environmentId, draftId))?.published).toEqual(
    release,
  );
  expect(await procedureDraftRepository.load(environmentId, draftId)).toBeNull();

  const selection = {
    environmentId,
    procedureId: release.id,
    approvedVersion: release.approvedVersion,
  };
  expect(await procedureRepository.getDetail(selection)).toEqual(release);
  expect(await procedureRepository.getDetail({ ...selection, approvedVersion: 'v1.2' })).toBeNull();
  expect(
    await procedureRepository.getDetail({ ...selection, environmentId: 'demo-circuits' }),
  ).toBeNull();

  const expert = await loadExpertHome(environmentId);
  expect(expert.procedures.find(({ id }) => id === draftId)).toBeUndefined();
  expect(expert.procedures.find(({ id }) => id === release.id)).toMatchObject({
    status: 'approved',
    version: release.approvedVersion,
  });
  const student = await loadStudentHome(environment);
  expect(student.approvedProcedures[0]).toMatchObject({
    id: release.id,
    version: release.approvedVersion,
  });
  expect(student.ongoingSession).toEqual(before.ongoingSession);
  expect(await sessions.getSession(sessionId)).toEqual(session);
});
