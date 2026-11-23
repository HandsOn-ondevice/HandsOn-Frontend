import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ActionShelf,
  AppBar,
  AppText,
  BottomSheet,
  Button,
  FeedbackPanel,
  Icon,
  StatusBar,
  SurfaceCard,
  colors,
  spacing,
} from '@/design-system';
import {
  selectVoiceClarification,
  voiceChoiceLabels,
  type VoiceChoice,
} from '../domain/voice-clarification';
import { procedureDisplayTitle } from './procedure-display-title';
import { useWorkflowSession } from '../state/useWorkflowSession';

export function VoiceClarificationScreen({
  sessionId,
  onBack,
}: {
  sessionId: string;
  onBack: () => void;
}) {
  const { session, loading, pending, error, refresh, execute } = useWorkflowSession(sessionId);
  const state = session ? selectVoiceClarification(session) : null;
  const request = state?.request;
  const [selection, setSelection] = useState<{ commandId: string; choice: VoiceChoice } | null>(
    null,
  );
  const [menu, setMenu] = useState(false);
  const choice = selection?.commandId === request?.commandId ? selection?.choice : undefined;
  const cancel = async () => {
    if (loading || pending) return;
    if (request && state?.canCancel) {
      const next = await execute({
        type: 'dismissVoiceClarification',
        commandId: request.commandId,
      });
      if (next && !next.execution?.pendingVoice) onBack();
    } else onBack();
  };
  const confirm = async () => {
    if (!request) {
      onBack();
      return;
    }
    if (!state?.valid || !choice || pending) return;
    const next = await execute({
      type: 'resolveVoiceClarification',
      commandId: request.commandId,
      choice,
    });
    if (next && !next.execution?.pendingVoice) onBack();
  };
  const labels: Record<VoiceChoice, string> = {
    ...voiceChoiceLabels,
    remeasure: `${state?.condition?.label ?? ''} 조건 ${request?.cursor.trialIndex ?? ''}회차 다시 측정`,
  };
  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <StatusBar tone="light" />
      <AppBar
        title="모호한 음성 확인"
        mode="back"
        onBack={() => {
          void cancel();
        }}
        onMore={() => setMenu(true)}
      />
      <ScrollView contentContainerStyle={styles.content}>
        <AppText variant="title" accessibilityRole="header">
          {procedureDisplayTitle(session?.procedure)}
        </AppText>
        {request ? (
          <AppText variant="caption">
            {state?.condition?.label ?? request.cursor.conditionId} 조건 ·{' '}
            {request.cursor.trialIndex}회차
          </AppText>
        ) : null}
        {loading ? (
          <AppText accessibilityLiveRegion="polite">확인 요청을 불러오고 있습니다.</AppText>
        ) : null}
        {error ? (
          <>
            <FeedbackPanel
              title="음성 확인을 처리하지 못했습니다"
              subtitle={error}
              tone="danger"
              icon="alert"
            />
            <Button
              label="요청 다시 불러오기"
              variant="secondary"
              onPress={refresh}
              disabled={pending}
            />
          </>
        ) : null}
        {request ? (
          <>
            <SurfaceCard style={styles.question}>
              <View style={styles.mic}>
                <Icon name="mic" color={colors.status.warning} />
              </View>
              <AppText variant="heading">
                “{request.utterance}”가{'\n'}어떤 뜻인가요?
              </AppText>
            </SurfaceCard>
            <View style={styles.choices}>
              {(['repeatGuidance', 'remeasure', 'doNothing'] as const).map((value) => (
                <Button
                  key={value}
                  label={labels[value]}
                  accessibilityLabel={`${labels[value]}${choice === value ? ' · 선택됨' : ''}`}
                  accessibilityHint="선택 후 하단 현재 작업으로 돌아가기 버튼으로 확정합니다. 뒤로 가면 선택 없이 취소합니다."
                  variant={choice === value ? 'primary' : 'secondary'}
                  icon={
                    value === 'repeatGuidance'
                      ? 'guidance'
                      : value === 'remeasure'
                        ? 'retry'
                        : 'back'
                  }
                  disabled={!state?.valid || pending}
                  onPress={() => setSelection({ commandId: request.commandId, choice: value })}
                />
              ))}
            </View>
            {!state?.valid ? (
              <AppText accessibilityLiveRegion="polite">{state?.reason}</AppText>
            ) : null}
            <View style={styles.guard}>
              <Icon name="lock" color={colors.text.secondary} />
              <AppText variant="caption" style={styles.flex}>
                현재 단계와 측정 회차는 바꾸지 않았습니다.
              </AppText>
            </View>
          </>
        ) : !loading && session ? (
          <FeedbackPanel
            title={
              state?.lastResolution
                ? '이미 처리한 음성 확인 요청입니다'
                : '전달된 음성 확인 요청이 없습니다'
            }
            subtitle={
              state?.lastResolution
                ? `처리 결과: ${voiceChoiceLabels[state.lastResolution.choice]}. 새 명령은 실행하지 않습니다.`
                : state?.reason
            }
            tone="info"
          />
        ) : null}
      </ScrollView>
      <ActionShelf
        safeArea
        primary="현재 작업으로 돌아가기"
        loading={pending}
        disabled={loading || pending || (!!request && (!state?.valid || !choice))}
        onPrimary={() => {
          void confirm();
        }}
      />
      <BottomSheet open={menu} title="음성 확인 정보" onClose={() => setMenu(false)}>
        {session ? <AppText variant="caption">절차 v{session.procedure.version}</AppText> : null}
        <AppText>뜻을 선택한 뒤 하단 버튼으로 확정합니다. 뒤로 가면 선택 없이 취소합니다.</AppText>
        <AppText>
          음성 입력과 안내 재생 서비스는 아직 연결되지 않았습니다. 안내는 화면에서 확인할 수
          있습니다. 다시 측정은 현재 회차의 응답을 새로 확인하며 작업을 자동으로 완료하지 않습니다.
        </AppText>
        <AppText>
          현재 작업이나 측정값이 바뀌면 선택을 확정할 수 없습니다. 뒤로 가면 선택 없이 취소합니다.
        </AppText>
      </BottomSheet>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface.canvas },
  content: { paddingHorizontal: spacing[24], paddingVertical: spacing[16], gap: spacing[12] },
  question: { gap: spacing[16], padding: spacing[24], minHeight: 224, justifyContent: 'center' },
  mic: {
    alignSelf: 'center',
    backgroundColor: colors.status.warningBg,
    padding: spacing[12],
    borderRadius: spacing[12],
  },
  choices: { gap: spacing[16] },
  guard: { flexDirection: 'row', gap: spacing[8], alignItems: 'center' },
  flex: { flex: 1 },
});
