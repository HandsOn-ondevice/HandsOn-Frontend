import { afterEach, expect, jest, test } from '@jest/globals';

import type { SavedRecording } from '../src/features/recording/recordingSession';
import { convertEdgeRecording } from '../src/features/transcription/edgeTranscription';
import { edgeTranscriptionStorage } from '../src/features/transcription/transcriptionStorage';

jest.mock('@/features/transcription/transcriptionStorage', () => ({
  edgeTranscriptionStorage: { save: jest.fn() },
}));

const recording: SavedRecording = {
  id: 'recording-123-abcdefgh',
  uri: 'file:///recordings/recording-123-abcdefgh.m4a',
  fileName: 'recording-123-abcdefgh.m4a',
  mimeType: 'audio/mp4',
  durationMs: 2000,
  sizeBytes: 20000,
  createdAt: '2026-11-23T00:00:00.000Z',
  title: 'LED 측정',
  environment: { id: 'lab', name: '전자회로 실험실' },
};
const baseUrl = 'https://edge.example';
const serverRecordingId = 'recording-server';
const saved = { baseUrl, serverRecordingId, attempt: 1 };
const taskId = 'transcription-server';
const text = 'LED 전원을 확인합니다.';
const request = () => ({
  recording,
  baseUrl,
  token: 'test-token',
  saved,
  signal: new AbortController().signal,
  onPhase: jest.fn(),
});

function response(data: object, status = 200): Response {
  return { status, text: async () => JSON.stringify(data) } as Response;
}

afterEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
});

test('비동기 전사 작업 ID를 저장하고 완료 결과를 조회한다', async () => {
  const fetch = jest
    .spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(
      response({ id: taskId, status: 'queued', recordingId: serverRecordingId }, 202),
    )
    .mockResolvedValueOnce(
      response({ id: taskId, status: 'completed', recordingId: serverRecordingId, text }),
    );

  await expect(convertEdgeRecording(request())).resolves.toEqual({
    ...saved,
    transcript: { originalText: text, editedText: text },
  });
  expect(fetch).toHaveBeenNthCalledWith(
    1,
    `${baseUrl}/api/v1/transcriptions`,
    expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        requestId: `transcribe-${recording.id}-1`,
        recordingId: serverRecordingId,
      }),
    }),
  );
  expect(edgeTranscriptionStorage.save).toHaveBeenCalledWith(recording.id, { ...saved, taskId });
  expect(fetch).toHaveBeenNthCalledWith(
    2,
    `${baseUrl}/api/v1/transcriptions/${taskId}`,
    expect.objectContaining({ method: 'GET' }),
  );
});

test('재진입하면 저장된 작업을 조회하고 다른 녹음의 전사문을 표시하지 않는다', async () => {
  const fetch = jest
    .spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(
      response({ id: taskId, status: 'completed', recordingId: 'recording-other', text }),
    );
  await expect(
    convertEdgeRecording({ ...request(), saved: { ...saved, taskId } }),
  ).rejects.toMatchObject({
    phase: 'converting',
  });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch).toHaveBeenCalledWith(
    `${baseUrl}/api/v1/transcriptions/${taskId}`,
    expect.objectContaining({ method: 'GET' }),
  );
  expect(edgeTranscriptionStorage.save).not.toHaveBeenCalled();
});
