import type { ProcedureSnapshot } from '../domain/models';

/** 기존 승인 스냅샷을 변경하지 않고 LED 예시 화면명만 Figma와 맞춘다. */
export function procedureDisplayTitle(procedure: ProcedureSnapshot | undefined) {
  if (!procedure) return '실험 진행';
  return procedure.procedureId === 'mock-led-output' &&
    procedure.title === 'LED 출력 단계별 조도·소비전력 측정'
    ? 'LED 출력 특성 측정'
    : procedure.title;
}
