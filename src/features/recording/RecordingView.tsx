import { ScrollView, StyleSheet, View } from 'react-native';

import {
  AppBar,
  AppText,
  Button,
  FeedbackPanel,
  Screen,
  StatusBadge,
  StatusBar,
  SurfaceCard,
  TextField,
  VoicePanel,
  colors,
  radii,
  spacing,
  type VoiceState,
} from '@/design-system';
import type { RecordingStatus } from './recordingSession';

export interface RecordingViewProps {
  status: RecordingStatus;
  durationMs: number;
  metering: readonly number[];
  message?: string;
  canAskAgain?: boolean;
  title: string;
  onTitleChange: (title: string) => void;
  environmentName: string;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onFinish: () => void;
  onBack: () => void;
  onSettings: () => void;
  onHelp: () => void;
}

const prompts = ['준비물', '작업 순서', '주의사항', '완료 기준'];
const waveformSamples = 28;

const statusLabels: Record<RecordingStatus, string> = {
  idle: '녹음 대기',
  requesting: '녹음 준비 중',
  recording: '녹음 중',
  paused: '일시정지',
  saving: '원본 저장 중',
  saved: '원본 저장 완료',
  permissionDenied: '권한 필요',
  error: '녹음 실패',
  interrupted: '녹음 중단',
};

export function formatRecordingTime(durationMs: number) {
  const seconds = Number.isFinite(durationMs) ? Math.max(0, Math.floor(durationMs / 1000)) : 0;
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
}

function recordingCopy(status: RecordingStatus): {
  state: VoiceState;
  title: string;
  subtitle: string;
  icon: 'mic' | 'pause' | 'retry' | 'alert';
} {
  switch (status) {
    case 'recording':
      return {
        state: 'listening',
        title: '녹음 중이에요',
        subtitle: '마이크로 들어오는 음성을 원본으로 기록하고 있어요.',
        icon: 'mic',
      };
    case 'paused':
      return {
        state: 'idle',
        title: '녹음을 일시정지했어요',
        subtitle: '원본 녹음을 유지합니다. 다시 시작할 수 있어요.',
        icon: 'pause',
      };
    case 'requesting':
      return {
        state: 'idle',
        title: '녹음을 준비하고 있어요',
        subtitle: '마이크 권한과 녹음 장치를 확인합니다.',
        icon: 'mic',
      };
    case 'saving':
      return {
        state: 'idle',
        title: '음성 원본을 저장하고 있어요',
        subtitle: '파일을 확인한 뒤 텍스트 확인 단계로 이동합니다.',
        icon: 'retry',
      };
    case 'saved':
      return {
        state: 'idle',
        title: '음성 원본을 저장했어요',
        subtitle: '저장된 원본으로 다음 단계를 준비합니다.',
        icon: 'mic',
      };
    case 'error':
    case 'interrupted':
      return {
        state: 'error',
        title: status === 'interrupted' ? '녹음이 중단되었어요' : '녹음을 마치지 못했어요',
        subtitle: '아래 안내를 확인하고 새로 녹음해 주세요.',
        icon: 'alert',
      };
    default:
      return {
        state: 'idle',
        title: '설명을 시작할 준비가 됐어요',
        subtitle: '녹음 시작을 누르고 실제 작업 순서를 말씀해 주세요.',
        icon: 'mic',
      };
  }
}

