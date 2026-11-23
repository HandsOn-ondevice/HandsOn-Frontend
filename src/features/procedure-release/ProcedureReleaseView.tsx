import { ScrollView, StyleSheet, View } from 'react-native';
import {
  ActionShelf,
  AppBar,
  AppText,
  Button,
  CheckboxRow,
  EvidenceRow,
  FeedbackPanel,
  Icon,
  MetricTile,
  Screen,
  StatusBar,
  SurfaceCard,
  colors,
  spacing,
} from '@/design-system';
import type {
  ProcedureDraft,
  ProcedureDraftStep,
} from '@/features/procedure-draft/procedureDraftRepository';
import { ProcedureFrame } from '@/features/procedures/ProcedureFrame';
import type { ProcedureDetail } from '@/features/procedures/procedureModels';

interface ProcedureReleaseViewProps {
  draft: ProcedureDraft;
  reviewedStep?: ProcedureDraftStep;
  blockers: readonly string[];
  proposedVersion: string | null;
  approverName: string;
  reviewConfirmed: boolean;
  equipmentConfirmed: boolean;
  submitting: boolean;
  error: string | null;
  onEquipmentChange: (confirmed: boolean) => void;
  onReviewChange: (confirmed: boolean) => void;
  onApprove: () => void;
  onBack: () => void;
  onEdit: () => void;
  onPreview: () => void;
}

const help = {
  title: '최종 승인 안내',
  subtitle:
    '미리보기에서 준비물과 단계별 기준을 확인해 주세요. 모의 배포 결과는 현재 앱의 승인 절차에 반영됩니다.',
};

function summarizeCriteria(steps: ProcedureDraft['steps']) {
  let numerical = 0;
  let manual = 0;
  let recovery = 0;

  for (const { criteria } of steps) {
    if (!criteria) continue;
    numerical += [
      criteria.voltageMin,
      criteria.voltageMax,
      criteria.overcurrentLimit,
      criteria.freshnessLimit,
      criteria.stabilizationWait,
      criteria.repetitions,
      criteria.tolerancePercent,
    ].filter((value) => value !== null).length;
    manual += Number(Boolean(criteria.manualCheck.trim()));
    recovery += [criteria.holdRule, criteria.recoveryRule].filter((rule) => rule.trim()).length;
  }

  return { numerical, manual, recovery };
}

