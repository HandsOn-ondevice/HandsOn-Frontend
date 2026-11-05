import { Directory, File, Paths } from 'expo-file-system';

import type { RecordingEnvironment, SavedRecording } from './recordingSession';

const validId = (id: string) => /^recording-\d+-[a-z0-9]{8}$/.test(id);
const recordingsDirectory = () => new Directory(Paths.document, 'recordings');

function ensureDirectory() {
  const directory = recordingsDirectory();
  directory.create({ intermediates: true, idempotent: true });
  return directory;
}

/** Only our own unfinished cache files and metadata-less staging files are removed. */
export async function cleanupAbandonedRecordings() {
  const audioCache = new Directory(Paths.cache, 'Audio');
  if (audioCache.exists) {
    for (const file of audioCache.list()) {
      if (file instanceof File && file.name.startsWith('handson-pending-')) file.delete();
    }
  }
  const directory = ensureDirectory();
  for (const file of directory.list()) {
    if (!(file instanceof File)) continue;
    if (file.name.endsWith('.part')) file.delete();
    if (file.name.endsWith('.m4a')) {
      const id = file.name.slice(0, -4);
      if (validId(id) && !new File(directory, `${id}.json`).exists) file.delete();
    }
  }
}

export async function saveRecording(
  uri: string,
  durationMs: number,
  title: string,
  environment: RecordingEnvironment,
): Promise<SavedRecording> {
  const source = new File(uri);
  if (!Number.isFinite(durationMs) || durationMs <= 0 || !source.exists || source.size <= 0) {
    throw new Error('Empty recording');
  }
  const directory = ensureDirectory();
  const id = `recording-${Date.now()}-${Math.random().toString(36).slice(2, 10).padEnd(8, '0')}`;
  const original = new File(directory, `${id}.m4a`);
  const partial = new File(directory, `${id}.m4a.part`);
  const metadata = new File(directory, `${id}.json`);
  const partialMetadata = new File(directory, `${id}.json.part`);
  try {
    await source.copy(partial);
    if (!partial.exists || partial.size <= 0 || partial.size !== source.size) {
      throw new Error('Incomplete recording copy');
    }
    await partial.move(original);
    const saved: SavedRecording = {
      id,
      uri: original.uri,
      fileName: original.name,
      mimeType: 'audio/mp4',
      durationMs,
      sizeBytes: original.size,
      createdAt: new Date().toISOString(),
      title,
      environment: { id: environment.id, name: environment.name },
    };
    await partialMetadata.write(JSON.stringify(saved));
    await partialMetadata.move(metadata);
    return saved;
  } catch (error) {
    for (const file of [partial, partialMetadata, original, metadata]) {
      if (file.exists) file.delete();
    }
    throw error;
  }
}

export async function readSavedRecording(id: string): Promise<SavedRecording | null> {
  if (!validId(id)) return null;
  const directory = recordingsDirectory();
  const metadata = new File(directory, `${id}.json`);
  const original = new File(directory, `${id}.m4a`);
  if (!metadata.exists || !original.exists || original.size <= 0) return null;
  try {
    const saved: unknown = JSON.parse(await metadata.text());
    if (!saved || typeof saved !== 'object') return null;
    const value = saved as Partial<SavedRecording>;
    if (
      value.id !== id ||
      value.fileName !== original.name ||
      value.mimeType !== 'audio/mp4' ||
      typeof value.durationMs !== 'number' ||
      !Number.isFinite(value.durationMs) ||
      value.durationMs <= 0 ||
      value.sizeBytes !== original.size ||
      typeof value.title !== 'string' ||
      !value.title.trim() ||
      typeof value.createdAt !== 'string' ||
      !Number.isFinite(Date.parse(value.createdAt)) ||
      !value.environment ||
      typeof value.environment.id !== 'string' ||
      typeof value.environment.name !== 'string'
    ) {
      return null;
    }
    // Rebuild URI from the owned directory, never trust a stored arbitrary path.
    return { ...value, uri: original.uri } as SavedRecording;
  } catch {
    return null;
  }
}

export async function deleteSavedRecording(id: string) {
  if (!validId(id)) throw new Error('Invalid recording identifier');
  const directory = recordingsDirectory();
  for (const extension of ['m4a', 'json']) {
    const file = new File(directory, `${id}.${extension}`);
    if (file.exists) file.delete();
  }
}