export function RecordingView({
  status,
  durationMs,
  metering,
  message,
  canAskAgain,
  title,
  onTitleChange,
  environmentName,
  onStart,
  onPause,
  onResume,
  onFinish,
  onBack,
  onSettings,
  onHelp,
}: RecordingViewProps) {
  const busy = status === 'requesting' || status === 'saving';
  const hasRecording = status === 'recording' || status === 'paused';
  const controlsVisible = hasRecording || status === 'saving';
  const titleMissing = !title.trim();
  const requiresSettings = status === 'permissionDenied' && canAskAgain === false;
  const copy = recordingCopy(status);
  const time = formatRecordingTime(durationMs);
  const samples = metering.slice(-waveformSamples);
  const bars = [...Array<number>(waveformSamples - samples.length).fill(-60), ...samples];

  return (
    <Screen style={styles.screen}>
      <StatusBar />
      <View style={styles.canvas}>
        <AppBar title="음성 설명 녹음" mode="back" onBack={onBack} onMore={onHelp} />
        <ScrollView
          style={styles.viewport}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.status} testID="recording-status">
            <StatusBadge
              label={status === 'recording' ? 'REC · 녹음 중' : statusLabels[status]}
              tone={hasRecording ? 'danger' : status === 'error' ? 'warning' : 'info'}
            />
          </View>
          <AppText variant="heading" accessibilityRole="header">
            {'실제 작업 순서를\n자연스럽게 설명하세요'}
          </AppText>
          <AppText color={colors.text.secondary}>
            준비물, 순서, 주의사항, 완료 기준을 함께 말해주세요.
          </AppText>
          <TextField
            label="절차 이름"
            value={title}
            onChange={onTitleChange}
            placeholder="어떤 작업의 절차인가요?"
            disabled={busy || hasRecording || status === 'saved'}
            maxLength={120}
            returnKeyType="done"
            support={titleMissing ? '절차 이름을 입력한 뒤 녹음을 시작해 주세요.' : undefined}
          />
          <SurfaceCard tone="subtle" title="작업 환경" subtitle={environmentName} />
          <SurfaceCard style={styles.waveformCard}>
            <View
              style={styles.waveform}
              accessible={false}
              importantForAccessibility="no-hide-descendants"
            >
              {bars.map((sample, index) => (
                <View
                  key={index}
                  style={[
                    styles.waveformBar,
                    {
                      height:
                        6 +
                        (Number.isFinite(sample)
                          ? Math.max(0, Math.min(1, (sample + 60) / 60))
                          : 0) *
                          50,
                      opacity: samples.length ? 1 : 0.35,
                    },
                  ]}
                />
              ))}
            </View>
            <AppText
              variant="measurement"
              color={colors.text.action}
              testID="recording-duration"
              accessibilityLabel={`녹음 시간 ${time}`}
            >
              {time}
            </AppText>
          </SurfaceCard>

          {status === 'permissionDenied' ? (
            <FeedbackPanel
              title="마이크 권한이 필요해요"
              subtitle={
                message ??
                (requiresSettings
                  ? '설정에서 마이크 권한을 허용한 뒤 돌아와 녹음을 시작해 주세요.'
                  : '마이크 사용을 허용하면 절차 설명을 녹음할 수 있어요.')
              }
              tone="warning"
              icon="mic"
            />
          ) : (
            <VoicePanel {...copy} />
          )}
          {message && status !== 'permissionDenied' ? (
            <FeedbackPanel
              title={status === 'interrupted' ? '새로 녹음해 주세요' : '녹음 안내'}
              subtitle={message}
              tone={status === 'error' || status === 'interrupted' ? 'warning' : 'info'}
              icon="alert"
            />
          ) : null}
          <View style={styles.prompts} accessibilityLabel="설명에 포함할 내용">
            {prompts.map((prompt) => (
              <StatusBadge key={prompt} label={prompt} />
            ))}
          </View>
        </ScrollView>
      </View>

      <View style={styles.actions}>
        {controlsVisible ? (
          <>
            <Button
              label={status === 'paused' ? '녹음 재개' : '일시정지'}
              testID={status === 'paused' ? 'recording-resume' : 'recording-pause'}
              variant="secondary"
              onPress={status === 'paused' ? onResume : onPause}
              disabled={busy}
              style={styles.secondaryAction}
            />
            <Button
              label="녹음 종료"
              testID="recording-finish"
              onPress={onFinish}
              disabled={busy || titleMissing || durationMs <= 0}
              loading={status === 'saving'}
              style={styles.primaryAction}
            />
          </>
        ) : (
          <Button
            label={requiresSettings ? '설정 열기' : '녹음 시작'}
            testID={requiresSettings ? 'recording-settings' : 'recording-start'}
            onPress={requiresSettings ? onSettings : onStart}
            icon={requiresSettings ? undefined : 'mic'}
            disabled={busy || (!requiresSettings && titleMissing) || status === 'saved'}
            loading={status === 'requesting'}
            style={styles.singleAction}
          />
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.surface.card },
  canvas: { flex: 1, backgroundColor: colors.surface.canvas },
  viewport: { flex: 1 },
  content: {
    paddingHorizontal: spacing[24],
    paddingTop: spacing[20],
    paddingBottom: spacing[16],
    gap: spacing[16],
  },
  status: { alignSelf: 'flex-start' },
  waveformCard: { gap: spacing[16], padding: spacing[20], borderRadius: radii[24] },
  waveform: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[4],
    paddingHorizontal: spacing[4],
  },
  waveformBar: {
    flex: 1,
    minWidth: 1,
    borderRadius: radii[999],
    backgroundColor: colors.action.primary,
  },
  prompts: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[8] },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[12],
    paddingHorizontal: spacing[24],
    paddingTop: spacing[14],
    paddingBottom: spacing[18],
    backgroundColor: colors.surface.card,
  },
  secondaryAction: { flex: 160, minWidth: 0 },
  primaryAction: { flex: 192, minWidth: 0 },
  singleAction: { flex: 1 },
});
