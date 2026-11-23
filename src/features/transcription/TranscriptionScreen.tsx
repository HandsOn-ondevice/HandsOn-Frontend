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

import { AppText, BottomSheet, Button, FeedbackPanel, TextField } from '@/design-system';
import { useEntrySelection } from '@/features/entry/EntrySelectionProvider';
import { createRequestId } from '@/features/researcher-workflow/application/request-id';
import {
  createEdgeProcedureDraft,
  procedureDraftRepository,
  type ProcedureDraft,
} from '@/features/procedure-draft/procedureDraftRepository';
import type { SavedRecording } from '@/features/recording/recordingSession';
import { deleteSavedRecording } from '@/features/recording/recordingStorage';
import { EdgeApiError } from '@/lib/edgeApi';
import {
  convertEdgeRecording,
  edgeApiBaseUrl,
  EdgeConnectionError,
  EdgeConversionError,
} from './edgeTranscription';
import { TranscriptionView } from './TranscriptionView';
import { readTranscriptionRecording, transcriptionService } from './transcriptionService';
import {
  edgeTranscriptionStorage,
  transcriptionStorage,
  type SavedEdgeTranscription,
  type SavedTranscription,
} from './transcriptionStorage';

const editorPath = '/expert/drafts/[draftId]';
const requestTimeoutMs = 120_000;

function hasDraftEditor(route: SitemapType | null): boolean {
  return Boolean(route && (route.href === editorPath || route.children.some(hasDraftEditor)));
}

type State =
  | { status: 'loading' | 'sourceError'; recording?: undefined }
  | {
      status:
        | 'tokenRequired'
        | 'uploading'
        | 'uploadError'
        | 'converting'
        | 'unavailable'
        | 'conversionError'
        | 'ready';
      recording: SavedRecording;
    };

