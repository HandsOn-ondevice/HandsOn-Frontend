import { StyleSheet, View } from 'react-native';
import {
  ActionShelf,
  AppText,
  BrandLogo,
  EvidenceRow,
  Icon,
  SectionHeader,
  StatusBadge,
  SurfaceCard,
  colors,
  spacing,
} from '@/design-system';
import type { ProcedureDraft } from '@/features/procedure-draft/procedureDraftRepository';
import { ProcedureFrame } from '@/features/procedures/ProcedureFrame';
import { describeStepCriteria } from './procedureReleaseRules';

interface ProcedureReleasePreviewProps {
  draft: ProcedureDraft;
  proposedVersion: string | null;
  onBack: () => void;
}

const help = {
  title: '절차 미리보기 안내',
  subtitle: '저장된 초안의 준비물, 기준과 단계입니다. 승인 검토로 돌아가 편집할 수 있어요.',
};

export function ProcedureReleasePreview({
  draft,
  proposedVersion,
  onBack,
}: ProcedureReleasePreviewProps) {
  const criteria = draft.steps.flatMap((step) => {
    const item = describeStepCriteria(step);
    return item ? [{ ...item, stepId: step.id }] : [];
  });

  return (
    <ProcedureFrame
      headerTitle="절차 미리보기"
      title={draft.title}
      subtitle={
        proposedVersion ? `배포 예정 버전 ${proposedVersion}` : `승인 전 초안 ${draft.version}`
      }
      heroAccessory={<BrandLogo width={88} />}
      onBack={onBack}
      help={help}
      footer={
        <>
          <View style={styles.versionNote}>
            <Icon name="lock" size={16} color={colors.text.secondary} />
            <AppText variant="caption" color={colors.text.secondary} style={styles.flexText}>
              새 세션은 시작할 때 선택한 승인 버전을 완료까지 유지합니다.
            </AppText>
          </View>
          <ActionShelf primary="승인 검토로 돌아가기" onPrimary={onBack} safeArea />
        </>
      }
    >
      <AppText color={colors.text.secondary}>{draft.description}</AppText>

      <SectionHeader title="필요 장비" />
      {draft.materials.length > 0 ? (
        <View style={styles.badges}>
          {draft.materials.map((item, index) => (
            <StatusBadge
              key={`${item}-${index}`}
              label={item}
              tone="neutral"
              style={styles.badge}
            />
          ))}
        </View>
      ) : (
        <AppText color={colors.text.secondary}>등록된 준비물이 없어요.</AppText>
      )}

      <SectionHeader title="핵심 기준" />
      {criteria.length > 0 ? (
        criteria.map(({ title, description, stepId }) => (
          <EvidenceRow
            key={stepId}
            title={title}
            subtitle={description}
            kind="sensor"
            state="confirmed"
            meta="기록됨"
          />
        ))
      ) : (
        <AppText color={colors.text.secondary}>저장된 단계별 기준이 없어요.</AppText>
      )}

      <SectionHeader title={`단계 요약 · 총 ${draft.steps.length}단계`} />
      <SurfaceCard style={styles.list}>
        {draft.steps.map((step, index) => (
          <View key={step.id} style={styles.row}>
            <AppText variant="caption" color={colors.text.action}>
              {index + 1}
            </AppText>
            <View style={styles.flexText}>
              <AppText variant="label">{step.title}</AppText>
              <AppText variant="caption" color={colors.text.secondary}>
                {step.description}
              </AppText>
            </View>
          </View>
        ))}
      </SurfaceCard>

      {draft.precautions.length > 0 ? (
        <>
          <SectionHeader title="주의사항" />
          <SurfaceCard tone="subtle" style={styles.list}>
            {draft.precautions.map((item, index) => (
              <View key={`${item}-${index}`} style={styles.row}>
                <Icon name="alert" size={16} color={colors.status.warning} />
                <AppText style={styles.flexText}>{item}</AppText>
              </View>
            ))}
          </SurfaceCard>
        </>
      ) : null}
    </ProcedureFrame>
  );
}

const styles = StyleSheet.create({
  flexText: { flex: 1 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[6] },
  badge: { backgroundColor: colors.surface.card },
  list: { gap: spacing[12] },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[10] },
  versionNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[8],
    paddingHorizontal: spacing[24],
    paddingTop: spacing[12],
  },
});
