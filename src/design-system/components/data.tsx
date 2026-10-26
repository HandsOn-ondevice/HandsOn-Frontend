import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { AppText, Icon, type IconName, type Tone } from '../primitives';
import { borders, colors, radii, shadows, spacing } from '../tokens';

type CardProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  accessibilityLabel?: string;
  selected?: boolean;
};

function Card({ children, style, onPress, accessibilityLabel, selected }: CardProps) {
  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={selected === undefined ? undefined : { selected }}
        onPress={onPress}
        style={({ pressed }) => [style, pressed && styles.pressed]}
      >
        {children}
      </Pressable>
    );
  }
  return (
    <View
      accessible={Boolean(accessibilityLabel)}
      accessibilityLabel={accessibilityLabel}
      style={style}
    >
      {children}
    </View>
  );
}

function toneColors(tone: Tone) {
  const tones = {
    info: { foreground: colors.status.info, background: colors.status.infoBg },
    success: { foreground: colors.status.success, background: colors.status.successBg },
    warning: { foreground: colors.status.warning, background: colors.status.warningBg },
    danger: { foreground: colors.status.danger, background: colors.status.dangerBg },
    neutral: { foreground: colors.text.secondary, background: colors.surface.canvas },
  };
  return tones[tone];
}

export interface StatusBadgeProps {
  label: string;
  tone?: Tone;
  style?: StyleProp<ViewStyle>;
}

export function StatusBadge({ label, tone = 'info', style }: StatusBadgeProps) {
  const palette = toneColors(tone);
  return (
    <View style={[styles.badge, { backgroundColor: palette.background }, style]}>
      <AppText variant="caption" color={palette.foreground}>
        {label}
      </AppText>
    </View>
  );
}

export interface FeedbackPanelProps {
  title: string;
  subtitle?: string;
  tone?: Exclude<Tone, 'neutral'>;
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
}

export function FeedbackPanel({
  title,
  subtitle,
  tone = 'info',
  icon = 'guidance',
  style,
}: FeedbackPanelProps) {
  const palette = toneColors(tone);
  return (
    <View
      accessibilityLiveRegion="polite"
      style={[styles.feedback, { backgroundColor: palette.background }, style]}
    >
      <View style={styles.feedbackHeading}>
        <Icon name={icon} color={palette.foreground} />
        <AppText variant="title" color={palette.foreground} style={styles.flexText}>
          {title}
        </AppText>
      </View>
      {subtitle ? <AppText>{subtitle}</AppText> : null}
    </View>
  );
}

export type ProcedureState = 'approved' | 'selected' | 'draft' | 'unresolved';