export function ProcedureReleaseView({
  draft,
  reviewedStep,
  blockers,
  proposedVersion,
  approverName,
  reviewConfirmed,
  equipmentConfirmed,
  submitting,
  error,
  onEquipmentChange,
  onReviewChange,
  onApprove,
  onBack,
  onEdit,
  onPreview,
}: ProcedureReleaseViewProps) {
  const blocked = blockers.length > 0;
  const canApprove = !blocked && reviewConfirmed && equipmentConfirmed;
  const criteria = summarizeCriteria(draft.steps);
  const approveLabel = proposedVersion ? `${proposedVersion} 승인·배포` : '승인·배포';
  const primaryLabel = submitting ? '승인·배포 중' : error ? '다시 시도' : approveLabel;

  return (
    <ProcedureFrame
      headerTitle="최종 승인과 버전 배포"
      title={blocked ? '승인 전 확인이\n필요합니다' : '승인 준비가\n완료되었습니다'}
      subtitle={blocked ? '미확정 항목을 검토해 주세요.' : '절차와 장비를 확인한 뒤 승인해 주세요.'}
      onBack={onBack}
      navigationDisabled={submitting}
      help={help}
      footer={
        <>
          {error ? (
            <View style={styles.submitError}>
              <AppText accessibilityRole="alert" color={colors.status.danger}>
                {error}
              </AppText>
            </View>
          ) : null}
          <ActionShelf
            primary={primaryLabel}
            primaryTestID="release-approve"
            secondary="미리보기"
            disabled={!canApprove}
            loading={submitting}
            secondaryDisabled={submitting}
            onPrimary={onApprove}
            onSecondary={onPreview}
            safeArea
          />
        </>
      }
    >
      <AppText variant="title" accessibilityRole="header">
        {draft.title}
      </AppText>
      {reviewedStep?.criteria ? (
        <SurfaceCard
          title="기준을 저장했습니다"
          subtitle={
            reviewedStep.criteria.equipmentVerified ? '실장비 확인 기록됨' : '실장비 확인 필요'
          }
        />
      ) : null}
      <View style={styles.metrics}>
        <MetricTile title="단계" value={String(draft.steps.length)} meta="개" style={styles.tile} />
        <MetricTile
          title="승인 기준"
          value={String(criteria.numerical)}
          meta="개"
          style={styles.tile}
        />
        <MetricTile
          title="미확정"
          value={String(blockers.length)}
          meta="개"
          tone={blocked ? 'warning' : 'success'}
          style={styles.tile}
        />
      </View>
      {blocked ? (
        <>
          <FeedbackPanel
            title="승인 전에 확인해 주세요"
            subtitle={blockers.join('\n')}
            tone="warning"
            icon="alert"
          />
          <Button
            label="편집으로 돌아가기"
            variant="secondary"
            onPress={onEdit}
            disabled={submitting}
          />
        </>
      ) : null}
      <EvidenceRow
        title="작업자 확인 항목"
        subtitle="단계별 작업자 확인 지시"
        kind="human"
        state={criteria.manual ? 'confirmed' : 'pending'}
        meta={`${criteria.manual}개`}
      />
      <EvidenceRow
        title="센서 완료 기준"
        subtitle="저장된 수치와 반복 기준"
        kind="sensor"
        state={criteria.numerical ? 'confirmed' : 'pending'}
        meta={`${criteria.numerical}개`}
      />
      <EvidenceRow
        title="오류 복구 규칙"
        subtitle="보류 조건과 복구 안내"
        kind="program"
        state={criteria.recovery ? 'confirmed' : 'pending'}
        meta={`${criteria.recovery}개`}
      />
      <SurfaceCard
        title={`준비물 · ${draft.materials.length}개`}
        subtitle={draft.materials.join(' · ') || '등록된 준비물이 없어요.'}
      />
      <SurfaceCard
        title={proposedVersion ? `새 버전 · ${proposedVersion}` : '새 버전 · 배포 응답에서 확인'}
        subtitle={`모의 배포 · 승인자 ${approverName} · 초안 ${draft.version}`}
      />
      <View style={styles.versionNote}>
        <Icon name="lock" size={16} color={colors.text.secondary} />
        <AppText variant="caption" color={colors.text.secondary} style={styles.noteText}>
          이미 시작한 세션은 기존 버전을 유지합니다.
        </AppText>
      </View>
      <CheckboxRow
        title="준비물과 장비를 확인했습니다."
        subtitle="모의 배포에 필요한 검토 사실을 기록합니다."
        checked={equipmentConfirmed}
        onChange={onEquipmentChange}
        disabled={submitting}
        testID="release-equipment-confirmed"
      />
      <CheckboxRow
        title="모든 수치와 오류 규칙을 검토했습니다."
        subtitle={
          reviewConfirmed
            ? '승인에 필요한 검토 사실을 확인했습니다.'
            : '승인 전에 검토 사실을 확인해 주세요.'
        }
        checked={reviewConfirmed}
        onChange={onReviewChange}
        disabled={submitting}
        testID="release-review-confirmed"
      />
      {blocked ? null : (
        <Button
          label="편집으로 돌아가기"
          variant="tertiary"
          onPress={onEdit}
          disabled={submitting}
        />
      )}
    </ProcedureFrame>
  );
}

interface ProcedureReleaseResultProps {
  procedure: ProcedureDetail;
  onHome: () => void;
}

export function ProcedureReleaseResult({ procedure, onHome }: ProcedureReleaseResultProps) {
  return (
    <Screen>
      <StatusBar />
      <AppBar title="처리 결과" mode="back" onBack={onHome} />
      <ScrollView style={styles.resultScroll} contentContainerStyle={styles.resultContent}>
        <FeedbackPanel
          tone="success"
          icon="check"
          title={`${procedure.approvedVersion} 승인·배포 완료`}
          subtitle={`모의 배포 · ${procedure.code} · ${procedure.title}\n${procedure.approvedBy}님의 검토와 승인 사실을 기록했습니다.\n승인 절차 목록에 반영했습니다. 진행 중인 세션은 기존 버전을 유지합니다.`}
        />
      </ScrollView>
      <ActionShelf primary="숙련자 홈으로" onPrimary={onHome} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  metrics: { flexDirection: 'row', gap: spacing[10] },
  tile: { flex: 1, minHeight: 116 },
  versionNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[8],
    paddingHorizontal: spacing[8],
    paddingVertical: spacing[8],
  },
  noteText: { flex: 1 },
  submitError: { paddingHorizontal: spacing[24], paddingTop: spacing[12] },
  resultScroll: { flex: 1 },
  resultContent: { padding: spacing[24] },
});
