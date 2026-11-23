export interface ProcedureDraftStepCriteria {
  readonly voltageMin: number | null;
  readonly voltageMax: number | null;
  readonly overcurrentLimit: number | null;
  readonly freshnessLimit: number | null;
  readonly stabilizationWait: number | null;
  readonly repetitions: number | null;
  readonly tolerancePercent: number | null;
  readonly manualCheck: string;
  readonly equipmentVerified: boolean;
  readonly holdRule: string;
  readonly recoveryRule: string;
}

export const emptyProcedureDraftStepCriteria: ProcedureDraftStepCriteria = {
  voltageMin: null,
  voltageMax: null,
  overcurrentLimit: null,
  freshnessLimit: null,
  stabilizationWait: null,
  repetitions: null,
  tolerancePercent: null,
  manualCheck: '',
  equipmentVerified: false,
  holdRule: '',
  recoveryRule: '',
};

function isNullableNumber(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value));
}

export function isProcedureDraftStepCriteria(value: unknown): value is ProcedureDraftStepCriteria {
  if (typeof value !== 'object' || value === null) return false;
  const criteria = value as Record<string, unknown>;
  return (
    isNullableNumber(criteria.voltageMin) &&
    isNullableNumber(criteria.voltageMax) &&
    isNullableNumber(criteria.overcurrentLimit) &&
    isNullableNumber(criteria.freshnessLimit) &&
    isNullableNumber(criteria.stabilizationWait) &&
    isNullableNumber(criteria.repetitions) &&
    isNullableNumber(criteria.tolerancePercent) &&
    typeof criteria.manualCheck === 'string' &&
    typeof criteria.equipmentVerified === 'boolean' &&
    typeof criteria.holdRule === 'string' &&
    typeof criteria.recoveryRule === 'string'
  );
}