export interface ProcedureCardProps {
  title: string;
  subtitle?: string;
  meta?: string;
  detail?: string;
  state?: ProcedureState;
  icon?: IconName;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

export function ProcedureCard({
  title,
  subtitle,
  meta,
  detail,
  state = 'approved',
  icon = 'flask',
  onPress,
  style,
}: ProcedureCardProps) {
  const selected = state === 'selected';
  const approved = state === 'approved' || selected;
  const stateLabel = approved ? '승인' : state === 'draft' ? '작성 중' : '확인 필요';
  return (
    <Card
      onPress={onPress}
      selected={selected}
      accessibilityLabel={[title, stateLabel, subtitle, meta, detail].filter(Boolean).join(', ')}
      style={[styles.procedure, selected && styles.selectedCard, style]}
    >
      <View style={styles.rowBetween}>
        <View style={styles.iconWell}>
          <Icon name={icon} />
        </View>
        <StatusBadge label={stateLabel} tone={approved ? 'success' : 'warning'} />
      </View>
      <AppText variant="title">{title}</AppText>
      {subtitle ? (
        <AppText variant="caption" color={colors.text.secondary}>
          {subtitle}
        </AppText>
      ) : null}
      {meta ? (
        <AppText variant="caption" color={colors.text.action}>
          {meta}
        </AppText>
      ) : null}
      {detail ? (
        <AppText variant="caption" color={colors.text.secondary}>
          {detail}
        </AppText>
      ) : null}
    </Card>
  );
}

export type SensorState = 'normal' | 'stale' | 'disconnected' | 'outOfRange';

export interface SensorCardProps {
  title: string;
  subtitle?: string;
  value?: string;
  meta?: string;
  detail?: string;
  state?: SensorState;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
}

const sensorStateLabels: Record<SensorState, string> = {
  normal: '정상',
  stale: '오래된 값',
  disconnected: '연결 끊김',
  outOfRange: '범위 초과',
};

export function SensorCard({
  title,
  subtitle,
  value,
  meta,
  detail,
  state = 'normal',
  style,
  onPress,
}: SensorCardProps) {
  const tone: Tone = state === 'normal' ? 'success' : state === 'stale' ? 'warning' : 'danger';
  const palette = toneColors(tone);
  const reading = state === 'disconnected' ? '연결 확인 불가' : (value ?? '측정값 없음');
  return (
    <Card
      onPress={onPress}
      accessibilityLabel={[title, sensorStateLabels[state], subtitle, reading, meta, detail]
        .filter(Boolean)
        .join(', ')}
      style={[styles.sensor, style]}
    >
      <View style={[styles.rowBetween, styles.sensorHeading]}>
        <AppText variant="label" style={styles.flexText}>
          {title}
        </AppText>
        <AppText variant="caption" color={palette.foreground}>
          {`${sensorStateLabels[state]}${meta ? ` · ${meta}` : ''}`}
        </AppText>
      </View>
      {subtitle ? (
        <AppText variant="caption" color={colors.text.secondary}>
          {subtitle}
        </AppText>
      ) : null}
      <View style={[styles.sensorReading, { backgroundColor: palette.background }]}>
        <AppText variant="title" color={palette.foreground}>
          {reading}
        </AppText>
      </View>
      <AppText variant="caption" color={palette.foreground}>
        {detail ?? sensorStateLabels[state]}
      </AppText>
    </Card>
  );
}

export interface MetricTileProps {
  title: string;
  value: string;
  meta?: string;
  detail?: string;
  tone?: Tone;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
}

export function MetricTile({
  title,
  value,
  meta,
  detail,
  tone = 'info',
  style,
  onPress,
}: MetricTileProps) {
  const palette = toneColors(tone);
  return (
    <Card
      onPress={onPress}
      accessibilityLabel={[title, value, meta, detail].filter(Boolean).join(', ')}
      style={[styles.metric, style]}
    >
      <AppText variant="caption" color={colors.text.secondary}>
        {title}
      </AppText>
      <AppText variant="measurement" color={palette.foreground}>
        {value}
      </AppText>
      {meta ? (
        <AppText variant="caption" color={colors.text.secondary}>
          {meta}
        </AppText>
      ) : null}
      {detail ? (
        <AppText variant="caption" color={palette.foreground}>
          {detail}
        </AppText>
      ) : null}
    </Card>
  );
}

export type ConditionState = 'planned' | 'running' | 'issue' | 'complete';
export interface ConditionItem {
  label: string;
  value: string;
}
export interface ConditionProgressProps {
  items: readonly ConditionItem[];
  state?: ConditionState;
  currentIndex?: number;
  title?: string;
  style?: StyleProp<ViewStyle>;
}

export function ConditionProgress({
  items,
  state = 'planned',
  currentIndex,
  title = '출력 조건 · 회차',
  style,
}: ConditionProgressProps) {
  return (
    <View style={[styles.condition, style]}>
      <AppText variant="caption" color={colors.text.secondary} style={styles.centerText}>
        {title}
      </AppText>
      <View style={styles.conditionRow}>
        {items.map((item, index) => {
          const tone: Tone =
            state === 'complete'
              ? 'success'
              : index === currentIndex && state === 'issue'
                ? 'warning'
                : index === currentIndex && state === 'running'
                  ? 'info'
                  : 'neutral';
          const palette = toneColors(tone);
          return (
            <View
              key={`${item.label}-${index}`}
              accessible
              accessibilityLabel={`${item.label}, ${item.value}${index === currentIndex ? ', 현재 조건' : ''}`}
              style={[styles.conditionCell, { backgroundColor: palette.background }]}
            >
              <AppText
                variant="label"
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.85}
                color={tone === 'neutral' ? colors.text.primary : palette.foreground}
                style={styles.centerText}
              >
                {item.label}
              </AppText>
              <AppText
                variant="caption"
                color={tone === 'neutral' ? colors.text.primary : palette.foreground}
                style={styles.centerText}
              >
                {item.value}
              </AppText>
            </View>
          );
        })}
      </View>
    </View>
  );
}

export type StepState = 'running' | 'paused' | 'complete';
export interface StepProgressProps {
  title: string;
  value: number;
  state?: StepState;
  style?: StyleProp<ViewStyle>;
}

