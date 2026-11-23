import type {
  ProcedureDraft,
  ProcedureDraftStep,
} from '@/features/procedure-draft/procedureDraftRepository';

export function describeStepCriteria(step: ProcedureDraftStep) {
  if (!step.criteria) return null;

  const {
    voltageMin,
    voltageMax,
    overcurrentLimit,
    freshnessLimit,
    stabilizationWait,
    repetitions,
    tolerancePercent,
    manualCheck,
    holdRule,
    recoveryRule,
  } = step.criteria;
  const lines = [
    voltageMin !== null && `공급 전압 최솟값 ${voltageMin} V`,
    voltageMax !== null && `공급 전압 최댓값 ${voltageMax} V`,
    overcurrentLimit !== null && `과전류 보류 기준 ${overcurrentLimit} mA`,
    freshnessLimit !== null && `센서값 최대 경과 ${freshnessLimit}초`,
    stabilizationWait !== null && `안정화 대기 ${stabilizationWait}초`,
    repetitions !== null && `조건별 반복 ${repetitions}회`,
    tolerancePercent !== null && `허용 편차 ${tolerancePercent}%`,
    manualCheck.trim() && `작업자 확인 · ${manualCheck}`,
    holdRule.trim() && `보류 · ${holdRule}`,
    recoveryRule.trim() && `복구 · ${recoveryRule}`,
  ].filter(Boolean);
  return lines.length ? { title: step.title, description: lines.join('\n') } : null;
}

export function getUnresolvedDraftItems(draft: ProcedureDraft) {
  return draft.pendingItems.filter(({ id, stepId }) => {
    const step = draft.steps.find((step) => step.id === stepId);
    const criteria = step?.criteria;
    if (!criteria) return true;

    switch (id) {
      case 'voltage-range':
        return (
          criteria.voltageMin === null ||
          criteria.voltageMax === null ||
          criteria.voltageMin > criteria.voltageMax
        );
      case 'overcurrent-limit':
        return criteria.overcurrentLimit === null;
      case 'sensor-age-limit':
        return criteria.freshnessLimit === null || criteria.freshnessLimit < 0;
      case 'review-transcript-content':
        return !step.description.trim() || !describeStepCriteria(step);
      default:
        return true;
    }
  });
}

export function stepNeedsCriteriaReview(draft: ProcedureDraft, step: ProcedureDraftStep) {
  const mapped = draft.pendingItems.some(({ stepId }) => stepId === step.id);
  return (
    getUnresolvedDraftItems(draft).some(({ stepId }) => stepId === step.id) ||
    (step.needsReview && !mapped && !describeStepCriteria(step))
  );
}

export function getProcedureReleaseBlockers(draft: ProcedureDraft) {
  const pending = getUnresolvedDraftItems(draft);
  const blockers = pending.map(({ label }) => `필수 기준 미확정 · ${label}`);
  if (!draft.title.trim()) blockers.push('절차 이름이 필요합니다.');
  if (!draft.steps.length || draft.steps.some(({ title }) => !title.trim())) {
    blockers.push('절차 단계를 확인해 주세요.');
  }
  if (!draft.materials.some((material) => material.trim())) {
    blockers.push('필요 장비와 준비물을 입력해 주세요.');
  }

  for (const step of draft.steps) {
    if (step.needsReview && !draft.pendingItems.some(({ stepId }) => stepId === step.id)) {
      if (!describeStepCriteria(step)) blockers.push(`필수 기준 미확정 · ${step.title}`);
    }
    const requiresEquipment =
      step.criteria ||
      step.needsReview ||
      draft.pendingItems.some(({ stepId }) => stepId === step.id);
    if (requiresEquipment && !step.criteria?.equipmentVerified) {
      blockers.push(`실장비 확인 필요 · ${step.title}`);
    }
  }
  return blockers;
}
