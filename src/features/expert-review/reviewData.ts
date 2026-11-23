import {
  demoReviewProcedure,
  demoReviewUnit,
  demoSubmissions,
  type DemoSubmission,
} from './reviewFixtures';

export type ReviewStatus = 'pending' | 'reviewed' | 'remeasurementRequested';

export const reviewStatusLabels = {
  pending: '검토 대기',
  reviewed: '검토 완료',
  remeasurementRequested: '재측정 요청',
} as const satisfies Record<ReviewStatus, string>;

export interface ReviewOutcome {
  readonly status: Exclude<ReviewStatus, 'pending'>;
  readonly comment: string;
}

export interface ReviewCondition {
  readonly id: string;
  readonly label: string;
  readonly value: number | null;
  readonly validCount: number;
  readonly totalCount: number;
  readonly invalidCount: number;
}

export interface ReviewResult {
  readonly id: string;
  readonly procedureId: string;
  readonly procedureTitle: string;
  readonly sessionId: string;
  readonly approvedVersion: string;
  readonly studentName: string;
  readonly deviceName: string;
  readonly submittedLabel: string;
  readonly status: ReviewStatus;
  readonly comment: string;
  readonly validCount: number;
  readonly totalCount: number;
  readonly unresolvedCount: number;
  readonly remeasurementCount: number;
  readonly unit: string;
  readonly conditions: readonly ReviewCondition[];
  readonly issue?: {
    readonly conditionId: string;
    readonly title: string;
    readonly subtitle: string;
    readonly description: string;
  };
}

type EvidenceKind = 'human' | 'sensor' | 'program';

export interface EvidenceMeasurement {
  readonly id: string;
  readonly title: string;
  readonly source: string;
  readonly timestamp: string;
  readonly kind: EvidenceKind;
  readonly validity: 'valid' | 'invalid';
  readonly value: string | null;
  readonly invalidReason?: string;
  readonly detail?: string;
  readonly replacesMeasurementId?: string;
}

export interface EvidenceEvent {
  readonly id: string;
  readonly title: string;
  readonly timestamp: string;
  readonly detail: string;
  readonly source: string;
  readonly kind: 'held' | 'recovered' | 'remeasured';
  readonly sourceKind: EvidenceKind;
}

export interface ConditionEvidence {
  readonly measurements: readonly EvidenceMeasurement[];
  readonly history: readonly EvidenceEvent[];
  readonly deviationPercent: number | null;
  readonly voltageAverage: number | null;
  readonly currentAverage: number | null;
  readonly powerAverage: number | null;
  readonly calculation: { readonly source: string; readonly timestamp: string } | null;
}

export interface ExpertReviewRepository {
  loadResult(environmentId: string, resultId: string, procedureId: string): Promise<ReviewResult>;
  loadEvidence(
    environmentId: string,
    resultId: string,
    conditionId: string,
  ): Promise<ConditionEvidence>;
  submitReview(
    environmentId: string,
    resultId: string,
    outcome: ReviewOutcome,
  ): Promise<ReviewOutcome>;
}

// The development adapter keeps reviews only for the current app session.
const savedReviews = new Map<string, ReviewOutcome>();

function demoResultId(environmentId: string, submission: DemoSubmission) {
  return `${environmentId}:result:${submission.key}`;
}

function demoProcedureId(environmentId: string) {
  return `${environmentId}:procedure:${demoReviewProcedure.key}`;
}

function getDemoSubmission(environmentId: string, resultId: string) {
  if (!(__DEV__ || process.env.EXPO_PUBLIC_HANDSON_MAESTRO === '1')) {
    throw new Error('결과 검토 API가 아직 연결되지 않았습니다.');
  }
  const submission = demoSubmissions.find((item) => demoResultId(environmentId, item) === resultId);
  if (!environmentId.trim() || !submission) {
    throw new Error('현재 작업 환경에서 선택한 결과를 찾을 수 없어요.');
  }
  return submission;
}

export const expertReviewRepository: ExpertReviewRepository = {
  async loadResult(environmentId, resultId, procedureId) {
    const submission = getDemoSubmission(environmentId, resultId);
    if (procedureId !== demoProcedureId(environmentId)) {
      throw new Error('선택한 결과와 절차가 일치하지 않아요.');
    }
    const { studentName, deviceName, sessionId, approvedVersion, submittedLabel, issue } =
      submission;
    const outcome = savedReviews.get(resultId) ?? submission.initialReview;
    const conditions = submission.conditions.map(({ evidence, ...summary }) => summary);
    const validCount = conditions.reduce((total, item) => total + item.validCount, 0);
    const totalCount = conditions.reduce((total, item) => total + item.totalCount, 0);
    return {
      id: resultId,
      procedureId,
      procedureTitle: demoReviewProcedure.title,
      sessionId,
      approvedVersion,
      studentName,
      deviceName,
      submittedLabel,
      status: outcome?.status ?? 'pending',
      comment: outcome?.comment ?? '',
      validCount,
      totalCount,
      unresolvedCount: totalCount - validCount,
      remeasurementCount: submission.conditions.reduce(
        (total, item) =>
          total + item.evidence.measurements.filter((entry) => entry.replacesMeasurementId).length,
        0,
      ),
      unit: demoReviewUnit,
      conditions,
      issue,
    };
  },
  async loadEvidence(environmentId, resultId, conditionId) {
    const submission = getDemoSubmission(environmentId, resultId);
    const selected = submission.conditions.find((item) => item.id === conditionId);
    if (!selected) throw new Error('선택한 측정 조건을 찾을 수 없어요.');
    return selected.evidence;
  },
  async submitReview(environmentId, resultId, { status, comment }) {
    const submission = getDemoSubmission(environmentId, resultId);
    if (savedReviews.has(resultId) || submission.initialReview) {
      throw new Error('이미 처리한 결과입니다.');
    }
    const outcome = { status, comment: comment.trim() };
    savedReviews.set(resultId, outcome);
    return outcome;
  },
};

export function getDemoHomeReviews(environmentId: string) {
  const results = demoSubmissions.map((submission) => {
    const id = demoResultId(environmentId, submission);
    const saved = savedReviews.get(id);
    const status: ReviewStatus = saved?.status ?? submission.initialReview?.status ?? 'pending';
    return {
      id,
      procedureId: demoProcedureId(environmentId),
      procedureTitle: demoReviewProcedure.title,
      sessionId: submission.sessionId,
      approvedVersion: submission.approvedVersion,
      studentName: submission.studentName,
      deviceName: submission.deviceName,
      status,
      summary: `${saved ? reviewStatusLabels[saved.status] : submission.homeSummary} · ${submission.approvedVersion}`,
      submittedLabel: submission.submittedLabel,
    };
  });
  const recentReviews = Array.from(savedReviews.keys())
    .reverse()
    .flatMap((id) => {
      const result = results.find((item) => item.id === id);
      if (!result) return [];
      return [
        {
          id: `${id}:review`,
          kind: 'result' as const,
          resultId: id,
          procedureId: result.procedureId,
          title: `${result.studentName} · ${result.deviceName}`,
          summary: `결과 ${reviewStatusLabels[result.status]}`,
          updatedLabel: '방금 처리',
        },
      ];
    });
  return { results, recentReviews };
}
