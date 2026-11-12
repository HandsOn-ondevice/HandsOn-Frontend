import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { useFocusEffect, useLocalSearchParams, usePreventRemove, useRouter } from 'expo-router';
import {
  AppBar,
  AppText,
  Button,
  FeedbackPanel,
  Screen,
  StatusBar,
  SurfaceCard,
} from '@/design-system';
import { readSavedRecording, deleteSavedRecording } from '@/features/recording/recordingStorage';
import type { SavedRecording } from '@/features/recording/recordingSession';
import { formatRecordingTime } from '@/features/recording/RecordingView';

// E03 owns STT requests in #9. This route only reads the persisted E02 original.
export default function TranscriptionRoute() {
  const { recordingId } = useLocalSearchParams<{ recordingId?: string }>();
  return <OriginalRecording key={recordingId ?? ''} recordingId={recordingId ?? ''} />;
}

function OriginalRecording({ recordingId }: { recordingId: string }) {
  const router = useRouter();
  const [recording, setRecording] = useState<SavedRecording | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const focused = useRef(false);
  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      return () => {
        focused.current = false;
      };
    }, []),
  );
  const disablePrevention = usePreventRemove(deleting, () => {
    Alert.alert('원본을 삭제하고 있어요', '삭제가 끝날 때까지 잠시 기다려주세요.');
  });

  useEffect(() => {
    let active = true;
    void readSavedRecording(recordingId ?? '').then(
      (saved) => {
        if (active) {
          setRecording(saved);
          setFailed(!saved);
        }
      },
      () => {
        if (active) setFailed(true);
      },
    );
    return () => {
      active = false;
    };
  }, [recordingId, attempt]);

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }

  async function removeOriginal() {
    if (!recording || deleting) return;
    setDeleting(true);
    try {
      await deleteSavedRecording(recording.id);
      if (!focused.current) return;
      disablePrevention();
      goBack();
    } catch {
      if (!focused.current) return;
      setDeleting(false);
      Alert.alert('원본을 삭제하지 못했어요', '잠시 후 다시 시도해주세요.');
    }
  }

  return (
    <Screen scroll>
      <StatusBar />
      <AppBar
        title="STT 텍스트 확인"
        mode="back"
        onBack={goBack}
        onMore={() =>
          Alert.alert('음성 원본', '원본은 이 기기에 보관됩니다. 화면을 나가도 삭제되지 않습니다.')
        }
      />
      {recording ? (
        <>
          <AppText variant="heading" accessibilityRole="header">
            {recording.title}
          </AppText>
          <FeedbackPanel
            title="음성 원본을 저장했어요"
            subtitle="텍스트 변환 연결을 기다리고 있어요."
            icon="check"
            tone="success"
          />
          <SurfaceCard title="녹음 정보" subtitle={recording.environment.name}>
            <AppText>{`녹음 길이 · ${formatRecordingTime(recording.durationMs)}`}</AppText>
            <AppText>{`원본 파일 · ${recording.fileName}`}</AppText>
            <AppText>{`AAC / M4A · ${recording.sizeBytes.toLocaleString()} bytes`}</AppText>
          </SurfaceCard>
          <FeedbackPanel
            title="아직 텍스트로 변환하지 않았어요"
            subtitle="STT 연결 후 이 음성 원본으로 변환을 요청합니다."
          />
          <Button label="돌아가기" variant="secondary" onPress={goBack} disabled={deleting} />
          <Button
            label="원본 삭제하고 돌아가기"
            variant="tertiary"
            loading={deleting}
            onPress={() => {
              Alert.alert('음성 원본을 삭제할까요?', '삭제한 음성은 다시 사용할 수 없습니다.', [
                { text: '취소', style: 'cancel' },
                {
                  text: '원본 삭제',
                  style: 'destructive',
                  onPress: () => {
                    void removeOriginal();
                  },
                },
              ]);
            }}
          />
        </>
      ) : failed ? (
        <>
          <FeedbackPanel
            title="음성 원본을 확인하지 못했어요"
            subtitle="저장된 음성을 찾을 수 없거나 파일이 유효하지 않습니다."
            tone="warning"
            icon="alert"
          />
          <Button
            label="다시 확인"
            onPress={() => {
              setFailed(false);
              setRecording(null);
              setAttempt((value) => value + 1);
            }}
          />
          <Button label="돌아가기" variant="secondary" onPress={goBack} />
        </>
      ) : (
        <AppText>음성 원본을 확인하고 있어요.</AppText>
      )}
    </Screen>
  );
}
