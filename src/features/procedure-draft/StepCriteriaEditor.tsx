import { useRef, useState } from 'react';
import { usePreventRemove } from 'expo-router';
import { Keyboard, ScrollView, StyleSheet, View } from 'react-native';
import {
  ActionShelf,
  AppBar,
  AppText,
  BottomSheet,
  Button,
  CheckboxRow,
  Icon,
  Screen,
  SectionHeader,
  StatusBadge,
  StatusBar,
  SurfaceCard,
  TextField,
  colors,
  radii,
  spacing,
} from '@/design-system';
import {
  procedureDraftRepository,
  type ProcedureDraft,
  type ProcedureDraftStep,
} from './procedureDraftRepository';
import { emptyProcedureDraftStepCriteria, type ProcedureDraftStepCriteria } from './stepCriteria';

export const stepCriteriaTitle = '기준값과 오류 규칙 편집';

const numericFields = {
  voltageMin: { label: '최솟값 (V)', id: 'voltage-min' },
  voltageMax: { label: '최댓값 (V)', id: 'voltage-max' },
  overcurrentLimit: { label: '전류가 다음 값을 초과하면 (mA)', id: 'overcurrent-limit' },
  freshnessLimit: { label: '최대 경과 (초)', id: 'freshness-limit' },
  stabilizationWait: { label: '안정화 대기 (초)', id: 'stabilization-wait' },
  repetitions: { label: '조건별 반복 (회)', id: 'repetitions' },
  tolerancePercent: { label: '허용 편차 (%)', id: 'tolerance-percent' },
} as const;

type NumericField = keyof typeof numericFields;
type NumericInputs = Partial<Record<NumericField, string>>;
type NumericErrors = Partial<Record<NumericField, string>>;
type ManualInputs = Pick<
  ProcedureDraftStepCriteria,
  'manualCheck' | 'equipmentVerified' | 'holdRule' | 'recoveryRule'
>;

const numericKeys = Object.keys(numericFields) as NumericField[];
const decimal = /^[+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+)(?:e[+-]?\d+)?$/i;

function validate(inputs: NumericInputs, manual: ManualInputs) {
  const criteria = {
    ...emptyProcedureDraftStepCriteria,
    ...manual,
    manualCheck: manual.manualCheck.trim(),
    holdRule: manual.holdRule.trim(),
    recoveryRule: manual.recoveryRule.trim(),
  };
  const errors: NumericErrors = {};
  for (const key of numericKeys) {
    const input = inputs[key]?.trim();
    if (!input) continue;

    const value = Number(input.replace(',', '.'));
    if (!decimal.test(input) || !Number.isFinite(value)) {
      errors[key] = '숫자만 입력해 주세요.';
    } else if (key === 'repetitions' && (!Number.isSafeInteger(value) || value < 1)) {
      errors[key] = '1 이상의 정수로 입력해 주세요.';
    } else if (
      (key === 'freshnessLimit' || key === 'stabilizationWait' || key === 'tolerancePercent') &&
      value < 0
    ) {
      errors[key] = '0 이상의 숫자로 입력해 주세요.';
    } else {
      criteria[key] = value;
    }
  }

  const { voltageMin, voltageMax } = criteria;
  if (voltageMin !== null && voltageMax !== null && voltageMin > voltageMax) {
    errors.voltageMax = '최댓값은 최솟값 이상이어야 합니다.';
  }
  return { criteria, errors };
}

interface StepCriteriaEditorProps {
  environmentId: string;
  draft: ProcedureDraft;
  step: ProcedureDraftStep;
  stepNumber: number;
  onBack: () => void;
  onSaved: () => void;
}

