import type { ExperimentSession } from './models';

/** S04 진입 조건과 전체 준비(통신 점검 포함) 진행도를 분리한다. */
export function selectPreparation(session: ExperimentSession) {
  const requirements = session.procedure.preparation;
  const checked = new Set(session.checks.filter((check) => check.checked).map((check) => check.id));
  const completed = requirements.filter((item) => checked.has(item.id)).length;
  const missing = requirements.filter(
    (item) => item.requiredForDeviceCheck && !checked.has(item.id),
  );
  const current = requirements.find((item) => item.verifiedAt === 'S04' && !checked.has(item.id));
  return {
    completed,
    total: requirements.length,
    percentage: requirements.length ? Math.round((completed / requirements.length) * 100) : 0,
    missing,
    current,
    canContinue: session.phase === 'preparing' && missing.length === 0,
    awaitingDeviceCheck: session.phase === 'awaitingDeviceCheck',
  };
}
