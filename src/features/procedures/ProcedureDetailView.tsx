import { StyleSheet, View } from 'react-native';

import {
  ActionShelf,
  AppText,
  Button,
  FeedbackPanel,
  Icon,
  SectionHeader,
  SurfaceCard,
  colors,
  radii,
  spacing,
} from '@/design-system';
import { ProcedureFrame } from './ProcedureFrame';
import type { ProcedureDetail, ProcedureLookup } from './procedureModels';

export interface ProcedureDetailViewProps {
  lookup: ProcedureLookup<ProcedureDetail | null>;
  onBack: () => void;
  onRetry: () => void;
  onStart: () => void;
  starting?: boolean;
  startError?: string;
  blockedReason?: string;
}

export function ProcedureDetailView({
  lookup,
  onBack,
  onRetry,
  onStart,
  starting = false,
  startError,
  blockedReason,
}: ProcedureDetailViewProps) {
  const procedure = lookup.status === 'ready' ? lookup.data : null;
  const canStart = Boolean(procedure) && !blockedReason;

  return (
    <ProcedureFrame
      headerTitle="절차 상세와 버전 고정"
      title={procedure?.title ?? '승인 절차 상세'}
      subtitle={
        procedure ? `${procedure.code} · 승인 버전 ${procedure.approvedVersion}` : undefined
      }
      onBack={onBack}
      footer={
        <View style={styles.footer}>
          {blockedReason || startError ? (
            <View accessibilityLiveRegion="polite" style={styles.startNotice}>
              <Icon name="alert" size={15} color={colors.status.warning} />
              <AppText color={colors.status.warning} style={styles.flexText}>
                {blockedReason ?? startError}
              </AppText>
            </View>
          ) : null}
          {procedure ? (
            <View style={styles.versionNote}>
              <Icon name="lock" size={15} color={colors.text.secondary} />
              <AppText variant="caption" color={colors.text.secondary} style={styles.flexText}>
                {`세션을 시작하면 완료할 때까지 절차 ${procedure.approvedVersion}를 유지합니다.`}
              </AppText>
            </View>
          ) : null}
          <ActionShelf
            primary="이 버전으로 준비 시작"
            disabled={!canStart}
            loading={starting}
            onPrimary={() => {
              if (canStart && !starting) onStart();
            }}
            safeArea
          />
        </View>
      }
    >
      {lookup.status === 'loading' ? (
        <FeedbackPanel title="절차를 불러오는 중" subtitle="승인된 버전을 확인하고 있어요." />
      ) : lookup.status === 'error' ? (
        <View style={styles.stack}>
          <FeedbackPanel title="절차를 불러오지 못했어요." tone="warning" icon="alert" />
          <Button label="다시 시도" variant="secondary" icon="retry" onPress={onRetry} />
        </View>
      ) : !procedure ? (
        <FeedbackPanel
          title="실행할 수 있는 승인 절차가 없어요."
          subtitle="목록으로 돌아가 다른 절차를 선택해 주세요."
          tone="warning"
          icon="alert"
        />
      ) : (
        <>
          <View style={styles.stats}>
            <SurfaceCard style={styles.stat}>
              <AppText variant="caption" color={colors.text.secondary}>
                승인자
              </AppText>
              <AppText variant="title" color={colors.text.secondary}>
                {procedure.approvedBy}
              </AppText>
            </SurfaceCard>
            <SurfaceCard style={styles.stat}>
              <AppText variant="caption" color={colors.text.secondary}>
                예상 소요
              </AppText>
              <AppText variant="title" color={colors.text.secondary}>
                {procedure.estimatedMinutes}
              </AppText>
              <AppText variant="caption" color={colors.text.secondary}>
                {`분 · 약 ${procedure.estimatedMinutes}분`}
              </AppText>
            </SurfaceCard>
          </View>

          <AppText color={colors.text.secondary}>{procedure.description}</AppText>

          {procedure.conditions.length > 0 ? (
            <SurfaceCard style={styles.conditionsCard}>
              <AppText variant="caption" color={colors.text.secondary} style={styles.centered}>
                출력 조건 · 회차
              </AppText>
              <View style={styles.conditions}>
                {procedure.conditions.map((condition, index) => (
                  <View key={`${condition.label}-${index}`} style={styles.condition}>
                    <AppText>{condition.label}</AppText>
                    <AppText variant="caption">{`${condition.repetitions}회`}</AppText>
                  </View>
                ))}
              </View>
            </SurfaceCard>
          ) : null}

          <SectionHeader title="필요 장비" />
          <View style={styles.equipment}>
            {procedure.equipment.map((item, index) => (
              <AppText
                key={`${item}-${index}`}
                variant="caption"
                color={colors.text.secondary}
                style={styles.equipmentItem}
              >
                {item}
              </AppText>
            ))}
          </View>

          <SectionHeader title="핵심 기준" />
          <View style={styles.stack}>
            {procedure.criteria.map((criterion, index) => (
              <View key={`${criterion.title}-${index}`} style={styles.criterion}>
                <View style={styles.criterionIcon}>
                  <Icon
                    name={index === 0 ? 'device' : 'check'}
                    color={colors.status.success}
                    size={18}
                  />
                </View>
                <View style={styles.criterionCopy}>
                  <AppText variant="label">{criterion.title}</AppText>
                  <AppText variant="caption" color={colors.text.secondary}>
                    {criterion.description}
                  </AppText>
                </View>
              </View>
            ))}
          </View>

          <SectionHeader title={`단계 요약 · 총 ${procedure.stepCount}단계`} />
          <SurfaceCard style={styles.stack}>
            {procedure.steps.map((step, index) => (
              <View key={`${step}-${index}`} style={styles.step}>
                <AppText variant="caption" color={colors.text.action}>
                  {index + 1}
                </AppText>
                <AppText style={styles.flexText}>{step}</AppText>
              </View>
            ))}
          </SurfaceCard>

          <SectionHeader title="주의사항" />
          <SurfaceCard tone="subtle" style={styles.stack}>
            {procedure.precautions.map((precaution, index) => (
              <View key={`${precaution}-${index}`} style={styles.step}>
                <Icon name="alert" size={15} color={colors.status.warning} />
                <AppText style={styles.flexText}>{precaution}</AppText>
              </View>
            ))}
          </SurfaceCard>
        </>
      )}
    </ProcedureFrame>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', gap: spacing[20], flexWrap: 'wrap' },
  stat: { flex: 1, minWidth: 130, justifyContent: 'center', gap: spacing[4] },
  flexText: { flex: 1 },
  centered: { textAlign: 'center' },
  stack: { gap: spacing[8] },
  conditionsCard: { padding: spacing[12], gap: spacing[8] },
  conditions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[6] },
  condition: {
    flexGrow: 1,
    minWidth: spacing[48],
    alignItems: 'center',
    paddingHorizontal: spacing[8],
    paddingVertical: spacing[8],
    gap: spacing[2],
    borderRadius: radii[12],
    backgroundColor: colors.surface.canvas,
  },
  equipment: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[8] },
  equipmentItem: { paddingHorizontal: spacing[10], paddingVertical: spacing[8] },
  criterion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[10],
    padding: spacing[12],
    backgroundColor: colors.surface.card,
    borderRadius: radii[18],
  },
  criterionIcon: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.status.successBg,
    borderRadius: radii[12],
  },
  criterionCopy: { flex: 1, gap: spacing[2] },
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[10] },
  footer: { backgroundColor: colors.surface.card },
  startNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[8],
    paddingHorizontal: spacing[24],
    paddingTop: spacing[12],
  },
  versionNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[8],
    paddingHorizontal: spacing[36],
    paddingTop: spacing[16],
  },
});
