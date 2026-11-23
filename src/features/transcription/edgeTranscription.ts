import { File, UploadType } from 'expo-file-system';
import { Platform } from 'react-native';

import type { SavedRecording } from '@/features/recording/recordingSession';
import { readSavedRecording } from '@/features/recording/recordingStorage';
import { readWebRecording, readWebRecordingFile } from '@/features/recording/webRecording';
import { edgeTranscriptionStorage, type SavedEdgeTranscription } from './transcriptionStorage';

function configuredBaseUrl() {
  if (process.env.EXPO_PUBLIC_HANDSON_MAESTRO === '1') return undefined;
  const configured = process.env.EXPO_PUBLIC_HANDSON_EDGE_BASE_URL?.trim();
  if (!configured) return undefined;
  try {
    const url = new URL(configured);
    if (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      url.pathname === '/' &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    )
      return url.origin;
  } catch {
    // Keep the app usable when the developer has supplied an invalid endpoint.
  }
  return undefined;
}

export const edgeApiBaseUrl = configuredBaseUrl();

type Phase = 'uploading' | 'converting';

export class EdgeConnectionError extends Error {
  constructor(
    public readonly status: number,
    public readonly requestId?: string,
  ) {
    super(`Edge request failed (${status})`);
  }

  get needsToken() {
    return this.status === 401 || this.status === 403;
  }
}

export class EdgeConversionError extends Error {
  constructor(public readonly phase: Phase) {
    super(`Edge recording conversion failed during ${phase}`);
  }
}

function parseResponse(status: number, body: string): Record<string, unknown> {
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch {
    // Gateways can return HTML or an empty body when an operation's outcome is unknown.
  }
  if (status < 200 || status >= 300) {
    const error = data && typeof data === 'object' && 'error' in data ? data.error : null;
    const requestId =
      error && typeof error === 'object' && 'requestId' in error ? error.requestId : undefined;
    throw new EdgeConnectionError(status, typeof requestId === 'string' ? requestId : undefined);
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Invalid Edge response');
  }
  return data as Record<string, unknown>;
}

async function uploadRecording(
  endpoint: string,
  recording: SavedRecording,
  authorization: string,
  signal: AbortSignal,
) {
  const url = `${endpoint}/recordings`;
  const headers = { Authorization: authorization, 'Idempotency-Key': recording.id };
  let result: Record<string, unknown>;
  if (Platform.OS === 'web') {
    const file = await readWebRecordingFile(recording.id);
    if (!file || file.size !== recording.sizeBytes) throw new Error('Missing recording file');
    const form = new FormData();
    form.append('file', file.slice(0, file.size, recording.mimeType), recording.fileName);
    const response = await fetch(url, { method: 'POST', headers, body: form, signal });
    result = parseResponse(response.status, await response.text());
  } else {
    const { status, body } = await new File(recording.uri).upload(url, {
      headers,
      uploadType: UploadType.MULTIPART,
      fieldName: 'file',
      mimeType: recording.mimeType,
      sessionType: 'foreground',
      signal,
    });
    result = parseResponse(status, body);
  }
  if (
    typeof result.recordingId !== 'string' ||
    !result.recordingId ||
    result.sizeBytes !== recording.sizeBytes
  )
    throw new Error('Unexpected uploaded recording');
  return result.recordingId;
}

export async function convertEdgeRecording({
  recording,
  baseUrl,
  token,
  saved,
  signal,
  onPhase,
}: {
  recording: SavedRecording;
  baseUrl: string;
  token: string;
  saved: SavedEdgeTranscription | null;
  signal: AbortSignal;
  onPhase: (phase: Phase) => void;
}): Promise<
  SavedEdgeTranscription & { transcript: NonNullable<SavedEdgeTranscription['transcript']> }
> {
  const endpoint = `${baseUrl}/api/v1`;
  const Authorization = `Bearer ${token}`;
  let phase: Phase = saved ? 'converting' : 'uploading';
  let progress = saved;
  let requestId: string | undefined;
  onPhase(phase);

  try {
    if (!progress) {
      const serverRecordingId = await uploadRecording(endpoint, recording, Authorization, signal);
      progress = { baseUrl, serverRecordingId, attempt: 1 };
      edgeTranscriptionStorage.save(recording.id, progress);
      phase = 'converting';
      onPhase(phase);
    }

    const { serverRecordingId, attempt } = progress;
    async function call(path: string, body?: object) {
      const response = await fetch(`${endpoint}${path}`, {
        method: body ? 'POST' : 'GET',
        headers: body ? { Authorization, 'Content-Type': 'application/json' } : { Authorization },
        body: body && JSON.stringify(body),
        signal,
      });
      return parseResponse(response.status, await response.text());
    }

    const requestPath = '/transcriptions';
    requestId = `transcribe-${recording.id}-${attempt}`;
    let response = progress.taskId
      ? await call(`${requestPath}/${encodeURIComponent(progress.taskId)}`)
      : await call(requestPath, { requestId, recordingId: serverRecordingId });

    while (true) {
      if (response.recordingId !== undefined && response.recordingId !== serverRecordingId) {
        throw new Error('Transcription refers to another recording');
      }
      if (
        response.status === 'completed' &&
        typeof response.text === 'string' &&
        response.text.trim()
      ) {
        return {
          baseUrl,
          serverRecordingId,
          attempt,
          transcript: { originalText: response.text, editedText: response.text },
        };
      }
      if (response.status === 'failed') {
        edgeTranscriptionStorage.save(recording.id, {
          baseUrl,
          serverRecordingId,
          attempt: attempt + 1,
        });
        throw new EdgeConversionError('converting');
      }
      const taskId: unknown = progress.taskId ?? response.id;
      if (
        !['queued', 'pending', 'processing'].includes(String(response.status)) ||
        typeof taskId !== 'string' ||
        !taskId
      )
        throw new Error('Unexpected transcription status');

      if (!progress.taskId) {
        progress = { ...progress, taskId };
        edgeTranscriptionStorage.save(recording.id, progress);
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 1000));
      if (signal.aborted) throw new EdgeConversionError('converting');
      response = await call(`${requestPath}/${encodeURIComponent(taskId)}`);
    }
  } catch (error) {
    if (error instanceof EdgeConnectionError && error.needsToken) throw error;
    if (
      progress &&
      error instanceof EdgeConnectionError &&
      error.requestId === requestId &&
      requestId
    ) {
      // Edge caches explicit domain failures. A network error leaves the request outcome unknown.
      edgeTranscriptionStorage.save(recording.id, {
        baseUrl,
        serverRecordingId: progress.serverRecordingId,
        attempt: progress.attempt + 1,
      });
    }
    throw new EdgeConversionError(phase);
  }
}

export async function readConfirmedDraftRequest(localRecordingId: string) {
  if (!edgeApiBaseUrl) return null;
  const readRecording = Platform.OS === 'web' ? readWebRecording : readSavedRecording;
  const recording = await readRecording(localRecordingId);
  if (!recording) return null;
  const saved = edgeTranscriptionStorage.load(localRecordingId, edgeApiBaseUrl);
  if (!saved?.transcript?.confirmedText) return null;
  return {
    recordingId: saved.serverRecordingId,
    title: recording.title,
    confirmedText: saved.transcript.confirmedText,
    environmentId: recording.environment.id,
  };
}
