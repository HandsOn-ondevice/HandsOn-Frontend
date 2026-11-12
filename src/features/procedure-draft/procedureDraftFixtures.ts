import type { ProcedureDraft, ProcedureDraftStepGroup } from './procedureDraftRepository';

const preparation: ProcedureDraftStepGroup = {
  id: 'preparation',
  title: '준비물과 전원 차단 확인',
  description: '작업자 확인 · 필수 7개 항목',
};

const sensorSetup: ProcedureDraftStepGroup = {
  id: 'sensor-setup',
  title: '센서 배선과 기구 배치',
  description: '20cm · 수광면 정렬 · 작업자 확인',
};

const powerCheck: ProcedureDraftStepGroup = {
  id: 'power-check',
  title: '전원 인가와 범위 확인',
  description: '공급 전압·과전류 기준이 필요합니다 · 완료 기준 미확정',
};

const measurements: ProcedureDraftStepGroup = {
  id: 'measurements',
  title: '25·50·75·100% 각 3회 측정',
  description: '최신 센서값 · 사람 확인 · 반복 관리',
  showRange: true,
};

const completion: ProcedureDraftStepGroup = {
  id: 'completion',
  title: '누락 검토 · 종료 · 결과 제출',
  description: '유효 15회 · 종료 확인 · 이력 보존',
  showRange: true,
};

export function getDemoProcedureDraftId(
  environmentId: string,
  source: 'existing' | 'generated' = 'existing',
) {
  const name = source === 'existing' ? 'led-output-draft' : 'generated-led-output-draft';
  return `${environmentId}:procedure:${name}`;
}

export function createDemoProcedureDraft(environmentId: string, id: string): ProcedureDraft | null {
  const existingId = getDemoProcedureDraftId(environmentId);
  const generatedId = getDemoProcedureDraftId(environmentId, 'generated');
  if (id !== existingId && id !== generatedId) return null;

  return {
    id,
    title: 'LED 출력 특성 측정 초안',
    description: '출력 조건을 바꾸며 조도·전압·전류·환경값을 기록합니다.',
    status: 'draft',
    version: 'v0.1',
    steps: [
      {
        id: 'select',
        title: '실험·장치 선택',
        description: '실험 ID, 장치 ID, 승인 버전 고정',
        needsReview: false,
      },
      {
        id: 'prepare',
        title: preparation.title,
        description: preparation.description,
        needsReview: false,
        group: preparation,
      },
      {
        id: 'equipment-id',
        title: '대상 장치 확인',
        description: '장치 라벨의 ID가 선택한 장치와 일치하는지 확인합니다.',
        needsReview: false,
        group: preparation,
      },
      {
        id: 'power-off',
        title: '전원 차단 확인',
        description: '배선을 점검하기 전에 장치의 전원이 차단됐는지 확인합니다.',
        needsReview: false,
        group: preparation,
      },
      {
        id: 'connect',
        title: sensorSetup.title,
        description: sensorSetup.description,
        needsReview: false,
        group: sensorSetup,
      },
      {
        id: 'arrange',
        title: 'LED와 조도 센서 위치 확인',
        description: 'LED와 센서 수광면 사이 거리를 확인하고 기구를 고정합니다.',
        needsReview: false,
        group: sensorSetup,
      },
      {
        id: 'power-range',
        title: powerCheck.title,
        description: powerCheck.description,
        needsReview: true,
        group: powerCheck,
      },
      {
        id: 'sensor-freshness',
        title: '센서값 갱신 확인',
        description: '센서값을 유효하다고 판단할 경과 시간 기준을 확인합니다.',
        needsReview: true,
        group: powerCheck,
      },
      {
        id: 'measure',
        title: '0% 기준 측정',
        description: '안정화 5초 · 센서값과 타임스탬프',
        needsReview: false,
      },
      ...[25, 50, 75, 100].map((output) => ({
        id: `measure-${output}`,
        title: `${output}% 출력 3회 측정`,
        description: '최신 센서값을 확인하고 유효한 측정값과 시각을 기록합니다.',
        needsReview: false,
        group: measurements,
      })),
      {
        id: 'review',
        title: '누락과 이상 확인',
        description: '출력 조건별 기록을 검토하고 재측정이 필요한 항목을 확인합니다.',
        needsReview: false,
        group: completion,
      },
      {
        id: 'shutdown',
        title: '실험 종료와 장치 정리',
        description: '전원 차단과 장치 정리 상태를 확인합니다.',
        needsReview: false,
        group: completion,
      },
      {
        id: 'submit',
        title: '결과 제출',
        description: '유효 측정값과 보류·재측정 이력을 함께 남깁니다.',
        needsReview: false,
        group: completion,
      },
    ],
    materials: [
      'LED 모듈',
      'BH1750',
      'INA219',
      'BME280',
      '고정 지그',
      'Orange Pi 5+',
      'USB 전원 장치',
    ],
    precautions: [
      '센서 배선을 점검할 때 장치 전원이 차단되어 있는지 확인합니다.',
      '출력값을 기록할 때 센서값의 갱신 여부를 확인합니다.',
    ],
    pendingItems: [
      { id: 'voltage-range', label: '공급 전압 범위', stepId: 'power-range' },
      { id: 'overcurrent-limit', label: '과전류 보류 기준', stepId: 'power-range' },
      { id: 'sensor-age-limit', label: '센서값 최신성 기준', stepId: 'sensor-freshness' },
    ],
    savedAt: null,
  };
}
