import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ActionShelf,
  AppBar,
  AppText,
  BottomSheet,
  Button,
  CheckboxRow,
  FeedbackPanel,
  Icon,
  StatusBar,
  StepProgress,
  colors,
  spacing,
} from '@/design-system';
import { selectPreparation } from '../domain/preparation';
import { useWorkflowSession } from '../state/useWorkflowSession';

export function PreparationScreen({
  sessionId,
  onBack,
  onDeviceCheck,
}: {
  sessionId: string;
  onBack: () => void;
  onDeviceCheck: () => void;
}) {
  const { session, loading, pending, error, execute, refresh } = useWorkflowSession(sessionId);
  const [notice, setNotice] = useState<string | null>(null);
  const [details, setDetails] = useState(false);
  const progress = session ? selectPreparation(session) : null;
  const guidance =
    progress?.current?.guidance ??
    '작업자 준비 확인이 완료되었습니다. 통신 점검은 S05에서 진행합니다.';

  const continuePreparation = async () => {
    if (progress?.awaitingDeviceCheck) {
      onDeviceCheck();
      return;
    }
    const next = await execute({ type: 'completePreparation' });
    if (next?.phase === 'awaitingDeviceCheck') onDeviceCheck();
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <StatusBar tone="light" />
      <AppBar title="실험 준비 체크" mode="back" onBack={onBack} onMore={() => setDetails(true)} />
      <ScrollView contentContainerStyle={styles.content}>
        <AppText variant="heading" accessibilityRole="header">
          실험 전, 하나씩 확인해요.
        </AppText>
        <AppText variant="caption" color={colors.text.secondary}>
          Mock 환경 · 실제 장비·음성 연동 없음
        </AppText>
        {loading ? (
          <AppText accessibilityLiveRegion="polite">준비 상태를 불러오고 있습니다.</AppText>
        ) : null}
        {error ? (
          <FeedbackPanel
            title="준비 상태를 확인해 주세요"
            subtitle={error}
            tone="danger"
            icon="alert"
          />
        ) : null}
        {!loading && error ? (
          <Button
            label="상태 다시 불러오기"
            variant="secondary"
            onPress={refresh}
            disabled={pending}
          />
        ) : null}
        {session && progress ? (
          <>
            <StepProgress
              title={`준비 진행도 · ${progress.completed} / ${progress.total} 항목 완료`}
              value={progress.percentage}
              state="running"
            />
            <FeedbackPanel title="현재 안내" subtitle={guidance} icon="guidance" tone="info" />
            {session.procedure.preparation.map((requirement) => {
              const check = session.checks.find((item) => item.id === requirement.id);
              const checked = check?.checked ?? false;
              const time = check?.confirmedAt
                ? new Date(check.confirmedAt).toLocaleTimeString('ko-KR', {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false,
                  })
                : null;
              return (
                <CheckboxRow
                  key={requirement.id}
                  title={requirement.title}
                  subtitle={checked ? `작업자 확인 · ${time}` : requirement.description}
                  checked={checked}
                  state={
                    checked
                      ? 'checked'
                      : progress.current?.id === requirement.id
                        ? 'current'
                        : 'pending'
                  }
                  disabled={
                    pending || requirement.verifiedAt !== 'S04' || progress.awaitingDeviceCheck
                  }
                  onChange={(value) => {
                    void execute({
                      type: 'setPreparationCheck',
                      checkId: requirement.id,
                      checked: value,
                    });
                  }}
                />
              );
            })}
            <View style={styles.context}>
              <Icon name="lock" size={15} color={colors.text.secondary} />
              <AppText variant="caption" color={colors.text.secondary} style={styles.contextText}>
                거리와 배선 방향은 센서값으로 자동 보증하지 않습니다.
              </AppText>
            </View>
            <AppText variant="caption" color={colors.text.secondary}>
              {progress.canContinue || progress.awaitingDeviceCheck
                ? '작업자 확인 5개 완료 · 통신 점검은 S05에서 확인합니다.'
                : `필수 작업자 확인 ${progress.missing.length}개가 남았습니다. 통신 점검은 S05에서 확인합니다.`}
            </AppText>
          </>
        ) : null}
        {notice ? <AppText accessibilityLiveRegion="polite">{notice}</AppText> : null}
      </ScrollView>
      <ActionShelf
        safeArea
        primary="확인 완료"
        secondary="안내 다시 듣기"
        layout="dual"
        disabled={loading || !progress || (!progress.canContinue && !progress.awaitingDeviceCheck)}
        loading={pending}
        onPrimary={() => {
          void continuePreparation();
        }}
        onSecondary={() =>
          setNotice(`안내 재생 시뮬레이션 · 실제 TTS는 실행하지 않습니다. ${guidance}`)
        }
      />
      <BottomSheet
        open={details}
        onClose={() => setDetails(false)}
        title="실험 준비 정보"
        icon="flask"
      >
        <AppText>Mock 세션 · 앱을 재시작하면 초기화됩니다.</AppText>
        <AppText>
          {session ? `${session.procedure.title} · v${session.procedure.version}` : '세션 조회 중'}
        </AppText>
        <AppText variant="caption">세션 {sessionId}</AppText>
        <AppText>통신 점검은 S05 담당이며 현재 화면에서 센서 확인을 대신하지 않습니다.</AppText>
      </BottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface.canvas },
  content: { padding: spacing[24], gap: spacing[10] },
  context: {
    flexDirection: 'row',
    gap: spacing[8],
    padding: spacing[10],
    alignItems: 'flex-start',
  },
  contextText: { flex: 1 },
});
