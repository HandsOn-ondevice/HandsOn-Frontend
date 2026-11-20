import type { PreparationRequest } from '@/features/procedures/PreparationHandoffProvider';
import type { ProcedureRepository } from '@/features/procedures/procedureRepository';
import type { WorkflowRepository } from '../../application/WorkflowRepository';
import { WorkflowError, type ProcedureSnapshot } from '../../domain/models';
import { mockProcedure } from './fixtures';

export interface StartApprovedMockSessionInput {
  readonly request: PreparationRequest;
  readonly requestId: string;
  readonly operatorId: string;
}

/** 승인 카탈로그와 기존 LED Mock 실행 정의의 명시적 연결이다. 실제 안전 기준을 해석하지 않는다. */
export function createApprovedMockSessionStarter(
  repository: Pick<WorkflowRepository, 'createSession'>,
  procedures: Pick<ProcedureRepository, 'getDetail'>,
) {
  return async ({ request, requestId, operatorId }: StartApprovedMockSessionInput) => {
    const selection = {
      procedureId: request.procedureId,
      approvedVersion: request.approvedVersion,
      environmentId: request.environment.id,
    };
    if (!requestId.trim() || !operatorId.trim())
      throw new WorkflowError('INVALID_STATE', '생성 요청 ID와 Mock 작업자 ID가 필요합니다.');
    if (
      selection.procedureId !== 'demo-led-characteristics' ||
      selection.approvedVersion !== 'v1.2' ||
      selection.environmentId !== 'demo-embedded-iot'
    )
      throw new WorkflowError(
        'INVALID_PROCEDURE',
        '선택한 절차·버전·환경에 대응하는 Mock 실행 정의가 없습니다. LED 실험으로 대체하지 않습니다.',
      );

    const detail = await procedures.getDetail(selection);
    const template: ProcedureSnapshot = JSON.parse(JSON.stringify(mockProcedure));
    const execution = template.execution!;
    if (
      !detail ||
      detail.id !== selection.procedureId ||
      detail.approvedVersion !== selection.approvedVersion ||
      detail.category !== 'led' ||
      detail.code !== template.deviceId ||
      !detail.title.trim() ||
      detail.conditions.length !== execution.conditions.length ||
      detail.conditions.some(
        (condition, index) =>
          condition.label !== execution.conditions[index].label ||
          condition.repetitions !== execution.conditions[index].repetitions,
      ) ||
      !template.deviceCheck!.sensors.every((sensor) => detail.equipment.includes(sensor.title))
    )
      throw new WorkflowError(
        'INVALID_PROCEDURE',
        '선택한 승인 절차를 확인할 수 없거나 기존 LED Mock 실행 정의와 일치하지 않습니다.',
      );

    // 표시용 절차 ID를 세션 ID로 사용하지 않는다. 요청 재시도 중복 방지는 기존 createSession이 담당한다.
    return repository.createSession({
      requestId,
      operatorId,
      procedure: {
        ...template,
        procedureId: detail.id,
        version: detail.approvedVersion,
        title: detail.title,
        deviceId: detail.code,
        execution: {
          ...execution,
          conditions: detail.conditions.map((condition, index) => ({
            id: execution.conditions[index].id,
            label: condition.label,
            repetitions: condition.repetitions,
          })),
        },
      },
    });
  };
}
