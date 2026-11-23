import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import type { ProcedureDetail } from '@/features/procedures/procedureModels';
import { getEdgeBaseUrl } from '@/lib/edgeApi';
import { createEdgeDraftRepository, type EdgeDraftMetadata } from './edgeProcedureDraft';
import { createDemoProcedureDraft } from './procedureDraftFixtures';
import { isProcedureDraftStepCriteria, type ProcedureDraftStepCriteria } from './stepCriteria';

export interface ProcedureDraftStepGroup {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly showRange?: boolean;
}

export interface ProcedureDraftStep {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly needsReview: boolean;
  readonly group?: ProcedureDraftStepGroup;
  readonly criteria?: ProcedureDraftStepCriteria;
}

export interface ProcedureDraftPendingItem {
  readonly id: string;
  readonly label: string;
  readonly stepId?: string;
}

export interface ProcedureDraft {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly version: string;
  readonly status: 'draft';
  readonly steps: readonly ProcedureDraftStep[];
  readonly materials: readonly string[];
  readonly precautions: readonly string[];
  readonly pendingItems: readonly ProcedureDraftPendingItem[];
  readonly savedAt: string | null;
  readonly edge?: EdgeDraftMetadata;
}

export interface ProcedureDraftRepository {
  load(environmentId: string, draftId: string): Promise<ProcedureDraft | null>;
  save(environmentId: string, draft: ProcedureDraft): Promise<ProcedureDraft>;
  saveStepCriteria(
    environmentId: string,
    draftId: string,
    stepId: string,
    criteria: ProcedureDraftStepCriteria,
  ): Promise<ProcedureDraft>;
  listSaved(environmentId: string): Promise<readonly ProcedureDraft[]>;
}

type StoredDraft = ProcedureDraft & { readonly release?: ProcedureDetail };

export {
  approveEdgeProcedureDraft,
  createEdgeProcedureDraft,
  isDraftRevisionConflict,
  isEdgeProcedureDraft,
  loadEdgeProcedureApproval,
  type EdgeDraftExecution,
} from './edgeProcedureDraft';
export { getDemoProcedureDraftId } from './procedureDraftFixtures';
export type { ProcedureDraftStepCriteria } from './stepCriteria';