export function TranscriptionScreen({ recordingId }: { recordingId: string }) {
  const router = useRouter();
  const sitemap = useSitemap();
  const { selection, edgeToken, setEdgeToken } = useEntrySelection();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [text, setText] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  const [tokenInput, setTokenInput] = useState('');
  const [tokenRejected, setTokenRejected] = useState(false);
  const [confirmation, setConfirmation] =
    useState<Pick<SavedTranscription, 'confirmedText' | 'draftRequestId' | 'draftId'>>();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const [generationError, setGenerationError] = useState(false);
  const [deletionError, setDeletionError] = useState(false);
  const edited = useRef<SavedTranscription>(null);
  const edgeProgress = useRef<SavedEdgeTranscription>(null);
  const pendingDraft = useRef<{ text: string; result: ProcedureDraft }>(null);
  const focused = useRef(false);
  const operating = useRef(false);
  const recording = state.recording;
  const canOpenDraft =
    selection?.role === 'expert' &&
    recording !== undefined &&
    [selection.environment.id, selection.environment.workProfile?.id].includes(
      recording.environment.id,
    );

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
    const controller = new AbortController();

    function showText(recording: SavedRecording, saved: SavedTranscription) {
      edited.current = saved;
      setText(saved.editedText);
      setConfirmation(saved);
      setState({ status: 'ready', recording });
    }

    async function convertOnEdge(recording: SavedRecording, baseUrl: string) {
      const token = edgeToken;
      if (!token) {
        setState({ status: 'tokenRequired', recording });
        return;
      }
      const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
      try {
        const progress = await convertEdgeRecording({
          recording,
          baseUrl,
          token,
          saved: edgeProgress.current,
          signal: controller.signal,
          onPhase: (status) => {
            if (active) setState({ status, recording });
          },
        });
        if (!active) return;
        edgeProgress.current = progress;
        try {
          edgeTranscriptionStorage.save(recording.id, progress);
        } catch {
          setStorageError(true);
        }
        showText(recording, progress.transcript);
      } catch (error) {
        if (!active) return;
        if (error instanceof EdgeConnectionError && error.needsToken) {
          setTokenRejected(true);
          setEdgeToken('');
          setState({ status: 'tokenRequired', recording });
        } else {
          const uploadFailed = error instanceof EdgeConversionError && error.phase === 'uploading';
          setState({ status: uploadFailed ? 'uploadError' : 'conversionError', recording });
        }
      } finally {
        clearTimeout(timeout);
      }
    }

    async function load() {
      let recording: SavedRecording | null = null;
      try {
        recording = await readTranscriptionRecording(recordingId);
        if (!active) return;
        if (!recording) {
          setState({ status: 'sourceError' });
          return;
        }
        const baseUrl = edgeApiBaseUrl;
        edgeProgress.current = baseUrl
          ? edgeTranscriptionStorage.load(recording.id, baseUrl)
          : null;
        const saved = baseUrl
          ? edgeProgress.current?.transcript
          : await transcriptionStorage.load(recording.id);
        if (!active) return;
        if (saved) {
          showText(recording, saved);
          return;
        }
        if (baseUrl) {
          await convertOnEdge(recording, baseUrl);
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
      showText(recording, draft);
    }

    void load();
    return () => {
      active = false;
      controller.abort();
    };
  }, [recordingId, attempt, edgeToken, setEdgeToken]);

  function retryLoad() {
    setState({ status: 'loading' });
    setAttempt((value) => value + 1);
  }

  async function persist(snapshot: SavedTranscription) {
    try {
      if (edgeProgress.current) {
        const progress = { ...edgeProgress.current, transcript: snapshot };
        edgeTranscriptionStorage.save(recordingId, progress);
        edgeProgress.current = progress;
      } else {
        await transcriptionStorage.save(recordingId, snapshot);
      }
      if (edited.current === snapshot) {
        setStorageError(false);
        setConfirmation(snapshot);
      }
      return true;
    } catch {
      if (edited.current === snapshot) setStorageError(true);
      return false;
    }
  }

  function changeText(value: string) {
    if (!edited.current || operating.current || edited.current.draftRequestId) return;
    if (value === edited.current.editedText) return;
    const next = { originalText: edited.current.originalText, editedText: value };
    edited.current = next;
    setText(value);
    setConfirmation(undefined);
    setGenerationError(false);
    void persist(next);
  }

  function openDraft(draftId: string) {
    if (edgeProgress.current || hasDraftEditor(sitemap)) {
      const href = editorPath.replace('[draftId]', encodeURIComponent(draftId));
      router.push(href as Href);
    } else {
      router.push({ pathname: '/expert/drafts/[draftId]/generated', params: { draftId } });
    }
  }

  async function generate() {
    const snapshot = edited.current;
    if (
      operating.current ||
      !recording ||
      !canOpenDraft ||
      !snapshot?.editedText.trim() ||
      (!edgeProgress.current && !transcriptionService) ||
      selection?.role !== 'expert'
    ) {
      return;
    }

    operating.current = true;
    setGenerating(true);
    setGenerationError(false);
    try {
      const progress = edgeProgress.current;
      if (progress) {
        if (snapshot.draftId) {
          openDraft(snapshot.draftId);
          return;
        }
        const requestId = snapshot.draftRequestId ?? createRequestId();
        const confirmation = {
          ...snapshot,
          confirmedText: snapshot.editedText,
          draftRequestId: requestId,
        };
        edited.current = confirmation;
        if (!(await persist(confirmation)) || !focused.current) return;
        const draft = await createEdgeProcedureDraft(
          {
            environmentId: selection.environment.id,
            requestId,
            title: recording.title,
            transcript: confirmation.confirmedText,
            recordingId: progress.serverRecordingId,
          },
          edgeToken,
        );
        const generated = { ...confirmation, draftId: draft.id };
        edited.current = generated;
        if ((await persist(generated)) && focused.current) openDraft(draft.id);
        return;
      }
      if (!(await persist(snapshot)) || !focused.current) return;
      const confirmedText = snapshot.editedText;
      const result =
        pendingDraft.current?.text === confirmedText
          ? pendingDraft.current.result
          : await transcriptionService!.generateDraft({
              recordingId: recording.id,
              title: recording.title,
              confirmedText,
            });
      if (!focused.current) return;
      pendingDraft.current = { text: confirmedText, result };
      const saved = await procedureDraftRepository.save(recording.environment.id, result);
      pendingDraft.current = null;
      if (!focused.current) return;
      openDraft(saved.id);
    } catch (error) {
      if (focused.current) {
        if (error instanceof EdgeApiError && (error.status === 401 || error.status === 403)) {
          setTokenRejected(true);
          setEdgeToken('');
        } else {
          if (error instanceof EdgeApiError && (error.status === 400 || error.status === 422)) {
            const rejected = { ...snapshot, confirmedText: undefined, draftRequestId: undefined };
            edited.current = rejected;
            await persist(rejected);
          }
          setGenerationError(true);
        }
      }
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
      edgeTranscriptionStorage.remove(recordingId);
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

  const tokenPrompt = (
    <>
      <FeedbackPanel
        title="Edge 연결 토큰"
        subtitle={
          tokenRejected
            ? '숙련자 토큰을 확인하고 다시 입력해 주세요.'
            : 'Edge 서버에 녹음을 보내려면 숙련자 토큰을 입력해 주세요.'
        }
        icon="lock"
      />
      <TextField
        label="숙련자 토큰"
        value={tokenInput}
        onChange={setTokenInput}
        secureTextEntry
        autoComplete="off"
        autoCapitalize="none"
        autoCorrect={false}
      />
      <Button
        label="연결하고 진행"
        disabled={!tokenInput.trim()}
        onPress={() => {
          setEdgeToken(tokenInput.trim());
          setTokenInput('');
          setTokenRejected(false);
          retryLoad();
        }}
      />
    </>
  );

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
    case 'tokenRequired':
      feedback = tokenPrompt;
      break;
    case 'uploading':
      feedback = <FeedbackPanel title="녹음을 업로드하고 있어요" icon="mic" />;
      break;
    case 'uploadError':
      feedback = (
        <>
          <FeedbackPanel title="녹음을 업로드하지 못했어요" tone="warning" icon="alert" />
          <Button label="업로드 다시 시도" variant="secondary" onPress={retryLoad} />
        </>
      );
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
      } else if (edgeApiBaseUrl && tokenRejected) {
        feedback = tokenPrompt;
      } else if (generationError) {
        feedback = (
          <FeedbackPanel
            title="초안을 생성하지 못했어요"
            subtitle="확인한 텍스트로 다시 시도할 수 있어요."
            tone="warning"
            icon="alert"
          />
        );
      } else if (confirmation?.confirmedText) {
        feedback = <FeedbackPanel title="전사문을 확정했어요" tone="success" icon="check" />;
      } else if (!canOpenDraft) {
        feedback = <FeedbackPanel title="초안을 만들려면 녹음한 작업 환경으로 돌아가 주세요" />;
      } else if (!edgeApiBaseUrl && !transcriptionService) {
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
        textLocked={Boolean(confirmation?.draftRequestId)}
        maxTextLength={edgeApiBaseUrl ? 10_000 : undefined}
        canGenerate={Boolean(
          state.status === 'ready' &&
          canOpenDraft &&
          (edgeApiBaseUrl || transcriptionService) &&
          text?.trim() &&
          !tokenRejected &&
          !storageError &&
          !deleting,
        )}
        generateLabel={
          edgeApiBaseUrl && generationError
            ? '초안 생성 다시 시도'
            : edgeApiBaseUrl && confirmation?.draftId
              ? 'AI 절차 초안 열기'
              : undefined
        }
        demo={!edgeApiBaseUrl && Boolean(transcriptionService)}
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
                disabled={
                  generating || state.status === 'uploading' || state.status === 'converting'
                }
                onPress={() =>
                  Alert.alert(
                    '음성 원본을 삭제할까요?',
                    '이 기기의 녹음과 변환 텍스트가 삭제됩니다.',
                    [
                      { text: '취소', style: 'cancel' },
                      {
                        text: '원본 삭제',
                        style: 'destructive',
                        onPress: () => void removeOriginal(),
                      },
                    ],
                  )
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
