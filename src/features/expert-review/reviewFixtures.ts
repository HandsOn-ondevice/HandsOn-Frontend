import type {
  ConditionEvidence,
  EvidenceMeasurement,
  ReviewCondition,
  ReviewOutcome,
  ReviewResult,
} from './reviewData';

interface DemoCondition extends ReviewCondition {
  readonly evidence: ConditionEvidence;
}

export interface DemoSubmission {
  readonly key: string;
  readonly studentName: string;
  readonly deviceName: string;
  readonly sessionId: string;
  readonly approvedVersion: string;
  readonly submittedLabel: string;
  readonly homeSummary: string;
  readonly conditions: readonly DemoCondition[];
  readonly issue?: ReviewResult['issue'];
  readonly initialReview?: ReviewOutcome;
}

type OutputLevel = 0 | 25 | 50 | 75 | 100;
export const demoReviewProcedure = {
  key: 'led-output',
  title: 'LED 출력 특성 측정',
} as const;
const measurementTarget = 3;
export const demoReviewUnit = 'lx';
const emptyEvidence: ConditionEvidence = {
  measurements: [],
  history: [],
  deviationPercent: null,
  voltageAverage: null,
  currentAverage: null,
  powerAverage: null,
  calculation: null,
};

function measurement(
  round: number,
  value: number,
  timestamp: string,
  detail?: string,
): EvidenceMeasurement {
  return {
    id: `measurement-${round}`,
    title: `${round}회차`,
    value: `${value} ${demoReviewUnit}`,
    timestamp,
    source: detail ? 'BH1750 · INA219' : 'BH1750',
    kind: 'sensor',
    validity: 'valid',
    detail,
  };
}

function condition(
  output: OutputLevel,
  value: number | null,
  evidence: ConditionEvidence,
): DemoCondition {
  return {
    id: `output-${output}`,
    label: `${output}%`,
    value,
    totalCount: measurementTarget,
    validCount: evidence.measurements.filter((item) => item.validity === 'valid').length,
    invalidCount: evidence.measurements.filter((item) => item.validity === 'invalid').length,
    evidence,
  };
}

function standardCondition(
  output: OutputLevel,
  readings: readonly number[],
  hour: string,
): DemoCondition {
  if (readings.length === 0) return condition(output, null, emptyEvidence);

  const minutes = String(output / 5).padStart(2, '0');
  const average = readings.reduce((sum, reading) => sum + reading, 0) / readings.length;
  return condition(output, Number(average.toFixed(1)), {
    ...emptyEvidence,
    measurements: readings.map((reading, index) =>
      measurement(index + 1, reading, `${hour}:${minutes}:${index + 1}0`),
    ),
    calculation: { source: 'HandsOn · 유효 측정 평균', timestamp: `${hour}:${minutes}:40` },
  });
}

const invalid50Percent: EvidenceMeasurement = {
  ...measurement(2, 420, '10:05:14'),
  validity: 'invalid',
  invalidReason: 'BH1750 값 6.4초 경과',
};

const recovered50Percent = condition(50, 422, {
  measurements: [
    measurement(1, 419, '10:02:18', '5.00 V · 82 mA'),
    invalid50Percent,
    {
      ...measurement(2, 423, '10:08:17'),
      id: 'measurement-2-retry',
      title: '2회차 재측정',
      detail: '원본 무효 기록과 연결',
      replacesMeasurementId: invalid50Percent.id,
    },
    measurement(3, 424, '10:11:19'),
  ],
  history: [
    {
      id: 'stale-hold',
      kind: 'held',
      title: '오래된 센서값으로 측정 보류',
      timestamp: '10:05:14',
      detail: '유효 측정 집계에서 제외',
      source: 'HandsOn · 최신성 판정',
      sourceKind: 'program',
    },
    {
      id: 'sensor-recovery',
      kind: 'recovered',
      title: '센서 케이블 재연결',
      timestamp: '10:07:21',
      detail: '작업자 보고 · 안정화 재시작',
      source: '노준혁 · 작업자 확인',
      sourceKind: 'human',
    },
  ],
  deviationPercent: 0.7,
  voltageAverage: 5.01,
  currentAverage: 83,
  powerAverage: 416,
  calculation: { source: 'HandsOn · 유효 측정 평균', timestamp: '10:11:20' },
});

const invalid75Percent: EvidenceMeasurement = {
  id: 'measurement-3',
  title: '3회차',
  value: null,
  timestamp: '10:47:42',
  source: '노준혁 · 작업자 확인',
  kind: 'human',
  validity: 'invalid',
  invalidReason: '지그 이동 보고',
};

const recovered75Percent = condition(75, 609, {
  ...emptyEvidence,
  measurements: [
    measurement(1, 611, '10:46:12'),
    measurement(2, 608, '10:47:01'),
    invalid75Percent,
    {
      ...measurement(3, 608, '10:49:12'),
      id: 'measurement-3-retry',
      title: '3회차 재측정',
      detail: '원본 무효 기록과 연결',
      replacesMeasurementId: invalid75Percent.id,
    },
  ],
  history: [
    {
      id: 'fixture-recovery',
      kind: 'recovered',
      title: '지그 위치 재확인',
      timestamp: '10:48:14',
      detail: '재측정 전 기준 위치 확인',
      source: '노준혁 · 작업자 확인',
      sourceKind: 'human',
    },
  ],
  calculation: { source: 'HandsOn · 유효 측정 평균', timestamp: '10:49:13' },
});

export const demoSubmissions: readonly DemoSubmission[] = [
  {
    key: 'led-m03',
    studentName: '노준혁',
    deviceName: 'LED-M03',
    sessionId: 'R-241015-07',
    approvedVersion: 'v1.2',
    submittedLabel: '10분 전 제출',
    homeSummary: '보류 1건 · 재측정 2회',
    conditions: [
      standardCondition(0, [18, 18.4, 18.8], '09'),
      standardCondition(25, [229, 230, 231], '09'),
      recovered50Percent,
      recovered75Percent,
      standardCondition(100, [781, 784, 787], '11'),
    ],
    issue: {
      conditionId: recovered50Percent.id,
      title: '50% 조건 센서 오류',
      subtitle: '오래된 값 1건 · 재측정 완료 · 보기',
      description:
        '420 lx 값은 6.4초 경과로 무효 처리되었고, 케이블 재연결 후 423 lx를 새로 저장했습니다.',
    },
  },
  {
    key: 'led-m02',
    studentName: '김민지',
    deviceName: 'LED-M02',
    sessionId: 'R-241015-06',
    approvedVersion: 'v1.2',
    submittedLabel: '25분 전 제출',
    homeSummary: '기준값 확인 필요',
    conditions: [
      standardCondition(0, [16, 17, 18], '09'),
      standardCondition(25, [211, 213, 215], '09'),
      standardCondition(50, [400, 402, 404], '09'),
      standardCondition(75, [581, 583], '09'),
      standardCondition(100, [], '09'),
    ],
  },
  {
    key: 'led-m01',
    studentName: '이서준',
    deviceName: 'LED-M01',
    sessionId: 'R-241014-05',
    approvedVersion: 'v1.2',
    submittedLabel: '어제 제출',
    homeSummary: '검토 완료',
    initialReview: { status: 'reviewed', comment: '제출된 측정값과 근거를 확인했습니다.' },
    conditions: [
      standardCondition(0, [21, 22, 23], '14'),
      standardCondition(25, [218, 221, 224], '14'),
      standardCondition(50, [412, 415, 418], '14'),
      standardCondition(75, [590, 592, 594], '14'),
      standardCondition(100, [761, 765, 769], '14'),
    ],
  },
];