function demoStorageKey(environmentId: string) {
  if (!environmentId.trim()) throw new Error('작업 환경을 선택해 주세요.');
  if (!__DEV__ && process.env.EXPO_PUBLIC_HANDSON_MAESTRO !== '1') {
    throw new Error('초안 API가 아직 연결되지 않았습니다.');
  }
  return `handson-procedure-drafts-v1-${encodeURIComponent(environmentId)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isStepGroup(value: unknown): value is ProcedureDraftStepGroup {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    typeof value.description === 'string' &&
    (value.showRange === undefined || typeof value.showRange === 'boolean')
  );
}

function isStoredRelease(value: unknown): value is ProcedureDetail {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.code === 'string' &&
    typeof value.title === 'string' &&
    typeof value.description === 'string' &&
    typeof value.approvedVersion === 'string' &&
    Boolean(value.approvedVersion.trim()) &&
    typeof value.approvedBy === 'string' &&
    (value.estimatedMinutes === null || Number.isFinite(value.estimatedMinutes)) &&
    Number.isSafeInteger(value.stepCount) &&
    value.category === 'led' &&
    isStringList(value.equipment) &&
    isStringList(value.steps) &&
    isStringList(value.precautions) &&
    Array.isArray(value.conditions) &&
    value.conditions.every(
      (condition) =>
        isRecord(condition) &&
        typeof condition.label === 'string' &&
        Number.isSafeInteger(condition.repetitions),
    ) &&
    Array.isArray(value.criteria) &&
    value.criteria.every(
      (criterion) =>
        isRecord(criterion) &&
        typeof criterion.title === 'string' &&
        typeof criterion.description === 'string',
    )
  );
}

function isStoredDraft(value: unknown): value is StoredDraft {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    typeof value.description === 'string' &&
    typeof value.version === 'string' &&
    value.status === 'draft' &&
    Array.isArray(value.steps) &&
    value.steps.every(
      (step) =>
        isRecord(step) &&
        typeof step.id === 'string' &&
        typeof step.title === 'string' &&
        typeof step.description === 'string' &&
        typeof step.needsReview === 'boolean' &&
        (step.group === undefined || isStepGroup(step.group)) &&
        (step.criteria === undefined || isProcedureDraftStepCriteria(step.criteria)),
    ) &&
    isStringList(value.materials) &&
    isStringList(value.precautions) &&
    Array.isArray(value.pendingItems) &&
    value.pendingItems.every(
      (item) =>
        isRecord(item) &&
        typeof item.id === 'string' &&
        typeof item.label === 'string' &&
        (item.stepId === undefined || typeof item.stepId === 'string'),
    ) &&
    typeof value.savedAt === 'string' &&
    Number.isFinite(Date.parse(value.savedAt)) &&
    (value.release === undefined || isStoredRelease(value.release))
  );
}

function readSavedDrafts(key: string): readonly StoredDraft[] {
  let stored: string | null;
  if (Platform.OS === 'web') {
    stored = globalThis.localStorage.getItem(key);
  } else {
    const current = new File(Paths.document, `${key}.json`);
    const file = current.exists ? current : new File(Paths.document, `${key}.previous`);
    stored = file.exists ? file.textSync() : null;
  }
  if (stored === null) return [];

  const parsed: unknown = JSON.parse(stored);
  if (!Array.isArray(parsed) || !parsed.every(isStoredDraft)) {
    throw new Error('저장된 초안 데이터를 불러올 수 없어요.');
  }
  return parsed;
}

function writeSavedDrafts(key: string, drafts: readonly StoredDraft[]) {
  const data = JSON.stringify(drafts);
  if (Platform.OS === 'web') {
    globalThis.localStorage.setItem(key, data);
    return;
  }

  const currentName = `${key}.json`;
  const previousName = `${key}.previous`;
  const current = new File(Paths.document, currentName);
  const previous = new File(Paths.document, previousName);
  const staging = new File(Paths.document, `${key}.tmp`);
  staging.writeSync(data);

  // Keep the last snapshot readable if publishing the new file is interrupted.
  if (current.exists) {
    if (previous.exists) previous.delete();
    current.rename(previousName);
  }
  staging.rename(currentName);
}

function storeDraft(key: string, saved: readonly StoredDraft[], draft: ProcedureDraft) {
  const snapshot: ProcedureDraft = { ...draft, savedAt: new Date().toISOString() };
  writeSavedDrafts(key, [snapshot, ...saved.filter(({ id }) => id !== draft.id)]);
  return snapshot;
}

export function findSavedDemoDraft(environmentId: string, draftId: string) {
  return readSavedDrafts(demoStorageKey(environmentId)).find(({ id }) => id === draftId) ?? null;
}

export function listDemoProcedureReleases(environmentId: string) {
  return readSavedDrafts(demoStorageKey(environmentId)).flatMap(({ id, release }) =>
    release ? [{ draftId: id, procedure: release }] : [],
  );
}

export function recordDemoProcedureRelease(
  environmentId: string,
  draftId: string,
  publish: (current: StoredDraft | null) => ProcedureDetail,
) {
  const key = demoStorageKey(environmentId);
  const saved = readSavedDrafts(key);
  const draft = saved.find(({ id }) => id === draftId);
  const release = publish(draft ?? null);

  // Keep the approved snapshot and its source draft in the same storage update.
  if (draft && !draft.release) {
    writeSavedDrafts(
      key,
      saved.map((item) => (item.id === draftId ? { ...item, release } : item)),
    );
  }
  return release;
}

export const procedureDraftRepository: ProcedureDraftRepository = {
  async load(environmentId, draftId) {
    const saved = findSavedDemoDraft(environmentId, draftId);
    if (saved) return saved.release ? null : saved;
    return createDemoProcedureDraft(environmentId, draftId);
  },
  async save(environmentId, draft) {
    const key = demoStorageKey(environmentId);
    const saved = readSavedDrafts(key);
    const previous = saved.find(({ id }) => id === draft.id);
    if (previous?.release) throw new Error('이미 승인·배포된 초안입니다.');
    const savedSteps = new Map(previous?.steps.map((step) => [step.id, step]));
    // The draft editor may still have the snapshot from before opening the criteria editor.
    const steps = draft.steps.map((step) => {
      const criteria = savedSteps.get(step.id)?.criteria;
      return criteria ? { ...step, criteria } : step;
    });
    return storeDraft(key, saved, { ...draft, steps });
  },
  async saveStepCriteria(environmentId, draftId, stepId, criteria) {
    if (!isProcedureDraftStepCriteria(criteria)) throw new Error('기준값 형식을 확인해 주세요.');

    const key = demoStorageKey(environmentId);
    const saved = readSavedDrafts(key);
    const draft = saved.find(({ id }) => id === draftId);
    if (!draft) throw new Error('저장된 초안을 찾을 수 없어요.');
    if (draft.release) throw new Error('이미 승인·배포된 초안입니다.');
    if (!draft.steps.some(({ id }) => id === stepId)) {
      throw new Error('선택한 단계를 찾을 수 없어요.');
    }

    const steps = draft.steps.map((step) => (step.id === stepId ? { ...step, criteria } : step));
    return storeDraft(key, saved, { ...draft, steps });
  },
  async listSaved(environmentId) {
    return readSavedDrafts(demoStorageKey(environmentId)).filter(({ release }) => !release);
  },
};

let activeEdgeRepository:
  { baseUrl: string; token?: string; repository: ProcedureDraftRepository } | undefined;

export function getProcedureDraftRepository(token?: string) {
  const baseUrl = getEdgeBaseUrl();
  if (!baseUrl) return procedureDraftRepository;
  if (
    !activeEdgeRepository ||
    activeEdgeRepository.baseUrl !== baseUrl ||
    activeEdgeRepository.token !== token
  ) {
    activeEdgeRepository = {
      baseUrl,
      token,
      repository: createEdgeDraftRepository(baseUrl, token),
    };
  }
  return activeEdgeRepository.repository;
}
