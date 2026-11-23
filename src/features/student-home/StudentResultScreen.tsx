import { useCallback } from 'react';
import { ActionShelf, AppText, StatusBadge, SurfaceCard } from '@/design-system';
import { EvidenceView } from '@/features/expert-review/EvidenceView';
import { ResultConditions } from '@/features/expert-review/ResultConditions';
import {
  ReviewLayout,
  ReviewQueryFeedback,
  useReviewQuery,
} from '@/features/expert-review/ReviewLayout';
import { loadEdgeResult } from '@/features/expert-review/edgeResultRepository';
import { reviewStatusLabels, type ReviewResult } from '@/features/expert-review/reviewData';

type ResultIdentity = Pick<ReviewResult, 'id' | 'sessionId'>;

type StudentResultProps = {
  edgeToken?: string;
  environmentId: string;
  resultId: string;
  sessionId: string;
  onBack: () => void;
} & (
  | {
      conditionId?: undefined;
      onOpenCondition: (conditionId: string, result: ResultIdentity) => void;
    }
  | { conditionId: string; onOpenCondition?: undefined }
);

export function StudentResultScreen({
  edgeToken,
  environmentId,
  resultId,
  sessionId,
  conditionId,
  onBack,
  onOpenCondition,
}: StudentResultProps) {
  const load = useCallback(async () => {
    const { result, evidenceByCondition } = await loadEdgeResult(
      edgeToken,
      environmentId,
      resultId,
      {
        sessionId,
      },
    );
    if (!conditionId) return { kind: 'summary', result } as const;
    const condition = result.conditions.find(({ id }) => id === conditionId);
    const evidence = evidenceByCondition.get(conditionId);
    if (!condition || !evidence) throw new Error('선택한 측정 조건을 찾을 수 없어요.');
    return { kind: 'evidence', result, condition, evidence } as const;
  }, [edgeToken, environmentId, resultId, sessionId, conditionId]);
  const { query, retry } = useReviewQuery(load);
  const data = query.status === 'ready' ? query.data : undefined;
  const result = data?.result;

  return (
    <ReviewLayout
      title={conditionId ? '측정 상세와 근거 이력' : '실험 결과'}
      onBack={onBack}
      result={result}
      footer={
        conditionId ? <ActionShelf primary="전체 결과로 돌아가기" onPrimary={onBack} /> : undefined
      }
    >
      {data?.kind === 'summary' && onOpenCondition ? (
        <>
          <SurfaceCard title="실험 결과 · 읽기 전용">
            <AppText variant="heading" accessibilityRole="header">
              {data.result.procedureTitle}
            </AppText>
            <AppText>{`유효 측정 ${data.result.validCount} / ${data.result.totalCount}`}</AppText>
            <StatusBadge
              label={reviewStatusLabels[data.result.status]}
              tone={data.result.status === 'reviewed' ? 'success' : 'warning'}
            />
          </SurfaceCard>
          <ResultConditions
            result={data.result}
            onOpenCondition={(nextConditionId) => onOpenCondition(nextConditionId, data.result)}
          />
        </>
      ) : data?.kind === 'evidence' ? (
        <EvidenceView
          condition={data.condition}
          evidence={data.evidence}
          unit={data.result.unit}
          omitUnavailableMetrics
        />
      ) : (
        <ReviewQueryFeedback
          subject={conditionId ? '측정 근거' : '결과'}
          loading={query.status === 'loading'}
          onRetry={retry}
        />
      )}
    </ReviewLayout>
  );
}
