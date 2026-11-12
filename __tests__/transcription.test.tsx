import { beforeEach, expect, jest, test } from '@jest/globals';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import {
  procedureDraftRepository,
  type ProcedureDraft,
} from '../src/features/procedure-draft/procedureDraftRepository';
import type { SavedRecording } from '../src/features/recording/recordingSession';
import { TranscriptionScreen } from '../src/features/transcription/TranscriptionScreen';
import {
  readTranscriptionRecording,
  transcriptionService,
} from '../src/features/transcription/transcriptionService';
import { transcriptionStorage } from '../src/features/transcription/transcriptionStorage';

jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual<typeof import('react')>('react');
  const router = { push: jest.fn() };
  return {
    useRouter: () => router,
    useSitemap: () => null,
    useFocusEffect: (effect: () => void | (() => void)) => useEffect(effect, [effect]),
    usePreventRemove: () => jest.fn(),
    __router: router,
  };
});
jest.mock('@/features/entry/EntrySelectionProvider', () => ({
  useEntrySelection: () => ({ selection: { role: 'expert', environment: { id: 'lab' } } }),
}));
jest.mock('@/features/recording/recordingStorage', () => ({ deleteSavedRecording: jest.fn() }));
jest.mock('@/features/procedure-draft/procedureDraftRepository', () => ({
  procedureDraftRepository: { save: jest.fn() },
}));
jest.mock('@/features/transcription/transcriptionService', () => ({
  readTranscriptionRecording: jest.fn(),
  transcriptionService: { transcribe: jest.fn(), generateDraft: jest.fn() },
  demoTranscriptionChecklist: [],
}));
jest.mock('@/features/transcription/transcriptionStorage', () => ({
  transcriptionStorage: { load: jest.fn(), save: jest.fn() },
}));

const recording: SavedRecording = {
  id: 'recording-123-abcdefgh',
  uri: 'file:///documents/recordings/recording-123-abcdefgh.m4a',
  fileName: 'recording-123-abcdefgh.m4a',
  mimeType: 'audio/mp4',
  durationMs: 2400,
  sizeBytes: 24000,
  createdAt: '2026-11-12T00:00:00.000Z',
  title: 'LED 측정',
  environment: { id: 'lab', name: '전자회로 실험실' },
};
const originalText = 'LED 전원을 연결합니다.';
const converted = { originalText, editedText: originalText };

const service = jest.mocked(transcriptionService!);
const storage = jest.mocked(transcriptionStorage);
const repository = jest.mocked(procedureDraftRepository);
const { __router: router } = jest.requireMock<{ __router: { push: jest.Mock } }>('expo-router');

beforeEach(() => {
  jest.clearAllMocks();
  service.transcribe.mockReset();
  service.generateDraft.mockReset();
  repository.save.mockReset();
  jest.mocked(readTranscriptionRecording).mockResolvedValue(recording);
  storage.load.mockResolvedValue(null);
  storage.save.mockResolvedValue();
});

test('변환에 같은 음성 원본을 전달하고 실패 후 다시 요청할 수 있다', async () => {
  const first = Promise.withResolvers<{ text: string }>();
  const retry = Promise.withResolvers<{ text: string }>();
  service.transcribe.mockReturnValueOnce(first.promise).mockReturnValueOnce(retry.promise);
  const screen = await render(<TranscriptionScreen recordingId={recording.id} />);

  expect(await screen.findByText('음성을 텍스트로 변환하고 있어요')).toBeVisible();
  expect(readTranscriptionRecording).toHaveBeenCalledWith(recording.id);
  expect(service.transcribe).toHaveBeenCalledWith(recording);
  const generate = screen.getByTestId('transcription-generate');
  expect(generate).toBeDisabled();
  await fireEvent.press(generate);
  expect(service.generateDraft).not.toHaveBeenCalled();

  await act(() => first.reject(new Error('STT 실패')));
  expect(await screen.findByText('음성을 변환하지 못했어요')).toBeVisible();
  expect(storage.save).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: '변환 다시 시도' }));
  expect(await screen.findByText('음성을 텍스트로 변환하고 있어요')).toBeVisible();
  expect(service.transcribe).toHaveBeenCalledTimes(2);
  expect(service.transcribe).toHaveBeenLastCalledWith(recording);

  await act(() => retry.resolve({ text: originalText }));
  expect(await screen.findByDisplayValue(originalText)).toBeVisible();
  expect(storage.save).toHaveBeenCalledWith(recording.id, converted);
});

test('편집한 텍스트를 그대로 전달하고 요청이 끝나기 전 중복 생성과 화면 이동을 막는다', async () => {
  const first = Promise.withResolvers<ProcedureDraft>();
  const saved = Promise.withResolvers<ProcedureDraft>();
  const confirmedText = ' LED 전원을 분리합니다.\n측정 결과를 기록합니다. ';
  const draft: ProcedureDraft = {
    id: 'draft-1',
    title: recording.title,
    description: confirmedText,
    version: 'v0.1',
    status: 'draft',
    steps: [],
    materials: [],
    precautions: [],
    pendingItems: [],
    savedAt: null,
  };
  storage.load.mockResolvedValue(converted);
  service.generateDraft.mockReturnValueOnce(first.promise).mockResolvedValueOnce(draft);
  repository.save.mockReturnValue(saved.promise);
  const screen = await render(<TranscriptionScreen recordingId={recording.id} />);
  const input = await screen.findByLabelText('변환 텍스트');
  await fireEvent.changeText(input, confirmedText);
  expect(storage.save).toHaveBeenLastCalledWith(recording.id, {
    originalText,
    editedText: confirmedText,
  });

  const generate = () => screen.getByTestId('transcription-generate');
  await fireEvent.press(generate());
  expect(generate()).toBeDisabled();
  expect(input).toBeDisabled();
  await fireEvent.press(generate());
  const request = { recordingId: recording.id, title: recording.title, confirmedText };
  expect(service.generateDraft).toHaveBeenCalledTimes(1);
  expect(service.generateDraft).toHaveBeenCalledWith(request);
  expect(router.push).not.toHaveBeenCalled();

  await act(() => first.reject(new Error('초안 생성 실패')));
  expect(await screen.findByText('초안을 생성하지 못했어요')).toBeVisible();
  expect(input).toHaveDisplayValue(confirmedText);
  expect(repository.save).not.toHaveBeenCalled();
  expect(router.push).not.toHaveBeenCalled();

  await fireEvent.press(generate());
  expect(service.generateDraft).toHaveBeenCalledTimes(2);
  expect(service.generateDraft).toHaveBeenLastCalledWith(request);
  await waitFor(() =>
    expect(repository.save).toHaveBeenCalledWith(recording.environment.id, draft),
  );
  expect(router.push).not.toHaveBeenCalled();

  await act(() => saved.resolve({ ...draft, savedAt: '2026-11-12T00:01:00.000Z' }));
  expect(router.push).toHaveBeenCalledWith({
    pathname: '/expert/drafts/[draftId]/generated',
    params: { draftId: draft.id },
  });
});
