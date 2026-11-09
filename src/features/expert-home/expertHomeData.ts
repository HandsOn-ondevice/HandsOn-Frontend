export interface ExpertProcedure {
  readonly id: string;
  readonly title: string;
  readonly status: 'draft' | 'approved';
  readonly version: string;
  readonly updatedLabel: string;
  readonly summary: string;
  readonly detail?: string;
}

export interface ExpertResult {
  readonly id: string;
  readonly procedureId: string;
  readonly procedureTitle: string;
  readonly studentName: string;
  readonly deviceName: string;
  readonly status: 'pending' | 'reviewed';
  readonly summary: string;
  readonly submittedLabel: string;
}

export type ExpertRecentWork = {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly updatedLabel: string;
} & (
  | { readonly kind: 'procedure'; readonly procedureId: string }
  | { readonly kind: 'result'; readonly resultId: string; readonly procedureId: string }
);

export interface ExpertHomeData {
  readonly displayName: string;
  readonly procedures: readonly ExpertProcedure[];
  readonly results: readonly ExpertResult[];
  readonly recentWork: readonly ExpertRecentWork[];
}

export type LoadExpertHome = (environmentId: string) => Promise<ExpertHomeData>;

function createDemoHome(environmentId: string): ExpertHomeData {
  const procedureId = (name: string) => `${environmentId}:procedure:${name}`;
  const resultId = (name: string) => `${environmentId}:result:${name}`;

  return {
    displayName: '지연',
    procedures: [
      {
        id: procedureId('led-output-draft'),
        title: 'LED 출력 특성 측정 초안',
        status: 'draft',
        version: 'v0.1',
        updatedLabel: '자동 저장 8분 전',
        summary: '미확정 기준 3개',
        detail: '기준값 검토 필요',
      },
      {
        id: procedureId('led-output'),
        title: 'LED 출력 특성 측정',
        status: 'approved',
        version: 'v1.2',
        updatedLabel: '오늘 승인',
        summary: '16단계 · 준비물 7개',
      },
      {
        id: procedureId('i2c-sensor'),
        title: 'I2C 센서 수집 점검',
        status: 'approved',
        version: 'v1.0',
        updatedLabel: '어제 승인',
        summary: '센서 연결 · 측정값 확인',
      },
      {
        id: procedureId('power-check'),
        title: '전원 안정성 확인',
        status: 'approved',
        version: 'v1.1',
        updatedLabel: '2일 전 승인',
        summary: '전압 · 전류 확인',
      },
      {
        id: procedureId('environment-sensor'),
        title: '환경 센서 기준값 측정',
        status: 'approved',
        version: 'v1.0',
        updatedLabel: '3일 전 승인',
        summary: '온도 · 습도 측정',
      },
    ],
    results: [
      {
        id: resultId('led-m03'),
        procedureId: procedureId('led-output'),
        procedureTitle: 'LED 출력 특성 측정',
        studentName: '노준혁',
        deviceName: 'LED-M03',
        status: 'pending',
        summary: '보류 1건 · 재측정 2회 · v1.2',
        submittedLabel: '10분 전 제출',
      },
      {
        id: resultId('led-m02'),
        procedureId: procedureId('led-output'),
        procedureTitle: 'LED 출력 특성 측정',
        studentName: '김민지',
        deviceName: 'LED-M02',
        status: 'pending',
        summary: '기준값 확인 필요 · v1.2',
        submittedLabel: '25분 전 제출',
      },
      {
        id: resultId('led-m01'),
        procedureId: procedureId('led-output'),
        procedureTitle: 'LED 출력 특성 측정',
        studentName: '이서준',
        deviceName: 'LED-M01',
        status: 'reviewed',
        summary: '검토 완료 · v1.2',
        submittedLabel: '어제 제출',
      },
    ],
    recentWork: [
      {
        id: `${environmentId}:recent:draft`,
        kind: 'procedure',
        procedureId: procedureId('led-output-draft'),
        title: 'LED 출력 특성 측정 초안',
        summary: '초안 편집',
        updatedLabel: '8분 전',
      },
      {
        id: `${environmentId}:recent:review`,
        kind: 'result',
        resultId: resultId('led-m01'),
        procedureId: procedureId('led-output'),
        title: '이서준 · LED-M01',
        summary: '결과 검토 완료',
        updatedLabel: '어제',
      },
    ],
  };
}

export const loadExpertHome: LoadExpertHome = async (environmentId) => {
  if (!environmentId.trim()) throw new Error('작업 환경을 선택해 주세요.');
  // Replace the fixture loader after home aggregates and draft re-entry contracts are agreed.
  if (__DEV__ || process.env.EXPO_PUBLIC_HANDSON_MAESTRO === '1') {
    return createDemoHome(environmentId);
  }
  throw new Error('숙련자 홈 조회가 아직 연결되지 않았습니다.');
};