export function StepProgress({ title, value, state = 'running', style }: StepProgressProps) {
  const percentage = Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
  const label = state === 'paused' ? '일시정지' : state === 'complete' ? '완료' : '진행 중';
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`${title}, ${label}`}
      accessibilityValue={{ min: 0, max: 100, now: percentage }}
      style={[styles.progress, style]}
    >
      <View style={[styles.rowBetween, styles.progressHeading]}>
        <AppText variant="caption" style={styles.flexText}>
          {title}
        </AppText>
        <AppText variant="caption" color={colors.text.action}>
          {percentage}%
        </AppText>
      </View>
      <View style={styles.progressTrack}>
        <View
          style={[
            styles.progressFill,
            {
              width: `${percentage}%`,
              backgroundColor: state === 'paused' ? colors.text.secondary : colors.action.primary,
            },
          ]}
        />
      </View>
    </View>
  );
}

export type EvidenceKind = 'human' | 'sensor' | 'program';
export type EvidenceState = 'pending' | 'confirmed' | 'issue';
export interface EvidenceRowProps {
  title: string;
  subtitle?: string;
  meta?: string;
  kind?: EvidenceKind;
  state?: EvidenceState;
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
}

const evidenceIcons: Record<EvidenceKind, IconName> = {
  human: 'person',
  sensor: 'device',
  program: 'check',
};
const evidenceLabels: Record<EvidenceKind, string> = {
  human: '작업자 확인',
  sensor: '센서 근거',
  program: '프로그램 계산',
};

export function EvidenceRow({
  title,
  subtitle,
  meta,
  kind = 'human',
  state = 'pending',
  icon,
  style,
  onPress,
}: EvidenceRowProps) {
  const tone: Tone = state === 'confirmed' ? 'success' : state === 'issue' ? 'warning' : 'neutral';
  const palette = toneColors(tone);
  const status = meta ?? (state === 'confirmed' ? '확인' : state === 'issue' ? '필수' : '대기');
  return (
    <Card
      onPress={onPress}
      accessibilityLabel={[evidenceLabels[kind], title, subtitle, status]
        .filter(Boolean)
        .join(', ')}
      style={[styles.evidence, state === 'issue' && { backgroundColor: palette.background }, style]}
    >
      <View style={[styles.iconWell, { backgroundColor: palette.background }]}>
        <Icon
          name={icon ?? evidenceIcons[kind]}
          color={state === 'pending' ? colors.text.action : palette.foreground}
        />
      </View>
      <View style={styles.evidenceText}>
        <AppText variant="label">{title}</AppText>
        <AppText variant="caption" color={colors.text.secondary}>
          {subtitle ?? evidenceLabels[kind]}
        </AppText>
      </View>
      <AppText variant="caption" color={palette.foreground}>
        {status}
      </AppText>
    </Card>
  );
}

export type VoiceState = 'idle' | 'listening' | 'processing' | 'confirmed' | 'clarify' | 'error';
export interface VoicePanelProps {
  title?: string;
  subtitle?: string;
  state?: VoiceState;
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
}

const voiceTitles: Record<VoiceState, string> = {
  idle: '음성 대기',
  listening: '말씀하세요',
  processing: '명령을 확인하고 있어요',
  confirmed: '명령을 확인했어요',
  clarify: '뜻을 확인해 주세요',
  error: '음성을 확인하지 못했어요',
};
const voiceSubtitles: Record<VoiceState, string> = {
  idle: '마이크를 눌러 안내를 시작하세요.',
  listening: '음성을 듣고 있어요.',
  processing: '완료 조건을 검사합니다.',
  confirmed: '현재 센서값과 작업자 확인을 검사합니다.',
  clarify: '대상을 다시 확인해 주세요.',
  error: '다시 말하거나 화면의 버튼을 사용하세요.',
};

export function VoicePanel({
  title,
  subtitle,
  state = 'idle',
  icon,
  style,
  onPress,
}: VoicePanelProps) {
  const tone: Tone =
    state === 'confirmed'
      ? 'success'
      : state === 'clarify'
        ? 'warning'
        : state === 'error'
          ? 'danger'
          : 'info';
  const palette = toneColors(tone);
  const heading = title ?? voiceTitles[state];
  const support = subtitle ?? voiceSubtitles[state];
  return (
    <Card
      onPress={onPress}
      accessibilityLabel={`${heading}, ${support}`}
      style={[styles.voice, { backgroundColor: palette.background }, style]}
    >
      <View style={styles.voiceIcon}>
        <Icon
          name={icon ?? (state === 'clarify' ? 'alert' : state === 'processing' ? 'retry' : 'mic')}
          color={palette.foreground}
        />
      </View>
      <View style={styles.voiceText}>
        <AppText variant="label" color={palette.foreground}>
          {heading}
        </AppText>
        <AppText variant="caption" color={colors.text.secondary}>
          {support}
        </AppText>
      </View>
    </Card>
  );
}

