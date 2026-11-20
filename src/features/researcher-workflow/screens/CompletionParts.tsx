import { procedureVersionLabel } from './procedure-version-label';
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ActionShelf,
  AppBar,
  AppText,
  BottomSheet,
  Button,
  ConditionProgress,
  FeedbackPanel,
  Icon,
  StatusBar,
  colors,
  radii,
  spacing,
  type ConditionProgressProps,
  type TimelineState,
} from '@/design-system';
import type { ExperimentSession } from '../domain/models';

export function recordedTime(value: string | undefined) {
  return value && Number.isFinite(Date.parse(value))
    ? new Date(value).toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      })
    : '시각 확인 불가';
}
export const formatMetric = (value: number | null | undefined, digits = 1) =>
  value === null || value === undefined || !Number.isFinite(value) ? '—' : value.toFixed(digits);
export function completionStep(session: ExperimentSession, step: 14 | 15) {
  return session.source === 'mock' && session.procedure.execution?.profileVersion === 'led-draft-1'
    ? `${step} / 16단계`
    : undefined;
}

export function CompletionInfo({ session }: { session: ExperimentSession | null }) {
  return (
    <>
      {session ? (
        <AppText>
          세션 {session.sessionId} · 절차 {procedureVersionLabel(session.procedure.version)}
        </AppText>
      ) : null}
      <AppText>
        현재 완료·정리·제출은 시연용 Mock입니다. 실제 Orange Pi 출력 제어·안전 판정·백엔드 전송을
        수행하지 않습니다.
      </AppText>
      <AppText>
        시스템 응답과 작업자의 물리 전원·케이블·보관 확인은 별도로 기록합니다. 무효 측정·복구·재측정
        이력은 삭제하지 않습니다.
      </AppText>
      <AppText>
        제출은 메모리 안의 Mock 검토 대기열 접수입니다. 실제 숙련자에게 전달되거나 영구 저장되지
        않으며 앱 재시작·웹 새로고침 시 기록이 초기화됩니다.
      </AppText>
    </>
  );
}

export function CompletionScaffold({
  title,
  session,
  loading,
  error,
  refresh,
  onBack,
  children,
  action,
  menuChildren,
}: {
  title: string;
  session: ExperimentSession | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
  onBack: () => void;
  children: ReactNode;
  action: ReactNode;
  menuChildren?: ReactNode;
}) {
  const [menu, setMenu] = useState(false);
  return (
    <SafeAreaView style={completionStyles.root} edges={['top']} testID={`completion-${title}`}>
      <StatusBar tone="light" />
      <AppBar title={title} mode="back" onBack={onBack} onMore={() => setMenu(true)} />
      <ScrollView contentContainerStyle={completionStyles.content}>
        {loading ? (
          <AppText accessibilityLiveRegion="polite">세션 기록을 불러오고 있습니다.</AppText>
        ) : null}
        {error ? (
          <FeedbackPanel
            title="현재 기록을 확인해 주세요"
            subtitle={error}
            tone="danger"
            icon="alert"
          />
        ) : null}
        {children}
      </ScrollView>
      {action}
      <BottomSheet open={menu} onClose={() => setMenu(false)} title={`${title} 정보`}>
        <CompletionInfo session={session} />
        {menuChildren}
        <Button
          label="상태 다시 불러오기"
          variant="secondary"
          onPress={() => {
            setMenu(false);
            refresh();
          }}
        />
      </BottomSheet>
    </SafeAreaView>
  );
}

/** 공통 TimelineItem의 부가 상태 라벨 없이 원본 S12·S15의 20px 아이콘과 문구를 조합한다. */
export function CompletionTimeline({
  title,
  subtitle,
  state,
}: {
  title: string;
  subtitle: string;
  state: TimelineState;
}) {
  const foreground =
    state === 'valid'
      ? colors.text.action
      : state === 'invalid'
        ? colors.status.danger
        : colors.status.info;
  const background =
    state === 'valid'
      ? colors.status.successBg
      : state === 'invalid'
        ? colors.status.dangerBg
        : colors.status.infoBg;
  return (
    <View style={completionStyles.timeline} accessible accessibilityLabel={`${title}, ${subtitle}`}>
      <View style={[completionStyles.timelineIcon, { backgroundColor: background }]}>
        <Icon
          name={state === 'invalid' ? 'alert' : state === 'recovery' ? 'retry' : 'check'}
          color={foreground}
          size={20}
        />
      </View>
      <View style={completionStyles.flex}>
        <AppText variant="label">{title}</AppText>
        <AppText variant="caption" color={colors.text.secondary}>
          {subtitle}
        </AppText>
      </View>
    </View>
  );
}

/** 표시 컴포넌트는 유지하고 조건별 상세 진입을 투명한 터치 영역으로 연결한다. */
export function CompletionConditions({
  onSelect,
  ...props
}: ConditionProgressProps & { onSelect?: (index: number) => void }) {
  return (
    <View>
      <ConditionProgress {...props} />
      {onSelect ? (
        <View style={completionStyles.conditionTargets}>
          {props.items.map((item, index) => (
            <Pressable
              key={item.label}
              style={completionStyles.flex}
              accessibilityRole="button"
              accessibilityLabel={`${item.label} 조건 상세 보기`}
              onPress={() => onSelect(index)}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

export function UnavailableCompletion() {
  return (
    <FeedbackPanel
      title="현재 단계에서 진행할 수 없습니다"
      subtitle="실행 중인 세션과 필수 측정·정리 기록을 먼저 확인해 주세요."
      tone="warning"
      icon="alert"
    />
  );
}

export const completionStyles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface.canvas },
  content: { padding: spacing[24], gap: spacing[12] },
  flex: { flex: 1, minWidth: 0, gap: 3 },
  row: { flexDirection: 'row', gap: spacing[10] },
  metric: { minHeight: 114 },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[8],
  },
  timeline: {
    flexDirection: 'row',
    minHeight: 68,
    alignItems: 'center',
    padding: spacing[10],
    gap: spacing[10],
  },
  timelineIcon: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii[12],
  },
  note: {
    padding: spacing[10],
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[8],
    borderRadius: radii[12],
  },
  conditionTargets: {
    position: 'absolute',
    top: 34,
    left: 12,
    right: 12,
    bottom: 12,
    flexDirection: 'row',
    gap: spacing[6],
  },
});

export { ActionShelf };
