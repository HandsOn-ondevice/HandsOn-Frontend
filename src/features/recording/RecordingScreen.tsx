import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Alert, AppState, Linking, Platform } from 'react-native';
import { useFocusEffect, usePreventRemove, useRouter } from 'expo-router';
import { BottomSheet, AppText, Button } from '@/design-system';
import type { WorkEnvironment } from '@/features/entry/entryEnvironment';
import { edgeApiBaseUrl } from '@/features/transcription/edgeTranscription';
import {
  demoTranscriptionEnvironmentId,
  demoTranscriptionRecordingId,
  transcriptionService,
} from '@/features/transcription/transcriptionService';
import { createRecordingSession } from './nativeRecording';
import { readRecentSavedRecording } from './recordingStorage';
import { RecordingView } from './RecordingView';
import { readRecentWebRecording } from './webRecording';
import { WebRecordingPicker } from './WebRecordingPicker';

export function RecordingScreen({ environment }: { environment: WorkEnvironment }) {
  const router = useRouter();
  // The controller is pure JS; native resources are acquired only by start().
  const [session] = useState(createRecordingSession);
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const [title, setTitle] = useState('');
  const [help, setHelp] = useState(false);
  const [recentRecordingId, setRecentRecordingId] = useState<string>();
  const canChooseWebFile = __DEV__ && Platform.OS === 'web' && Boolean(edgeApiBaseUrl);
  const legacyEnvironmentId = environment.workProfile?.id;
  const setupError =
    Platform.OS !== 'android' && !canChooseWebFile
      ? '음성 녹음은 Android 앱에서 사용할 수 있어요.'
      : undefined;
  const canPreviewTranscription =
    Platform.OS === 'web' &&
    !canChooseWebFile &&
    transcriptionService &&
    environment.id === demoTranscriptionEnvironmentId;
  const alive = useRef(false);
  const focused = useRef(false);
  const exitPromptOpen = useRef(false);

  useEffect(() => {
    alive.current = true;
    session.setAppForeground(AppState.currentState !== 'background');
    const subscription = AppState.addEventListener('change', (state) => {
      session.setAppForeground(state !== 'background');
    });
    return () => {
      alive.current = false;
      subscription.remove();
      // Releasing native resources also permits React's development effect replay.
      void session.discard();
    };
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      setRecentRecordingId(undefined);
      const readRecent =
        Platform.OS === 'android'
          ? readRecentSavedRecording
          : canChooseWebFile
            ? readRecentWebRecording
            : undefined;
      let active = true;
      if (readRecent) {
        void readRecent(environment.id, legacyEnvironmentId).then(
          (recent) => {
            if (active) setRecentRecordingId(recent?.id);
          },
          () => undefined,
        );
      }
      return () => {
        active = false;
        focused.current = false;
        void session.interrupt();
      };
    }, [canChooseWebFile, environment.id, legacyEnvironmentId, session]),
  );

  const active = ['requesting', 'recording', 'paused', 'saving'].includes(snapshot.status);
  const disablePrevention = usePreventRemove(active, ({ repeat }) => {
    if (exitPromptOpen.current) return;
    if (session.getSnapshot().status === 'saving') {
      Alert.alert('음성을 저장하고 있어요', '저장이 끝날 때까지 잠시 기다려주세요.');
      return;
    }
    exitPromptOpen.current = true;
    Alert.alert(
      '녹음을 취소할까요?',
      '녹음 중인 음성은 삭제됩니다.',
      [
        {
          text: '계속 녹음',
          style: 'cancel',
          onPress: () => {
            exitPromptOpen.current = false;
          },
        },
        {
          text: '녹음 삭제',
          style: 'destructive',
          onPress: () => {
            void session.discard().then(() => {
              exitPromptOpen.current = false;
              if (alive.current && session.getSnapshot().status === 'idle') repeat();
            });
          },
        },
      ],
      { cancelable: false },
    );
  });

  async function finish() {
    if (!title.trim()) return;
    const saved = await session.finish(title.trim(), environment);
    if (saved && alive.current) {
      disablePrevention();
      router.replace({ pathname: '/transcription', params: { recordingId: saved.id } });
    }
  }

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace('/expert');
  }

  function openTranscription(recordingId: string) {
    if (focused.current) router.push({ pathname: '/transcription', params: { recordingId } });
  }

  return (
    <>
      <RecordingView
        {...snapshot}
        status={setupError ? 'error' : snapshot.status}
        message={setupError ?? snapshot.message}
        title={title}
        onTitleChange={setTitle}
        environmentName={`${environment.name} · ${environment.deviceName}`}
        onStart={() => {
          if (setupError) Alert.alert('녹음 안내', setupError);
          else void session.start();
        }}
        onPause={() => {
          void session.pause();
        }}
        onResume={() => {
          void session.resume();
        }}
        onFinish={() => {
          void finish();
        }}
        onBack={goBack}
        onSettings={() => {
          void Linking.openSettings()
            // Returning from settings must allow a fresh permission check, not another settings-only button.
            .then(() => session.discard())
            .catch(() => {
              Alert.alert(
                '설정을 열지 못했어요',
                '기기 설정에서 HandsOn의 마이크 권한을 허용해주세요.',
              );
            });
        }}
        onHelp={() => setHelp(true)}
        onOpenRecentRecording={
          !active && recentRecordingId ? () => openTranscription(recentRecordingId) : undefined
        }
        webFilePicker={
          canChooseWebFile ? (
            <WebRecordingPicker
              title={title}
              environment={environment}
              onSaved={openTranscription}
            />
          ) : undefined
        }
        onPreviewTranscription={
          canPreviewTranscription
            ? () =>
                router.push({
                  pathname: '/transcription',
                  params: { recordingId: demoTranscriptionRecordingId },
                })
            : undefined
        }
      />
      <BottomSheet
        open={help}
        onClose={() => setHelp(false)}
        title={canChooseWebFile ? '오디오 파일 안내' : '녹음 안내'}
        icon="mic"
      >
        {canChooseWebFile ? (
          <AppText>
            선택한 파일은 이 브라우저에 저장되며, 전사를 위해 Edge 서버로 전송됩니다.
          </AppText>
        ) : (
          <>
            <AppText>
              준비물부터 완료 기준까지 실제 작업 순서대로 설명해주세요. 일시정지 후 같은 녹음을
              이어갈 수 있어요.
            </AppText>
            <AppText>
              다른 앱으로 이동하거나 녹음을 취소하면 저장하지 않은 음성은 삭제됩니다. 종료한 음성은
              이 기기에 저장됩니다.
            </AppText>
          </>
        )}
        <Button label="확인" onPress={() => setHelp(false)} />
      </BottomSheet>
    </>
  );
}