export type TimelineState = 'valid' | 'invalid' | 'recovery' | 'pending';
export interface TimelineItemProps {
  title: string;
  subtitle?: string;
  state?: TimelineState;
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
}

const timelineLabels: Record<TimelineState, string> = {
  valid: '유효',
  invalid: '무효',
  recovery: '복구',
  pending: '대기',
};

export function TimelineItem({
  title,
  subtitle,
  state = 'pending',
  icon = 'check',
  style,
  onPress,
}: TimelineItemProps) {
  const tone: Tone =
    state === 'valid'
      ? 'success'
      : state === 'invalid'
        ? 'danger'
        : state === 'recovery'
          ? 'info'
          : 'neutral';
  const palette = toneColors(tone);
  return (
    <Card
      onPress={onPress}
      accessibilityLabel={[timelineLabels[state], title, subtitle].filter(Boolean).join(', ')}
      style={[styles.timeline, style]}
    >
      <View style={[styles.timelineIcon, { backgroundColor: palette.background }]}>
        <Icon name={icon} size={18} color={palette.foreground} />
      </View>
      <View style={styles.evidenceText}>
        <AppText variant="label">{title}</AppText>
        {subtitle ? (
          <AppText variant="caption" color={colors.text.secondary}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      <AppText variant="caption" color={palette.foreground}>
        {timelineLabels[state]}
      </AppText>
    </Card>
  );
}

export type ChartState = 'preview' | 'reviewed';
export interface ResultChartItem {
  label: string;
  value: number | null;
}
export interface ResultChartProps {
  title: string;
  meta?: string;
  state?: ChartState;
  items: readonly ResultChartItem[];
  unit?: string;
  highlightedIndex?: number;
  style?: StyleProp<ViewStyle>;
}

export function ResultChart({
  title,
  meta,
  state = 'preview',
  items,
  unit = '',
  highlightedIndex = 2,
  style,
}: ResultChartProps) {
  const validValues = items.flatMap((item) =>
    item.value !== null && Number.isFinite(item.value) && item.value >= 0 ? [item.value] : [],
  );
  const maximum = Math.max(1, ...validValues);
  return (
    <View style={[styles.chart, style]}>
      <View style={[styles.rowBetween, styles.chartHeading]}>
        <AppText variant="label" style={styles.flexText}>
          {title}
        </AppText>
        <AppText variant="caption" color={colors.text.action}>
          {meta ?? (state === 'reviewed' ? '검토 완료' : '미리보기')}
        </AppText>
      </View>
      {validValues.length === 0 ? (
        <View style={styles.chartEmpty}>
          <AppText color={colors.text.secondary}>표시할 측정값이 없습니다.</AppText>
        </View>
      ) : (
        <View style={styles.chartBars}>
          {items.map((item, index) => {
            const valid = item.value !== null && Number.isFinite(item.value) && item.value >= 0;
            const value = valid ? (item.value as number) : null;
            return (
              <View
                key={`${item.label}-${index}`}
                accessible
                accessibilityLabel={`${item.label}, ${value === null ? '측정값 없음' : `${value}${unit ? ` ${unit}` : ''}`}`}
                style={styles.chartColumn}
              >
                <View style={styles.chartPlot}>
                  {value === null ? (
                    <AppText variant="caption" color={colors.text.secondary}>
                      —
                    </AppText>
                  ) : (
                    <View
                      style={[
                        styles.chartBar,
                        {
                          height: (value / maximum) * 83,
                          backgroundColor:
                            index === highlightedIndex
                              ? colors.action.primary
                              : colors.surface.subtle,
                        },
                      ]}
                    />
                  )}
                </View>
                <AppText variant="caption" color={colors.text.secondary} style={styles.centerText}>
                  {item.label}
                </AppText>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

export type UserRole = 'student' | 'expert';
export type RoleState = 'default' | 'selected';
export interface RoleCardProps {
  role: UserRole;
  title?: string;
  subtitle?: string;
  state?: RoleState;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

export function RoleCard({
  role,
  title,
  subtitle,
  state = 'default',
  onPress,
  style,
}: RoleCardProps) {
  const selected = state === 'selected';
  const heading = title ?? (role === 'student' ? '신규 연구생' : '숙련 연구생');
  const support = subtitle ?? (role === 'student' ? '승인된 절차 실행' : '절차 생성·승인');
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled: !onPress }}
      accessibilityLabel={`${heading}, ${support}`}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [
        styles.role,
        selected && styles.selectedRole,
        pressed && styles.pressed,
        style,
      ]}
    >
      <View style={styles.roleHeading}>
        <Icon name="person" size={23} />
        {selected ? <Icon name="check" size={18} /> : null}
      </View>
      <AppText variant="label">{heading}</AppText>
      <AppText variant="caption" color={colors.text.secondary}>
        {support}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.8 },
  flexText: { flex: 1, minWidth: 0 },
  centerText: { textAlign: 'center' },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[8],
  },
  badge: {
    alignSelf: 'flex-start',
    borderRadius: radii[999],
    paddingHorizontal: spacing[8],
    paddingVertical: spacing[6],
    minHeight: 28,
    justifyContent: 'center',
  },
  feedback: { borderRadius: radii[20], padding: spacing[16], gap: spacing[8] },
  feedbackHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing[8] },
  procedure: {
    backgroundColor: colors.surface.card,
    borderRadius: radii[24],
    padding: spacing[16],
    gap: spacing[10],
    borderWidth: borders[1.5],
    borderColor: 'transparent',
    minHeight: 48,
    ...shadows.card,
  },
  selectedCard: { borderColor: colors.border.selected },
  iconWell: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii[12],
    backgroundColor: colors.surface.subtle,
  },
  sensor: {
    backgroundColor: colors.surface.card,
    borderRadius: radii[20],
    padding: spacing[14],
    gap: spacing[8],
    minHeight: 48,
    ...shadows.card,
  },
  sensorHeading: { minHeight: 28 },
  progressHeading: { minHeight: 24 },
  chartHeading: { minHeight: 26 },
  sensorReading: {
    minHeight: 48,
    padding: spacing[8],
    borderRadius: radii[12],
    justifyContent: 'center',
  },
  metric: {
    backgroundColor: colors.surface.card,
    borderRadius: radii[16],
    padding: spacing[12],
    gap: 3,
    minHeight: 48,
  },
  condition: {
    backgroundColor: colors.surface.card,
    borderRadius: radii[20],
    padding: spacing[12],
    gap: spacing[6],
  },
  conditionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[6] },
  conditionCell: {
    flex: 1,
    minWidth: 48,
    minHeight: 54,
    borderRadius: radii[12],
    padding: 5,
    justifyContent: 'center',
    gap: spacing[2],
  },
  progress: { gap: spacing[8] },
  progressTrack: {
    height: 5,
    backgroundColor: colors.border.default,
    borderRadius: radii[8],
    overflow: 'hidden',
  },
  progressFill: { height: 5, borderRadius: radii[8] },
  evidence: {
    backgroundColor: colors.surface.card,
    borderRadius: radii[16],
    padding: spacing[12],
    gap: spacing[10],
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 66,
  },
  evidenceText: { flex: 1, minWidth: 0, gap: 3 },
  voice: {
    borderRadius: radii[20],
    padding: spacing[14],
    gap: spacing[12],
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 92,
  },
  voiceIcon: {
    width: 44,
    height: 44,
    borderRadius: radii[12],
    backgroundColor: colors.surface.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  voiceText: { flex: 1, minWidth: 0, gap: spacing[4] },
  timeline: {
    padding: spacing[10],
    gap: spacing[10],
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
  },
  timelineIcon: {
    width: 28,
    height: 28,
    borderRadius: radii[12],
    alignItems: 'center',
    justifyContent: 'center',
  },
  chart: {
    backgroundColor: colors.surface.card,
    borderRadius: radii[24],
    padding: spacing[16],
    gap: spacing[12],
  },
  chartBars: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing[18], minHeight: 108 },
  chartColumn: { flex: 1, minWidth: 0, gap: 5 },
  chartPlot: { height: 83, justifyContent: 'flex-end', alignItems: 'center' },
  chartBar: { width: '100%', borderRadius: radii[8] },
  chartEmpty: { minHeight: 108, alignItems: 'center', justifyContent: 'center' },
  role: {
    minWidth: 0,
    minHeight: 100,
    borderRadius: radii[20],
    padding: 13,
    gap: 5,
    backgroundColor: colors.surface.canvas,
    borderWidth: borders[1.5],
    borderColor: 'transparent',
  },
  selectedRole: { backgroundColor: colors.surface.subtle, borderColor: colors.border.selected },
  roleHeading: {
    minHeight: 25,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
