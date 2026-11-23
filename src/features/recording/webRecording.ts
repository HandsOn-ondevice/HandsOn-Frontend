import {
  createRecordingId,
  type RecordingEnvironment,
  type SavedRecording,
} from './recordingSession';

interface WebRecording {
  recording: SavedRecording;
  file: File;
}

const databaseName = 'handson-web-recordings';
const storeName = 'recordings';
const environmentIndex = 'environment';

function accessRecordings<T>(
  mode: IDBTransactionMode,
  request: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(databaseName, 1);
    open.onupgradeneeded = () => {
      const store = open.result.createObjectStore(storeName, { keyPath: 'recording.id' });
      store.createIndex(environmentIndex, 'recording.environment.id');
    };
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const database = open.result;
      const transaction = database.transaction(storeName, mode);
      const operation = request(transaction.objectStore(storeName));
      transaction.onabort = () => {
        database.close();
        reject(transaction.error);
      };
      transaction.oncomplete = () => {
        database.close();
        resolve(operation.result);
      };
    };
  });
}

function readDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const audio = new Audio();
    const url = URL.createObjectURL(file);
    const finish = (duration: number) => {
      clearTimeout(timeout);
      audio.onloadedmetadata = null;
      audio.onerror = null;
      audio.removeAttribute('src');
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(duration) && duration > 0 ? Math.round(duration * 1000) : 0);
    };
    const timeout = setTimeout(() => finish(0), 3000);
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => finish(audio.duration);
    audio.onerror = () => finish(0);
    audio.src = url;
  });
}

export async function saveWebRecording(
  file: File,
  title: string,
  environment: RecordingEnvironment,
): Promise<SavedRecording> {
  const id = createRecordingId();
  const recording: SavedRecording = {
    id,
    uri: `indexeddb://recordings/${id}`,
    fileName: file.name,
    mimeType: 'audio/mp4',
    sizeBytes: file.size,
    durationMs: await readDuration(file),
    createdAt: new Date().toISOString(),
    title: title.trim(),
    environment: { id: environment.id, name: environment.name },
  };
  await accessRecordings('readwrite', (store) => store.add({ recording, file }));
  return recording;
}

function readEntry(recordingId: string): Promise<WebRecording | undefined> {
  return accessRecordings('readonly', (store) => store.get(recordingId));
}

export async function readWebRecording(recordingId: string): Promise<SavedRecording | null> {
  return (await readEntry(recordingId))?.recording ?? null;
}

export async function readWebRecordingFile(recordingId: string): Promise<Blob | null> {
  return (await readEntry(recordingId))?.file ?? null;
}

export async function readRecentWebRecording(environmentId: string) {
  const entries = await accessRecordings<WebRecording[]>('readonly', (store) =>
    store.index(environmentIndex).getAll(environmentId),
  );
  const latest = entries.reduce<SavedRecording | null>((latest, { recording }) => {
    return !latest || recording.createdAt > latest.createdAt ? recording : latest;
  }, null);
  return latest;
}
