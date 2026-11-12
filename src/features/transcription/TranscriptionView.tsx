import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  AppBar,
  AppText,
  Button,
  Icon,
  StatusBar,
  SurfaceCard,
  TextField,
  colors,
  radii,
  spacing,
} from '@/design-system';
import type { SavedRecording } from '@/features/recording/recordingSession';
import { demoTranscriptionChecklist } from './transcriptionService';

interface TranscriptionViewProps {
  recording?: SavedRecording;
  text?: string;
  busy: boolean;
  canGenerate: boolean;
  demo: boolean;
  feedback?: ReactNode;
  onChange: (text: string) => void;
  onGenerate: () => void;
  onBack: () => void;
  onMore: () => void;
}

export function TranscriptionView({
  recording,
  text,
  busy,
  canGenerate,
  demo,
  feedback,
  onChange,
  onGenerate,
  onBack,
  onMore,
}: TranscriptionViewProps) {
  const duration = Math.floor((recording?.durationMs ?? 0) / 1000);
  const characterCount = text === undefined ? '' : ` · ${Array.from(text).length}자`;
  return (
    <View style={styles.screen}>
      <StatusBar />
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.screen}>
        <AppBar title="STT 텍스트 확인" mode="back" onBack={onBack} onMore={onMore} />
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          style={styles.screen}
        >
          <View style={styles.heading}>
            <AppText variant="heading" accessibilityRole="header">
              변환 텍스트 확인
            </AppText>
            {recording ? (
              <>
                <AppText variant="label">{recording.title}</AppText>
                <AppText variant="caption" color={colors.text.secondary}>
                  {`녹음 길이 ${Math.floor(duration / 60)}분 ${duration % 60}초${characterCount}${demo ? ' · 모의 변환' : ''}`}
                </AppText>
              </>
            ) : null}
          </View>
          {text === undefined ? (
            feedback
          ) : (
            <>
              <View style={styles.success} accessibilityLiveRegion="polite">
                <View style={styles.successHeading}>
                  <Icon name="check" color={colors.status.success} />
                  <AppText variant="title" color={colors.status.success} style={styles.flexText}>
                    STT 변환이 완료되었습니다
                  </AppText>
                </View>
                <AppText>장치명과 수치를 먼저 확인하세요.</AppText>
              </View>
              <TextField
                label="변환 텍스트"
                value={text}
                onChange={onChange}
                multiline
                disabled={busy}
                support={text.trim() ? undefined : '초안을 생성할 텍스트를 입력해 주세요.'}
              />
              {feedback}
              {demo ? (
                <View style={styles.review}>
                  <AppText variant="label" accessibilityRole="header">
                    AI가 확인한 주요 항목
                  </AppText>
                  {demoTranscriptionChecklist.map(({ id, title, description, status }) => {
                    const warning = status === '질문 예정';
                    const color = warning ? colors.status.warning : colors.status.success;
                    return (
                      <SurfaceCard key={id} style={[styles.reviewRow, warning && styles.warning]}>
                        <View style={[styles.check, !warning && styles.checked]}>
                          <Icon name="check" size={18} color={color} />
                        </View>
                        <View style={styles.flexText}>
                          <AppText variant="label">{title}</AppText>
                          <AppText variant="caption" color={colors.text.secondary}>
                            {description}
                          </AppText>
                        </View>
                        <AppText variant="caption" color={color}>
                          {status}
                        </AppText>
                      </SurfaceCard>
                    );
                  })}
                </View>
              ) : null}
              <View style={styles.retention}>
                <Icon name="lock" size={16} color={colors.text.secondary} />
                <AppText variant="caption" color={colors.text.secondary} style={styles.flexText}>
                  음성 원문과 수정 텍스트를 함께 보존합니다.
                </AppText>
              </View>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
      <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.actions}>
        <Button
          label={busy ? 'AI 절차 초안 생성 중' : 'AI 절차 초안 생성'}
          testID="transcription-generate"
          loading={busy}
          disabled={!busy && !canGenerate}
          onPress={onGenerate}
        />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface.canvas },
  content: {
    paddingHorizontal: spacing[24],
    paddingTop: spacing[24],
    paddingBottom: spacing[24],
    gap: spacing[14],
  },
  heading: { gap: spacing[4] },
  success: {
    padding: spacing[16],
    gap: spacing[8],
    borderRadius: radii[20],
    backgroundColor: colors.status.successBg,
  },
  successHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing[8] },
  flexText: { flex: 1, minWidth: 0 },
  review: { gap: spacing[12] },
  reviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing[12],
    minHeight: 66,
    borderRadius: radii[16],
    gap: spacing[10],
  },
  warning: { backgroundColor: colors.status.warningBg },
  check: {
    width: 32,
    height: 32,
    borderRadius: radii[12],
    alignItems: 'center',
    justifyContent: 'center',
  },
  checked: { backgroundColor: colors.status.successBg },
  retention: { flexDirection: 'row', alignItems: 'center', gap: spacing[8], padding: spacing[8] },
  actions: {
    paddingHorizontal: spacing[24],
    paddingTop: spacing[14],
    paddingBottom: spacing[18],
    backgroundColor: colors.surface.card,
  },
});
