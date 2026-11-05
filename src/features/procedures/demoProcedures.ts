import type { ProcedureDetail } from './procedureModels';

export interface DemoProcedureEntry {
  status: 'approved' | 'draft' | 'revoked';
  environmentIds: readonly string[];
  detail: ProcedureDetail;
}

const environmentIds = ['demo-embedded-iot', 'demo-circuits'];

const led: ProcedureDetail = {
  id: 'demo-led-characteristics',
  code: 'LED-M03',
  title: 'LED 출력 단계별\n조도·소비전력 특성 측정',
  description: '출력 변화에 따른 조도와 전력 특성을 5개 조건에서 확인합니다.',
  approvedVersion: 'v1.2',
  approvedBy: '박지연',
  estimatedMinutes: 25,
  stepCount: 16,
  category: 'led',
  lastUsedAt: '2026-10-15T09:00:00+09:00',
  conditions: ['0%', '25%', '50%', '75%', '100%'].map((label) => ({
    label,
    repetitions: 3,
  })),
  equipment: ['LED 모듈', 'BH1750', 'INA219', 'BME280', '고정 지그'],
  criteria: [
    { title: '공급 전압 4.8–5.2 V', description: '과전류 250 mA 초과 시 보류' },
    { title: '안정화 5초 · 최신값 2초 이내', description: '각 조건 유효 측정 3회 필요' },
  ],
  steps: [
    '전원 차단과 배선·고정 상태를 확인합니다.',
    '0%부터 100%까지 출력을 순서대로 설정합니다.',
    '각 조건에서 5초간 안정화한 뒤 조도·전압·전류·환경값을 3회 기록합니다.',
    '모든 조건의 기록을 확인하고 전원을 차단합니다.',
  ],
  precautions: [
    '배선이나 LED 모듈을 변경하기 전 전원을 차단하세요.',
    '과전류가 감지되거나 센서값이 갱신되지 않으면 측정을 보류하세요.',
  ],
};

const sensor: ProcedureDetail = {
  id: 'demo-i2c-address-check',
  code: 'I2C-01',
  title: 'I2C 센서 주소 점검',
  description: '장치 주소 중복과 응답 상태를 확인합니다.',
  approvedVersion: 'v1.0',
  approvedBy: '박지연',
  estimatedMinutes: 10,
  stepCount: 8,
  category: 'sensor',
  conditions: [{ label: '주소 점검', repetitions: 1 }],
  equipment: ['Orange Pi', 'BH1750', 'INA219', 'BME280', 'I2C 케이블'],
  criteria: [
    { title: '연결된 센서의 주소 응답', description: '장치별 주소와 응답 유무를 기록' },
    { title: '주소 중복 없음', description: '중복 또는 무응답 장치가 있으면 연결 상태 확인' },
  ],
  steps: [
    '전원을 차단하고 센서 배선을 확인합니다.',
    '전원을 켜고 I2C 주소 목록을 조회합니다.',
    '센서별 주소와 응답을 대조하고 결과를 기록합니다.',
  ],
  precautions: ['전원이 켜진 상태에서 센서 배선을 바꾸지 마세요.'],
};

/** Synthetic examples for development and Maestro; these are not server approvals. */
export const demoProcedureCatalog: readonly DemoProcedureEntry[] = [
  { status: 'approved', environmentIds, detail: led },
  { status: 'approved', environmentIds, detail: sensor },
  {
    status: 'draft',
    environmentIds,
    detail: { ...led, id: 'demo-led-draft', title: 'LED 측정 초안', approvedVersion: 'draft' },
  },
  {
    status: 'revoked',
    environmentIds,
    detail: { ...sensor, id: 'demo-sensor-revoked', title: '승인 취소된 센서 점검' },
  },
];
