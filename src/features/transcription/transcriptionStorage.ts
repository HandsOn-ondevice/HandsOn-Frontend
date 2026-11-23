import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

export interface SavedTranscription {
  originalText: string;
  editedText: string;
  confirmedText?: string;
  draftRequestId?: string;
  draftId?: string;
}

export interface SavedEdgeTranscription {
  baseUrl: string;
  serverRecordingId: string;
  attempt: number;
  taskId?: string;
  transcript?: SavedTranscription;
}

export interface TranscriptionStorage {
  load(recordingId: string): Promise<SavedTranscription | null>;
  save(recordingId: string, transcription: SavedTranscription): Promise<void>;
  remove(recordingId: string): Promise<void>;
}

function storageKey(recordingId: string, edge = false) {
  if (!/^recording-\d+-[a-z0-9]{8}$/.test(recordingId)) {
    throw new Error('녹음 ID를 확인할 수 없어요.');
  }
  return `handson-${edge ? 'edge-' : ''}transcription-v1-${recordingId}`;
}

function invalidSnapshot(): never {
  throw new Error('저장한 변환 텍스트를 불러올 수 없어요.');
}

function readSnapshot(key: string, recordingId: string) {
  let value: string | null;
  if (Platform.OS === 'web') {
    value = globalThis.localStorage.getItem(key);
  } else {
    const current = new File(Paths.document, `${key}.json`);
    const file = current.exists ? current : new File(Paths.document, `${key}.previous`);
    value = file.exists ? file.textSync() : null;
  }
  if (value === null) return null;
  const stored: unknown = JSON.parse(value);
  if (!stored || typeof stored !== 'object' || !('recordingId' in stored)) invalidSnapshot();
  if (stored.recordingId !== recordingId) invalidSnapshot();
  return stored;
}

function writeSnapshot(key: string, snapshot: object) {
  const content = JSON.stringify(snapshot);
  if (Platform.OS === 'web') {
    globalThis.localStorage.setItem(key, content);
    return;
  }

  const currentName = `${key}.json`;
  const previousName = `${key}.previous`;
  const current = new File(Paths.document, currentName);
  const previous = new File(Paths.document, previousName);
  const staging = new File(Paths.document, `${key}.tmp`);
  staging.writeSync(content);

  // Keep the last saved snapshot readable if publishing the next one is interrupted.
  if (current.exists) {
    if (previous.exists) previous.delete();
    current.rename(previousName);
  }
  staging.rename(currentName);
}

function removeSnapshot(key: string) {
  if (Platform.OS === 'web') {
    globalThis.localStorage.removeItem(key);
    return;
  }
  for (const suffix of ['tmp', 'previous', 'json']) {
    const file = new File(Paths.document, `${key}.${suffix}`);
    if (file.exists) file.delete();
  }
}

function parseTranscription(stored: unknown): SavedTranscription {
  if (
    !stored ||
    typeof stored !== 'object' ||
    !('originalText' in stored) ||
    typeof stored.originalText !== 'string' ||
    !stored.originalText.trim() ||
    !('editedText' in stored) ||
    typeof stored.editedText !== 'string'
  )
    invalidSnapshot();

  const text: SavedTranscription = {
    originalText: stored.originalText,
    editedText: stored.editedText,
  };
  if ('confirmedText' in stored) {
    if (typeof stored.confirmedText !== 'string' || !stored.confirmedText.trim()) invalidSnapshot();
    text.confirmedText = stored.confirmedText;
  }
  if ('draftRequestId' in stored) {
    if (!text.confirmedText || typeof stored.draftRequestId !== 'string' || !stored.draftRequestId)
      invalidSnapshot();
    text.draftRequestId = stored.draftRequestId;
  }
  if ('draftId' in stored) {
    if (!text.draftRequestId || typeof stored.draftId !== 'string' || !stored.draftId)
      invalidSnapshot();
    text.draftId = stored.draftId;
  }
  return text;
}

export const transcriptionStorage: TranscriptionStorage = {
  async load(recordingId) {
    const snapshot = readSnapshot(storageKey(recordingId), recordingId);
    return snapshot && parseTranscription(snapshot);
  },
  async save(recordingId, transcription) {
    writeSnapshot(storageKey(recordingId), { ...transcription, recordingId });
  },
  async remove(recordingId) {
    removeSnapshot(storageKey(recordingId));
  },
};

export const edgeTranscriptionStorage = {
  load(recordingId: string, baseUrl: string): SavedEdgeTranscription | null {
    const snapshot = readSnapshot(storageKey(recordingId, true), recordingId);
    if (!snapshot || !('baseUrl' in snapshot) || snapshot.baseUrl !== baseUrl) return null;
    if (
      !('serverRecordingId' in snapshot) ||
      typeof snapshot.serverRecordingId !== 'string' ||
      !snapshot.serverRecordingId ||
      !('attempt' in snapshot) ||
      typeof snapshot.attempt !== 'number' ||
      !Number.isSafeInteger(snapshot.attempt) ||
      snapshot.attempt < 1
    )
      invalidSnapshot();

    const { serverRecordingId, attempt } = snapshot;
    const taskId = 'taskId' in snapshot ? snapshot.taskId : undefined;
    if (taskId !== undefined && (typeof taskId !== 'string' || !taskId)) invalidSnapshot();
    return {
      baseUrl,
      serverRecordingId,
      attempt,
      taskId,
      transcript: 'transcript' in snapshot ? parseTranscription(snapshot.transcript) : undefined,
    };
  },
  save(recordingId: string, progress: SavedEdgeTranscription) {
    writeSnapshot(storageKey(recordingId, true), { ...progress, recordingId });
  },
  remove(recordingId: string) {
    removeSnapshot(storageKey(recordingId, true));
  },
};
