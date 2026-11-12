import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Alert, AppState, Linking, Platform } from 'react-native';
import { useFocusEffect, usePreventRemove, useRouter } from 'expo-router';
import { BottomSheet, AppText, Button } from '@/design-system';
import type { WorkEnvironment } from '@/features/entry/entryEnvironment';
import { createRecordingSession } from './nativeRecording';
import { RecordingView } from './RecordingView';

export function RecordingScreen({ environment }: { environment: WorkEnvironment }) {
  const router = useRouter();
  // The controller is pure JS; native resources are acquired only by start().
  const [session] = useState(createRecordingSession);
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const [title, setTitle] = useState('');
  const [help, setHelp] = useState(false);
  const setupError =
    Platform.OS !== 'android' ? '음성 녹음은 Android 앱에서 사용할 수 있어요.' : undefined;
  const alive = useRef(false);
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
    useCallback(
      () => () => {
        void session.interrupt();
      },
      [session],
    ),
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
      />
      <BottomSheet open={help} onClose={() => setHelp(false)} title="녹음 안내" icon="mic">
        <AppText>
          준비물부터 완료 기준까지 실제 작업 순서대로 설명해주세요. 일시정지 후 같은 녹음을 이어갈
          수 있어요.
        </AppText>
        <AppText>
          다른 앱으로 이동하거나 녹음을 취소하면 저장하지 않은 음성은 삭제됩니다. 종료한 음성은 이
          기기에 저장됩니다.
        </AppText>
        <Button label="확인" onPress={() => setHelp(false)} />
      </BottomSheet>
    </>
  );
}
