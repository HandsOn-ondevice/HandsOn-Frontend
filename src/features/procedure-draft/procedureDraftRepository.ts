import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import { createDemoProcedureDraft } from './procedureDraftFixtures';

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
}

export interface ProcedureDraftRepository {
  load(environmentId: string, draftId: string): Promise<ProcedureDraft | null>;
  save(environmentId: string, draft: ProcedureDraft): Promise<ProcedureDraft>;
  listSaved(environmentId: string): Promise<readonly ProcedureDraft[]>;
}

export { getDemoProcedureDraftId } from './procedureDraftFixtures';

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

function isStoredDraft(value: unknown): value is ProcedureDraft {
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
        (step.group === undefined || isStepGroup(step.group)),
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
    Number.isFinite(Date.parse(value.savedAt))
  );
}

function readSavedDrafts(key: string): readonly ProcedureDraft[] {
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

function writeSavedDrafts(key: string, drafts: readonly ProcedureDraft[]) {
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

export const procedureDraftRepository: ProcedureDraftRepository = {
  async load(environmentId, draftId) {
    const saved = readSavedDrafts(demoStorageKey(environmentId));
    return (
      saved.find((draft) => draft.id === draftId) ??
      createDemoProcedureDraft(environmentId, draftId)
    );
  },
  async save(environmentId, draft) {
    const key = demoStorageKey(environmentId);
    const saved = readSavedDrafts(key);
    const snapshot: ProcedureDraft = { ...draft, savedAt: new Date().toISOString() };
    writeSavedDrafts(key, [snapshot, ...saved.filter((item) => item.id !== draft.id)]);
    return snapshot;
  },
  async listSaved(environmentId) {
    return readSavedDrafts(demoStorageKey(environmentId));
  },
};
