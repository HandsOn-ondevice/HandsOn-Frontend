import { useCallback } from 'react';
import { ActionShelf } from '@/design-system';
import { EvidenceView } from './EvidenceView';
import { ReviewLayout, ReviewQueryFeedback, useReviewQuery } from './ReviewLayout';
import { expertReviewRepository, type ExpertReviewRepository } from './reviewData';

export function ExpertEvidenceScreen({
  environmentId,
  resultId,
  procedureId,
  conditionId,
  onBack,
  repository = expertReviewRepository,
}: {
  environmentId: string;
  resultId: string;
  procedureId: string;
  conditionId: string;
  onBack: () => void;
  repository?: ExpertReviewRepository;
}) {
  const load = useCallback(async () => {
    const result = await repository.loadResult(environmentId, resultId, procedureId);
    const condition = result.conditions.find(({ id }) => id === conditionId);
    if (!condition) throw new Error('선택한 측정 조건을 찾을 수 없어요.');
    const evidence = await repository.loadEvidence(environmentId, resultId, conditionId);
    return { result, condition, evidence };
  }, [repository, environmentId, resultId, procedureId, conditionId]);
  const { query, retry } = useReviewQuery(load);

  return (
    <ReviewLayout
      title="측정 상세와 근거 이력"
      onBack={onBack}
      result={query.status === 'ready' ? query.data.result : undefined}
      footer={<ActionShelf primary="결과 검토로 돌아가기" onPrimary={onBack} />}
    >
      {query.status === 'ready' ? (
        <EvidenceView
          condition={query.data.condition}
          evidence={query.data.evidence}
          unit={query.data.result.unit}
        />
      ) : (
        <ReviewQueryFeedback
          subject="측정 근거"
          loading={query.status === 'loading'}
          onRetry={retry}
        />
      )}
    </ReviewLayout>
  );
}