export function StepCriteriaEditor({
  environmentId,
  draft,
  step,
  stepNumber,
  onBack,
  onSaved,
}: StepCriteriaEditorProps) {
  const current = step.criteria ?? emptyProcedureDraftStepCriteria;
  const [inputs, setInputs] = useState<NumericInputs>(() =>
    Object.fromEntries(numericKeys.map((key) => [key, current[key]?.toString() ?? ''])),
  );
  const [manual, setManual] = useState<ManualInputs>(() => ({
    manualCheck: current.manualCheck,
    equipmentVerified: current.equipmentVerified,
    holdRule: current.holdRule,
    recoveryRule: current.recoveryRule,
  }));
  const [errors, setErrors] = useState<NumericErrors>({});
  const [status, setStatus] = useState<'idle' | 'invalid' | 'saving' | 'error'>('idle');
  const [dirty, setDirty] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [leave, setLeave] = useState<{ proceed: () => void } | null>(null);
  const saving = useRef(false);
  const busy = status === 'saving';
  const pending = draft.pendingItems.filter(({ stepId }) => stepId === step.id);
  const unresolved = step.needsReview || pending.length > 0;

  usePreventRemove(dirty || busy || showDetails, ({ repeat }) => {
    if (showDetails) setShowDetails(false);
    else if (!saving.current) setLeave({ proceed: repeat });
  });

  function editManual<Key extends keyof ManualInputs>(key: Key, value: ManualInputs[Key]) {
    setManual((previous) => ({ ...previous, [key]: value }));
    setDirty(true);
    if (status === 'error') setStatus('idle');
  }

  function editNumeric(key: NumericField, value: string) {
    setInputs((previous) => ({ ...previous, [key]: value }));
    editManual('equipmentVerified', false);
    if (status === 'invalid') {
      const nextErrors = validate({ ...inputs, [key]: value }, manual).errors;
      setErrors(nextErrors);
      if (!Object.keys(nextErrors).length) setStatus('idle');
    }
  }

  async function save() {
    if (saving.current) return;
    Keyboard.dismiss();
    const result = validate(inputs, manual);
    setErrors(result.errors);
    if (Object.keys(result.errors).length) {
      setStatus('invalid');
      return;
    }

    saving.current = true;
    setStatus('saving');
    try {
      await procedureDraftRepository.saveStepCriteria(
        environmentId,
        draft.id,
        step.id,
        result.criteria,
      );
    } catch {
      setStatus('error');
      return;
    } finally {
      saving.current = false;
    }
    setDirty(false);
    setStatus('idle');
    onSaved();
  }

  function numericField(key: NumericField) {
    const { label, id } = numericFields[key];
    return (
      <TextField
        testID={`step-criteria-${id}`}
        label={label}
        value={inputs[key] ?? ''}
        onChange={(value) => editNumeric(key, value)}
        placeholder="미입력"
        inputMode={key === 'repetitions' ? 'numeric' : 'decimal'}
        error={Boolean(errors[key])}
        support={errors[key]}
        disabled={busy}
      />
    );
  }

  return (
    <Screen>
      <StatusBar />
      <AppBar
        title={stepCriteriaTitle}
        mode="back"
        onBack={busy ? undefined : onBack}
        onMore={busy ? undefined : () => setShowDetails(true)}
      />
      <ScrollView
        testID="step-criteria-scroll"
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <AppText variant="heading" accessibilityRole="header">
          완료 기준 설정
        </AppText>
        <View style={styles.badges}>
          <StatusBadge
            label={`${stepNumber}. ${step.title}`}
            tone={unresolved ? 'warning' : 'info'}
          />
          {unresolved ? <StatusBadge label="필수 기준 미확정" tone="warning" /> : null}
        </View>
        <View style={styles.notice}>
          <Icon name="alert" size={15} color={colors.status.warning} />
          <AppText variant="caption" style={styles.noticeText}>
            승인 전 초안입니다. 수치와 조건은 실제 장비에서 확인해 주세요.
          </AppText>
        </View>

        <SectionHeader title="공급 전압 · 센서 근거" />
        {numericField('voltageMin')}
        {numericField('voltageMax')}
        <CheckboxRow
          testID="step-criteria-verified"
          title="실장비에서 확인함"
          subtitle={
            manual.equipmentVerified
              ? '실장비 확인을 기록했습니다.'
              : '실측 조건과 장비를 확인합니다.'
          }
          checked={manual.equipmentVerified}
          onChange={(checked) => editManual('equipmentVerified', checked)}
          disabled={busy}
        />

        <SectionHeader title="과전류 보류 · 안전 기준" />
        {numericField('overcurrentLimit')}
        <SurfaceCard
          title="단계 보류 · 원인 기록 · 숙련자 검토"
          subtitle="이 단계의 오류가 발생했을 때 적용할 규칙을 작성해 주세요."
          tone="subtle"
        >
          <TextField
            testID="step-criteria-hold-rule"
            label="보류 규칙"
            value={manual.holdRule}
            onChange={(value) => editManual('holdRule', value)}
            multiline
            disabled={busy}
          />
          <TextField
            testID="step-criteria-recovery-rule"
            label="복구 규칙"
            value={manual.recoveryRule}
            onChange={(value) => editManual('recoveryRule', value)}
            multiline
            disabled={busy}
          />
        </SurfaceCard>

        <SectionHeader title="데이터 최신성 · 센서 근거" />
        {numericField('freshnessLimit')}
        {numericField('stabilizationWait')}

        <SectionHeader title="반복과 편차 · 프로그램 계산" />
        {numericField('repetitions')}
        {numericField('tolerancePercent')}

        <SectionHeader title="작업자 직접 확인 · 사람 근거" />
        <TextField
          testID="step-criteria-manual-check"
          label="작업자가 확인할 항목"
          value={manual.manualCheck}
          onChange={(value) => editManual('manualCheck', value)}
          multiline
          disabled={busy}
        />
        <View style={styles.engineNote}>
          <Icon name="lock" size={15} />
          <AppText variant="caption" style={styles.noticeText}>
            완료 여부는 승인된 기준으로 판정합니다.
          </AppText>
        </View>
      </ScrollView>

      {status === 'invalid' || status === 'error' ? (
        <AppText accessibilityRole="alert" color={colors.status.danger} style={styles.error}>
          {status === 'invalid'
            ? '표시된 입력 오류를 확인해 주세요.'
            : '기준을 저장하지 못했어요. 다시 시도해 주세요.'}
        </AppText>
      ) : null}
      <ActionShelf
        primary={busy ? '기준 저장 중' : '기준 저장하고 다음'}
        primaryTestID="step-criteria-save"
        loading={busy}
        onPrimary={() => void save()}
      />

      {showDetails ? (
        <BottomSheet open title={draft.title} onClose={() => setShowDetails(false)}>
          <SurfaceCard title={step.title} subtitle={step.description} tone="subtle" />
          {pending.length ? (
            <SurfaceCard title="이 단계의 미확정 항목" tone="subtle">
              {pending.map(({ id, label }) => (
                <AppText key={id}>{label}</AppText>
              ))}
            </SurfaceCard>
          ) : null}
        </BottomSheet>
      ) : null}
      {leave ? (
        <BottomSheet
          open
          title="변경 내용을 저장하지 않았어요."
          subtitle="저장하지 않고 나가면 이번에 편집한 내용이 사라져요."
          tone="warning"
          icon="alert"
          onClose={() => setLeave(null)}
        >
          <Button label="계속 편집" onPress={() => setLeave(null)} />
          <Button
            label="저장하지 않고 나가기"
            variant="tertiary"
            onPress={() => {
              setDirty(false);
              setLeave(null);
              leave.proceed();
            }}
          />
        </BottomSheet>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { padding: spacing[24], gap: spacing[12] },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[6] },
  notice: {
    backgroundColor: colors.status.warningBg,
    borderRadius: radii[12],
    flexDirection: 'row',
    gap: spacing[8],
    padding: spacing[10],
  },
  noticeText: { flex: 1 },
  engineNote: {
    flexDirection: 'row',
    gap: spacing[8],
    padding: spacing[10],
  },
  error: {
    backgroundColor: colors.status.dangerBg,
    paddingHorizontal: spacing[24],
    paddingVertical: spacing[8],
  },
});
