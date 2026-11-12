import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Platform } from 'react-native';
import {
  useFocusEffect,
  usePreventRemove,
  useRouter,
  useSitemap,
  type Href,
  type SitemapType,
} from 'expo-router';

import { AppText, BottomSheet, Button, FeedbackPanel } from '@/design-system';
import { useEntrySelection } from '@/features/entry/EntrySelectionProvider';
import {
  procedureDraftRepository,
  type ProcedureDraft,
} from '@/features/procedure-draft/procedureDraftRepository';
import type { SavedRecording } from '@/features/recording/recordingSession';
import { deleteSavedRecording } from '@/features/recording/recordingStorage';
import { TranscriptionView } from './TranscriptionView';
import { readTranscriptionRecording, transcriptionService } from './transcriptionService';
import { transcriptionStorage, type SavedTranscription } from './transcriptionStorage';

const editorPath = '/expert/drafts/[draftId]';

function hasDraftEditor(route: SitemapType | null): boolean {
  return Boolean(route && (route.href === editorPath || route.children.some(hasDraftEditor)));
}

type State =
  | { status: 'loading' | 'sourceError'; recording?: undefined }
  | {
      status: 'converting' | 'unavailable' | 'conversionError' | 'ready';
      recording: SavedRecording;
    };

export function TranscriptionScreen({ recordingId }: { recordingId: string }) {
  const router = useRouter();
  const sitemap = useSitemap();
  const { selection } = useEntrySelection();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [text, setText] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const [generationError, setGenerationError] = useState(false);
  const [deletionError, setDeletionError] = useState(false);
  const edited = useRef<SavedTranscription>(null);
  const pendingDraft = useRef<{ text: string; result: ProcedureDraft }>(null);
  const focused = useRef(false);
  const operating = useRef(false);
  const recording = state.recording;
  const canOpenDraft =
    selection?.role === 'expert' && selection.environment.id === recording?.environment.id;

  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      return () => {
        focused.current = false;
      };
    }, []),
  );

  const allowRemoval = usePreventRemove(deleting || storageError, () => {
    Alert.alert(
      deleting ? '원본을 삭제하고 있어요' : '변환 텍스트를 저장하지 못했어요',
      deleting ? '삭제가 끝날 때까지 잠시 기다려주세요.' : '저장을 다시 시도해 주세요.',
    );
  });

  useEffect(() => {
    let active = true;

    async function load() {
      let recording: SavedRecording | null = null;
      try {
        recording = await readTranscriptionRecording(recordingId);
        if (!active) return;
        if (!recording) {
          setState({ status: 'sourceError' });
          return;
        }
        const saved = await transcriptionStorage.load(recording.id);
        if (!active) return;
        if (saved) {
          edited.current = saved;
          setText(saved.editedText);
          setState({ status: 'ready', recording });
          return;
        }
      } catch {
        if (active) setState({ status: 'sourceError' });
        return;
      }

      if (!transcriptionService) {
        setState({ status: 'unavailable', recording });
        return;
      }
      setState({ status: 'converting', recording });
      let converted: string;
      try {
        const { text } = await transcriptionService.transcribe(recording);
        if (!text.trim()) throw new Error('Empty transcript');
        converted = text;
      } catch {
        if (active) setState({ status: 'conversionError', recording });
        return;
      }
      if (!active) return;

      const draft = { originalText: converted, editedText: converted };
      edited.current = draft;
      try {
        await transcriptionStorage.save(recording.id, draft);
      } catch {
        if (active) setStorageError(true);
      }
      if (!active) return;
      setText(converted);
      setState({ status: 'ready', recording });
    }

    void load();
    return () => {
      active = false;
    };
  }, [recordingId, attempt]);

  function retryLoad() {
    setState({ status: 'loading' });
    setAttempt((value) => value + 1);
  }

  async function persist(snapshot: SavedTranscription) {
    try {
      await transcriptionStorage.save(recordingId, snapshot);
      if (edited.current === snapshot) setStorageError(false);
      return true;
    } catch {
      if (edited.current === snapshot) setStorageError(true);
      return false;
    }
  }

  function changeText(value: string) {
    if (!edited.current || operating.current) return;
    const next = { ...edited.current, editedText: value };
    edited.current = next;
    setText(value);
    setGenerationError(false);
    void persist(next);
  }

  async function generate() {
    const snapshot = edited.current;
    if (
      operating.current ||
      !recording ||
      !canOpenDraft ||
      !snapshot?.editedText.trim() ||
      !transcriptionService
    ) {
      return;
    }

    operating.current = true;
    setGenerating(true);
    setGenerationError(false);
    try {
      if (!(await persist(snapshot)) || !focused.current) return;
      const confirmedText = snapshot.editedText;
      const result =
        pendingDraft.current?.text === confirmedText
          ? pendingDraft.current.result
          : await transcriptionService.generateDraft({
              recordingId: recording.id,
              title: recording.title,
              confirmedText,
            });
      if (!focused.current) return;
      pendingDraft.current = { text: confirmedText, result };
      const saved = await procedureDraftRepository.save(recording.environment.id, result);
      pendingDraft.current = null;
      if (!focused.current) return;
      if (hasDraftEditor(sitemap)) {
        // E04 supplies the editor in builds where this route is registered.
        const href = editorPath.replace('[draftId]', encodeURIComponent(saved.id));
        router.push(href as Href);
      } else {
        router.push({
          pathname: '/expert/drafts/[draftId]/generated',
          params: { draftId: saved.id },
        });
      }
    } catch {
      if (focused.current) setGenerationError(true);
    } finally {
      operating.current = false;
      setGenerating(false);
    }
  }

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }

  async function removeOriginal() {
    if (!state.recording || operating.current) return;
    operating.current = true;
    setDeleting(true);
    setDeletionError(false);
    try {
      await deleteSavedRecording(recordingId);
      await transcriptionStorage.remove(recordingId);
      if (!focused.current) return;
      allowRemoval();
      goBack();
    } catch {
      if (focused.current) setDeletionError(true);
    } finally {
      operating.current = false;
      setDeleting(false);
    }
  }

  let feedback;
  switch (state.status) {
    case 'loading':
      feedback = <FeedbackPanel title="음성 원본을 확인하고 있어요" icon="mic" />;
      break;
    case 'sourceError':
      feedback = (
        <>
          <FeedbackPanel
            title="녹음 정보를 불러오지 못했어요"
            subtitle="음성 원본이나 저장된 변환 텍스트를 확인할 수 없습니다."
            tone="warning"
            icon="alert"
          />
          <Button label="다시 확인" variant="secondary" onPress={retryLoad} />
        </>
      );
      break;
    case 'unavailable':
      feedback = <FeedbackPanel title="STT 서비스 연결을 기다리고 있어요" icon="mic" />;
      break;
    case 'converting':
      feedback = (
        <FeedbackPanel
          title="음성을 텍스트로 변환하고 있어요"
          subtitle="변환을 마치면 내용을 확인하고 수정할 수 있어요."
          icon="mic"
        />
      );
      break;
    case 'conversionError':
      feedback = (
        <>
          <FeedbackPanel title="음성을 변환하지 못했어요" tone="warning" icon="alert" />
          <Button label="변환 다시 시도" variant="secondary" onPress={retryLoad} />
        </>
      );
      break;
    case 'ready':
      if (storageError) {
        feedback = (
          <>
            <FeedbackPanel title="변환 텍스트를 저장하지 못했어요" tone="warning" icon="alert" />
            <Button
              label="저장 다시 시도"
              variant="secondary"
              onPress={() => {
                if (edited.current) void persist(edited.current);
              }}
            />
          </>
        );
      } else if (generationError) {
        feedback = (
          <FeedbackPanel
            title="초안을 생성하지 못했어요"
            subtitle="확인한 텍스트로 다시 시도할 수 있어요."
            tone="warning"
            icon="alert"
          />
        );
      } else if (!canOpenDraft) {
        feedback = <FeedbackPanel title="초안을 만들려면 녹음한 작업 환경으로 돌아가 주세요" />;
      } else if (!transcriptionService) {
        feedback = <FeedbackPanel title="AI 초안 생성 서비스 연결을 기다리고 있어요" />;
      }
      break;
  }

  return (
    <>
      <TranscriptionView
        recording={recording}
        text={text}
        busy={generating}
        canGenerate={Boolean(
          canOpenDraft && transcriptionService && text?.trim() && !storageError && !deleting,
        )}
        demo={Boolean(transcriptionService)}
        feedback={feedback}
        onChange={changeText}
        onGenerate={() => void generate()}
        onBack={goBack}
        onMore={() => setSheetOpen(true)}
      />
      <BottomSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="녹음 정보"
        icon="mic"
      >
        {recording ? (
          <>
            <AppText variant="label">{recording.title}</AppText>
            <AppText>{recording.environment.name}</AppText>
            <AppText>{recording.fileName}</AppText>
            <AppText>{`AAC / M4A · ${recording.sizeBytes.toLocaleString()} bytes`}</AppText>
            {deletionError ? (
              <AppText>원본을 삭제하지 못했어요. 다시 시도해 주세요.</AppText>
            ) : null}
            {Platform.OS !== 'web' ? (
              <Button
                label="원본 삭제하고 돌아가기"
                variant="danger"
                loading={deleting}
                disabled={generating || state.status === 'converting'}
                onPress={() =>
                  Alert.alert('음성 원본을 삭제할까요?', '녹음 파일과 변환 텍스트가 삭제됩니다.', [
                    { text: '취소', style: 'cancel' },
                    {
                      text: '원본 삭제',
                      style: 'destructive',
                      onPress: () => void removeOriginal(),
                    },
                  ])
                }
              />
            ) : null}
          </>
        ) : (
          <AppText>표시할 녹음 정보가 없어요.</AppText>
        )}
        <Button label="닫기" variant="secondary" onPress={() => setSheetOpen(false)} />
      </BottomSheet>
    </>
  );
}
