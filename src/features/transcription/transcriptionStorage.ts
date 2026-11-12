import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

export interface SavedTranscription {
  originalText: string;
  editedText: string;
}

export interface TranscriptionStorage {
  load(recordingId: string): Promise<SavedTranscription | null>;
  save(recordingId: string, transcription: SavedTranscription): Promise<void>;
  remove(recordingId: string): Promise<void>;
}

function storageKey(recordingId: string) {
  if (!/^recording-\d+-[a-z0-9]{8}$/.test(recordingId)) {
    throw new Error('녹음 ID를 확인할 수 없어요.');
  }
  return `handson-transcription-v1-${recordingId}`;
}

function parseTranscription(value: string | null, recordingId: string): SavedTranscription | null {
  if (value === null) return null;

  const stored: unknown = JSON.parse(value);
  if (
    typeof stored !== 'object' ||
    stored === null ||
    !('recordingId' in stored) ||
    stored.recordingId !== recordingId ||
    !('originalText' in stored) ||
    typeof stored.originalText !== 'string' ||
    !stored.originalText.trim() ||
    !('editedText' in stored) ||
    typeof stored.editedText !== 'string'
  ) {
    throw new Error('저장한 변환 텍스트를 불러올 수 없어요.');
  }

  return { originalText: stored.originalText, editedText: stored.editedText };
}

export const transcriptionStorage: TranscriptionStorage = {
  async load(recordingId) {
    const key = storageKey(recordingId);
    if (Platform.OS === 'web') {
      return parseTranscription(globalThis.localStorage.getItem(key), recordingId);
    }

    const current = new File(Paths.document, `${key}.json`);
    const file = current.exists ? current : new File(Paths.document, `${key}.previous`);
    return parseTranscription(file.exists ? file.textSync() : null, recordingId);
  },

  async save(recordingId, transcription) {
    const key = storageKey(recordingId);
    const content = JSON.stringify({ ...transcription, recordingId });
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

    // Keep the last saved text readable if publishing the next snapshot is interrupted.
    if (current.exists) {
      if (previous.exists) previous.delete();
      current.rename(previousName);
    }
    staging.rename(currentName);
  },

  async remove(recordingId) {
    const key = storageKey(recordingId);
    if (Platform.OS === 'web') {
      globalThis.localStorage.removeItem(key);
      return;
    }

    for (const suffix of ['tmp', 'previous', 'json']) {
      const file = new File(Paths.document, `${key}.${suffix}`);
      if (file.exists) file.delete();
    }
  },
};
