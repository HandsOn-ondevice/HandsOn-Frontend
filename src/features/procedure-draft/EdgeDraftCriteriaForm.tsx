import { useState } from 'react';
import { AppText, Button, CheckboxRow, SurfaceCard, TextField, colors } from '@/design-system';
import type { EdgeDraftExecution, ProcedureDraft } from './procedureDraftRepository';

const fields = {
  distanceMinCm: { label: '거리 최솟값 (cm)', min: 0, max: 1000 },
  distanceMaxCm: { label: '거리 최댓값 (cm)', min: 0, max: 1000 },
  lightMinRaw: { label: '조도 최솟값 (원시값)', min: 0, max: 4095, initial: 1500, integer: true },
  settlingSeconds: { label: '안정화 대기 (초)', min: 0, max: 30, initial: 0.2 },
  staleAfterMs: {
    label: '센서값 최대 경과 (ms)',
    min: 100,
    max: 60000,
    initial: 5000,
    integer: true,
  },
  checkValidityMs: {
    label: '장치 점검 유효 시간 (ms)',
    min: 100,
    max: 120000,
    initial: 30000,
    integer: true,
  },
} satisfies Record<
  Exclude<keyof EdgeDraftExecution, 'conditions'>,
  {
    label: string;
    min: number;
    max: number;
    initial?: number;
    integer?: boolean;
  }
>;

type NumericField = keyof typeof fields;
type Inputs = Record<NumericField, string>;
type ConditionInput = { id: string; label: string; repetitions: string };
const numericFields = Object.keys(fields) as NumericField[];

function newCondition(): ConditionInput {
  return {
    id: `condition-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
    label: '',
    repetitions: '3',
  };
}

function parseNumber(input: string, min: number, max: number, integer = false) {
  const trimmed = input.trim();
  if (!/^\d+(?:[.,]\d+)?$/.test(trimmed)) return null;
  const value = Number(trimmed.replace(',', '.'));
  return value >= min && value <= max && (!integer || Number.isInteger(value)) ? value : null;
}

function parseExecution(inputs: Inputs, conditions: ConditionInput[]): EdgeDraftExecution | null {
  const values = {} as Record<NumericField, number>;
  for (const key of numericFields) {
    const field = fields[key];
    const value = parseNumber(inputs[key], field.min, field.max, 'integer' in field);
    if (value === null) return null;
    values[key] = value;
  }
  if (values.distanceMinCm >= values.distanceMaxCm) return null;

  const parsed = [];
  for (const { id, label, repetitions } of conditions) {
    const count = parseNumber(repetitions, 1, 50, true);
    if (!label.trim() || count === null) return null;
    parsed.push({ id, label: label.trim(), repetitions: count });
  }
  return { ...values, conditions: parsed };
}

export function EdgeDraftCriteriaForm({
  draft,
  onApply,
}: {
  draft: ProcedureDraft;
  onApply: (update: (draft: ProcedureDraft) => ProcedureDraft) => void;
}) {
  const previous = draft.edge?.execution;
  const [inputs, setInputs] = useState(
    () =>
      Object.fromEntries(
        numericFields.map((key) => {
          const field = fields[key];
          const value = previous?.[key] ?? ('initial' in field ? field.initial : undefined);
          return [key, value?.toString() ?? ''];
        }),
      ) as Inputs,
  );
  const [conditions, setConditions] = useState<ConditionInput[]>(
    () =>
      previous?.conditions.map((condition) => ({
        ...condition,
        repetitions: String(condition.repetitions),
      })) ?? [newCondition()],
  );
  const [reviewed, setReviewed] = useState(() =>
    Object.fromEntries(draft.steps.map(({ id, needsReview }) => [id, !needsReview])),
  );
  const [resolved, setResolved] = useState<Record<string, boolean>>({});
  const [invalid, setInvalid] = useState(false);

  function editCondition(id: string, change: Partial<ConditionInput>) {
    setConditions((items) => items.map((item) => (item.id === id ? { ...item, ...change } : item)));
  }

  function apply() {
    const execution = parseExecution(inputs, conditions);
    if (!execution) {
      setInvalid(true);
      return;
    }
    onApply((current) =>
      current.edge
        ? {
            ...current,
            edge: { ...current.edge, execution },
            steps: current.steps.map((step) => ({ ...step, needsReview: !reviewed[step.id] })),
            pendingItems: current.pendingItems.filter(({ id }) => !resolved[id]),
          }
        : current,
    );
  }

  return (
    <>
      <AppText color={colors.text.secondary}>
        거리와 반복 기준을 입력하고 각 단계와 미확정 항목을 확인해 주세요. 작업자가 읽을 오류 대응
        안내는 단계 내용에서 편집할 수 있어요.
      </AppText>
      {numericFields.map((key) => {
        const field = fields[key];
        return (
          <TextField
            key={key}
            label={field.label}
            value={inputs[key]}
            onChange={(value) => setInputs((current) => ({ ...current, [key]: value }))}
            support={`${field.min}~${field.max}${'integer' in field ? ' 정수' : ''}`}
            inputMode={'integer' in field ? 'numeric' : 'decimal'}
          />
        );
      })}
      {conditions.map(({ id, label, repetitions }, index) => (
        <SurfaceCard key={id} title={`측정 조건 ${index + 1}`} tone="subtle">
          <TextField
            label={`조건 ${index + 1} 이름`}
            value={label}
            onChange={(value) => editCondition(id, { label: value })}
            maxLength={100}
          />
          <TextField
            label={`조건 ${index + 1} 반복 (회)`}
            value={repetitions}
            onChange={(value) => editCondition(id, { repetitions: value })}
            support="1~50 정수"
            inputMode="numeric"
          />
          {conditions.length > 1 ? (
            <Button
              label={`조건 ${index + 1} 삭제`}
              variant="tertiary"
              onPress={() => setConditions((items) => items.filter((item) => item.id !== id))}
            />
          ) : null}
        </SurfaceCard>
      ))}
      <Button
        label="조건 추가"
        variant="secondary"
        disabled={conditions.length >= 10}
        onPress={() => setConditions((items) => [...items, newCondition()])}
      />
      {draft.steps.map(({ id, title }) => (
        <CheckboxRow
          key={id}
          title={`단계 검토 완료 · ${title}`}
          testID={`edge-draft-step-${id}`}
          checked={Boolean(reviewed[id])}
          onChange={(value) => setReviewed((items) => ({ ...items, [id]: value }))}
        />
      ))}
      {draft.pendingItems.map(({ id, label }, index) => (
        <CheckboxRow
          key={id}
          title={`미확정 항목 확인 완료 · ${label}`}
          testID={`edge-draft-pending-${index}`}
          checked={Boolean(resolved[id])}
          onChange={(value) => setResolved((items) => ({ ...items, [id]: value }))}
        />
      ))}
      {invalid ? (
        <AppText accessibilityRole="alert" color={colors.status.danger}>
          최댓값은 최솟값보다 커야 해요. 입력 범위와 조건 이름·반복 횟수를 확인해 주세요.
        </AppText>
      ) : null}
      <Button label="기준 적용" onPress={apply} />
    </>
  );
}
