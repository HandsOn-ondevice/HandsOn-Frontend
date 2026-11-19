import { Pressable, StyleSheet, View } from 'react-native';
import { AppText, FeedbackPanel, Icon, VoicePanel, colors, radii, spacing } from '@/design-system';
import { cleanupRequirements, selectCleanup } from '../domain/completion';
import { useWorkflowSession } from '../state/useWorkflowSession';
import { useMeasurementAge } from './useMeasurementAge';
import {
  ActionShelf,
  CompletionScaffold,
  UnavailableCompletion,
  completionStep,
  completionStyles,
  recordedTime,
} from './CompletionParts';

export function CleanupScreen({
  sessionId,
  onBack,
  onResults,
}: {
  sessionId: string;
  onBack: () => void;
  onResults: () => void;
}) {
  const resource = useWorkflowSession(sessionId);
  const { session, loading, pending, execute } = resource;
  const state = session ? selectCleanup(session) : null;
  const age = useMeasurementAge(state?.attempt?.report?.checkedAt);
  const finish = async () => {
    const next = await execute({ type: 'finishExperiment' });
    if (next?.phase === 'completed') onResults();
  };
  const voltage = state?.passed
    ? state.attempt?.report?.readings.find((item) => item.metricId === 'voltage')
    : undefined;
  const current = state?.passed
    ? state.attempt?.report?.readings.find((item) => item.metricId === 'current')
    : undefined;
  return (
    <CompletionScaffold
      title="종료와 장치 정리"
      {...resource}
      onBack={onBack}
      action={
        <ActionShelf
          safeArea
          layout="single"
          primary={state?.canFinish ? '완료하고 결과 보기' : '정리 확인 후 종료 가능'}
          disabled={loading || !state?.canFinish}
          loading={pending}
          onPrimary={() => {
            void finish();
          }}
        />
      }
    >
      {session && state?.available ? (
        <>
          <AppText variant="caption" color={colors.text.secondary}>
            {completionStep(session, 15)}
          </AppText>
          <FeedbackPanel
            title="모든 측정이 완료되었습니다"
            subtitle={`${session.procedure.execution?.conditions.length}개 조건 · 유효 측정 ${state.review.validCount}회 · ${state.review.validCount}/${state.review.required} 유효`}
            tone="success"
            icon="check"
          />
          <AppText variant="heading" accessibilityRole="header">
            {'실험 장치를\n안전하게 정리하세요'}
          </AppText>
          <AppText color={colors.text.secondary}>
            각 항목은 실제 작업자의 확인을 별도로 기록합니다.
          </AppText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="LED 출력 0% 명령 전송"
            accessibilityState={{ disabled: pending || state.attempt?.status !== 'failed' }}
            disabled={pending || state.attempt?.status !== 'failed'}
            onPress={() => {
              void execute({ type: 'retryCleanupOutput' });
            }}
            style={[
              styles.commandRow,
              { backgroundColor: state.passed ? colors.status.successBg : colors.status.warningBg },
            ]}
          >
            <View
              style={[
                styles.commandIcon,
                { backgroundColor: state.passed ? colors.status.success : colors.surface.card },
              ]}
            >
              <Icon
                name={state.passed ? 'check' : 'alert'}
                size={18}
                color={state.passed ? colors.text.inverse : colors.status.warning}
              />
            </View>
            <View style={completionStyles.flex}>
              <AppText variant="label">LED 출력 0% 명령 전송</AppText>
              <AppText variant="caption" color={colors.text.secondary}>
                {state.pending
                  ? '시스템 명령 · 응답 대기'
                  : state.passed
                    ? `시스템 명령 · ${recordedTime(state.attempt?.completedAt)}`
                    : (state.attempt?.issue?.message ?? '시스템 응답 확인 필요')}
              </AppText>
            </View>
          </Pressable>
          {cleanupRequirements.map((item, index) => {
            const checked = state.checked(item.id);
            const previous =
              state.passed &&
              cleanupRequirements
                .slice(0, index)
                .every((requirement) => state.checked(requirement.id));
            const later = cleanupRequirements
              .slice(index + 1)
              .some((requirement) => state.checked(requirement.id));
            // 공유 CheckboxRow는 disabled일 때 checked 색도 지운다. S13의 잠긴 완료 항목은 초록을 유지한다.
            return (
              <Pressable
                key={item.id}
                accessibilityRole="checkbox"
                accessibilityLabel={item.title}
                accessibilityHint={checked ? item.confirmed : item.description}
                accessibilityState={{ checked, disabled: pending || !previous || later }}
                disabled={pending || !previous || later}
                onPress={() => {
                  void execute({ type: 'setCleanupCheck', checkId: item.id, checked: !checked });
                }}
                style={[
                  styles.commandRow,
                  {
                    backgroundColor: checked
                      ? colors.status.successBg
                      : previous
                        ? colors.status.warningBg
                        : colors.surface.card,
                  },
                ]}
              >
                <View
                  style={[
                    styles.commandIcon,
                    {
                      borderWidth: 1,
                      borderColor: checked
                        ? colors.status.success
                        : previous
                          ? colors.status.warning
                          : colors.border.default,
                      backgroundColor: checked ? colors.status.success : colors.surface.card,
                    },
                  ]}
                >
                  {checked || previous ? (
                    <Icon
                      name={checked ? 'check' : 'alert'}
                      size={18}
                      color={checked ? colors.text.inverse : colors.status.warning}
                    />
                  ) : null}
                </View>
                <View style={completionStyles.flex}>
                  <AppText variant="label">{item.title}</AppText>
                  <AppText variant="caption" color={colors.text.secondary}>
                    {checked ? item.confirmed : item.description}
                  </AppText>
                </View>
              </Pressable>
            );
          })}
          <View style={styles.sensor}>
            <View style={completionStyles.identity}>
              <AppText variant="label">
                {state.checked('powerOff') ? 'INA219 마지막 응답' : '현재 INA219'}
              </AppText>
              <AppText
                variant="caption"
                color={state.passed ? colors.status.success : colors.text.secondary}
              >
                {state.passed ? age : '응답 확인 필요'}
              </AppText>
            </View>
            <AppText variant="caption" color={colors.text.secondary}>
              전압 · 전류
            </AppText>
            <View
              style={[
                styles.reading,
                { backgroundColor: state.passed ? colors.status.successBg : colors.surface.canvas },
              ]}
            >
              <AppText
                variant="title"
                color={state.passed ? colors.status.success : colors.text.secondary}
              >
                {voltage && current
                  ? `${voltage.value?.toFixed(2)} ${voltage.unit} · ${current.value} ${current.unit}`
                  : '—'}
              </AppText>
            </View>
            <AppText variant="caption" color={colors.status.success}>
              센서값은 물리 스위치 OFF 확인을 대신하지 않습니다.
            </AppText>
          </View>
          <VoicePanel
            state={state.canFinish ? 'confirmed' : 'clarify'}
            icon={state.canFinish ? 'check' : 'alert'}
            title={
              state.canFinish
                ? '정리 확인 완료'
                : state.count === 0
                  ? '작업자 확인 필요'
                  : '다음 정리 항목을 확인해 주세요'
            }
            subtitle={
              state.canFinish
                ? '작업자 확인과 센서 근거를 각각 기록했습니다.'
                : state.count === 0
                  ? '“물리 전원 꺼진 것 확인했어” · 위 항목에서 직접 확인해 주세요.'
                  : state.count === 1
                    ? '전원을 차단한 뒤 센서 케이블을 분리해 주세요.'
                    : 'LED 모듈과 지그를 보관 위치에 정리해 주세요.'
            }
          />
        </>
      ) : !loading && session ? (
        <UnavailableCompletion />
      ) : null}
    </CompletionScaffold>
  );
}
const styles = StyleSheet.create({
  commandRow: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[12],
    padding: spacing[12],
    borderRadius: radii[16],
  },
  commandIcon: {
    width: 24,
    height: 24,
    borderRadius: radii[8],
    alignItems: 'center',
    justifyContent: 'center',
  },
  sensor: {
    backgroundColor: colors.surface.card,
    padding: spacing[14],
    gap: spacing[8],
    borderRadius: radii[20],
  },
  reading: {
    padding: spacing[8],
    minHeight: 48,
    justifyContent: 'center',
    borderRadius: radii[12],
  },
});
