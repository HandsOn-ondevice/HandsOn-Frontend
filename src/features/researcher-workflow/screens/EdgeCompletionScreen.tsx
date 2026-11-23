import { useCallback } from 'react';
import { Redirect, router } from 'expo-router';
import {
  ActionShelf,
  AppText,
  Button,
  CheckboxRow,
  FeedbackPanel,
  SurfaceCard,
} from '@/design-system';
import { useEntrySelection } from '@/features/entry/EntrySelectionProvider';
import { EvidenceView } from '@/features/expert-review/EvidenceView';
import { ResultConditions } from '@/features/expert-review/ResultConditions';
import {
  ReviewLayout,
  ReviewQueryFeedback,
  useReviewQuery,
} from '@/features/expert-review/ReviewLayout';
import { loadEdgeResult } from '@/features/expert-review/edgeResultRepository';
import { cleanupRequirements } from '../domain/completion';
import { selectEdgeCompletionReview } from '../domain/edge-completion-review';
import { useWorkflowSession } from '../state/useWorkflowSession';
import { recordedTime, UnavailableCompletion } from './CompletionParts';

type Stage = 'review' | 'cleanup' | 'results' | 'measurement-details';
type Resource = ReturnType<typeof useWorkflowSession>;

const titles = {
  review: '최종 측정 검토',
  cleanup: '종료와 장치 정리',
  results: '결과 요약',
  'measurement-details': '측정 상세와 근거 이력',
};

function workflowRoute(stage: Stage, sessionId: string) {
  return { pathname: `/researcher-workflow/[sessionId]/${stage}` as const, params: { sessionId } };
}

function home() {
  router.replace('/student');
}

export function EdgeCompletionScreen({
  sessionId,
  stage,
  resultId,
  conditionId,
  onReviewBack,
}: {
  sessionId: string;
  stage: Stage;
  resultId?: string;
  conditionId?: string;
  onReviewBack?: () => void;
}) {
  const resource = useWorkflowSession(sessionId);
  const { loading, error, session } = resource;
  const retryingSubmit = stage === 'results' && resource.canRetryCommand;
  const back =
    stage === 'cleanup'
      ? () => router.replace(workflowRoute('review', sessionId))
      : (onReviewBack ?? home);

  if (loading || !session || (resultId !== undefined && resultId !== sessionId)) {
    return (
      <ReviewLayout title={titles[stage]} onBack={back}>
        {loading ? (
          <AppText accessibilityLiveRegion="polite">세션 기록을 불러오고 있습니다.</AppText>
        ) : resultId !== undefined && resultId !== sessionId ? (
          <FeedbackPanel title="결과를 찾을 수 없습니다" tone="warning" />
        ) : (
          <>
            <FeedbackPanel
              title="실험 기록을 확인하지 못했어요"
              subtitle={error ?? undefined}
              tone="danger"
            />
            <Button label="다시 시도" variant="secondary" onPress={resource.refresh} />
          </>
        )}
      </ReviewLayout>
    );
  }

  if (session.phase === 'completed' && !retryingSubmit) {
    if (stage !== 'results') return <Redirect href={workflowRoute('results', sessionId)} />;
    const receipt = session.submission?.status === 'submitted' ? session.submission : null;
    const submittedResult = receipt?.resultId ?? sessionId;
    return (
      <ReviewLayout
        title="처리 결과"
        onBack={home}
        footer={<ActionShelf safeArea primary="홈으로" onPrimary={home} />}
      >
        {receipt ? (
          <>
            <FeedbackPanel
              title="결과를 제출했습니다"
              subtitle="숙련자의 최종 검토를 기다립니다."
              tone="success"
              icon="check"
            />
            <AppText>결과 ID · {receipt.resultId}</AppText>
            <AppText>제출 시각 · {recordedTime(receipt.submittedAt)}</AppText>
          </>
        ) : (
          <FeedbackPanel title="완료된 실험의 결과를 확인할 수 있어요" />
        )}
        <Button
          label={receipt ? '제출한 결과 보기' : '완료 결과 보기'}
          variant="secondary"
          onPress={() =>
            router.push({
              pathname: '/results/[resultId]',
              params: { resultId: submittedResult, sessionId },
            })
          }
        />
      </ReviewLayout>
    );
  }

  if (session.phase === 'readyToSubmit' && stage === 'review') {
    return <Redirect href={workflowRoute('results', sessionId)} />;
  }
  if (session.phase === 'awaitingCleanup' && stage === 'results') {
    return <Redirect href={workflowRoute('cleanup', sessionId)} />;
  }
  if (!retryingSubmit && session.phase !== 'awaitingCleanup' && session.phase !== 'readyToSubmit') {
    return (
      <ReviewLayout title={titles[stage]} onBack={back}>
        <UnavailableCompletion />
      </ReviewLayout>
    );
  }
  const review = session.phase === 'awaitingCleanup' ? selectEdgeCompletionReview(session) : null;
  if (stage === 'cleanup') {
    if (review && !review.allValid) return <Redirect href={workflowRoute('review', sessionId)} />;
    return <EdgeCleanup sessionId={sessionId} resource={resource} onBack={back} />;
  }

  return (
    <EdgePreview
      stage={stage}
      sessionId={sessionId}
      conditionId={conditionId}
      resource={resource}
      review={stage === 'review' ? review : null}
      onBack={back}
    />
  );
}

function EdgeCleanup({
  sessionId,
  resource,
  onBack,
}: {
  sessionId: string;
  resource: Resource;
  onBack: () => void;
}) {
  const { session, pending, errorCode, canRetryCommand, execute, retryCommand, error } = resource;
  const cleanup = session?.cleanup;
  const latest = cleanup?.attempts.at(-1);
  const released = !!cleanup?.deviceReleasedAt;
  const outputConfirmed =
    latest?.status === 'passed' &&
    (released ||
      (errorCode !== 'CLEANUP_OUTPUT_EXPIRED' && errorCode !== 'CLEANUP_OUTPUT_REQUIRED'));
  const ready = session?.phase === 'readyToSubmit';
  const nextCheck = cleanup?.checks.find(({ checked }) => !checked)?.id;
  const locked = pending || canRetryCommand;

  return (
    <ReviewLayout
      title={titles.cleanup}
      onBack={onBack}
      footer={
        canRetryCommand || ready ? (
          <ActionShelf
            safeArea
            primary={canRetryCommand ? '다시 시도' : '결과 요약 보기'}
            loading={pending}
            onPrimary={
              canRetryCommand
                ? () => void retryCommand()
                : () => router.replace(workflowRoute('results', sessionId))
            }
          />
        ) : undefined
      }
    >
      <AppText variant="heading" accessibilityRole="header">
        {titles.cleanup}
      </AppText>
      {error ? <CommandError message={error} /> : null}
      <FeedbackPanel
        title={
          outputConfirmed ? 'LED 출력 종료 응답을 받았어요' : 'LED 출력 종료 응답을 확인해 주세요'
        }
        subtitle={
          outputConfirmed ? `Edge 응답 시각 · ${recordedTime(latest?.completedAt)}` : undefined
        }
        tone={outputConfirmed ? 'success' : 'warning'}
        icon={outputConfirmed ? 'check' : 'alert'}
      />
      <AppText>LED 출력 종료 응답과 작업자가 확인한 회로 전원 차단을 각각 기록합니다.</AppText>
      {session?.dataOrigin === 'simulation' ? (
        <AppText variant="caption">Edge 장치 시뮬레이션</AppText>
      ) : null}
      {released ? null : (
        <Button
          label={outputConfirmed ? '출력 종료 응답 다시 받기' : '출력 종료 다시 시도'}
          variant="secondary"
          disabled={locked}
          onPress={() => void execute({ type: 'requestCleanup' })}
        />
      )}
      {cleanupRequirements.map(({ id, title, description, confirmed }) => {
        const check = cleanup?.checks.find((item) => item.id === id);
        const checked = check?.checked ?? false;
        return (
          <CheckboxRow
            key={id}
            title={title}
            subtitle={
              checked
                ? `${confirmed} · ${recordedTime(check?.confirmedAt ?? undefined)}`
                : description
            }
            checked={checked}
            disabled={locked || !outputConfirmed || id !== nextCheck}
            onChange={() => void execute({ type: 'setCleanupCheck', checkId: id, checked: true })}
          />
        );
      })}
      {released ? (
        <AppText variant="caption">
          제출할 때까지 앱과 Edge의 네트워크 연결을 유지해 주세요.
        </AppText>
      ) : null}
    </ReviewLayout>
  );
}

function EdgePreview({
  stage,
  sessionId,
  conditionId,
  resource,
  review,
  onBack,
}: {
  stage: Exclude<Stage, 'cleanup'>;
  sessionId: string;
  conditionId?: string;
  resource: Resource;
  review: ReturnType<typeof selectEdgeCompletionReview> | null;
  onBack: () => void;
}) {
  const { selection } = useEntrySelection();
  const procedureId = resource.session?.procedure.procedureId;
  const environmentId = selection?.environment.id;
  const token = selection?.edgeToken;
  const load = useCallback(async () => {
    if (!environmentId) throw new Error('작업 환경을 확인해 주세요.');
    return loadEdgeResult(token, environmentId, sessionId, {
      sessionId,
      procedureId,
      preview: true,
    });
  }, [environmentId, token, sessionId, procedureId]);
  const { query, retry } = useReviewQuery(load);
  const data = query.status === 'ready' ? query.data : null;
  const detail = stage === 'measurement-details';
  const showReview = () =>
    router.dismissTo(
      workflowRoute(
        resource.session?.phase === 'awaitingCleanup' ? 'review' : 'results',
        sessionId,
      ),
    );
  const condition = data?.result.conditions.find(({ id }) => id === conditionId);
  const evidence = data && condition ? data.evidenceByCondition.get(condition.id) : undefined;
  const { canRetryCommand, pending, error, execute, retryCommand } = resource;

  return (
    <ReviewLayout
      title={titles[stage]}
      onBack={detail ? showReview : onBack}
      footer={
        detail ? (
          <ActionShelf safeArea primary="전체 결과로 돌아가기" onPrimary={showReview} />
        ) : review ? (
          data && review.allValid ? (
            <ActionShelf
              safeArea
              primary="장치 정리로 이동"
              onPrimary={() => router.replace(workflowRoute('cleanup', sessionId))}
            />
          ) : undefined
        ) : (
          <ActionShelf
            safeArea
            loading={pending}
            disabled={!data && !canRetryCommand}
            primary={canRetryCommand ? '다시 시도' : '결과 제출'}
            onPrimary={
              canRetryCommand
                ? () => void retryCommand()
                : () => void execute({ type: 'submitResult' })
            }
          />
        )
      }
    >
      <AppText variant="heading" accessibilityRole="header">
        {titles[stage]}
      </AppText>
      {resource.session?.dataOrigin === 'simulation' ? (
        <AppText variant="caption">Edge 장치 시뮬레이션</AppText>
      ) : null}
      {error ? <CommandError message={error} /> : null}
      {review && !review.allValid ? (
        <FeedbackPanel
          title={
            review.firstIssue
              ? `${review.firstIssue.label} 조건 ${review.firstIssue.trialIndex}회차를 확인해 주세요`
              : '유효 측정 기록을 확인해 주세요'
          }
          subtitle="필수 회차의 유효 측정과 근거가 모두 있어야 장치 정리로 이동할 수 있습니다."
          tone="warning"
          icon="alert"
        />
      ) : null}
      {!data ? (
        <ReviewQueryFeedback
          subject={detail ? '측정 근거' : '결과'}
          loading={query.status === 'loading'}
          onRetry={retry}
        />
      ) : detail ? (
        condition && evidence ? (
          <EvidenceView
            condition={condition}
            evidence={evidence}
            unit={data.result.unit}
            omitUnavailableMetrics
          />
        ) : (
          <FeedbackPanel title="선택한 측정 조건을 찾을 수 없어요" tone="warning" />
        )
      ) : (
        <>
          <SurfaceCard title={data.result.procedureTitle}>
            <AppText>{`유효 측정 ${data.result.validCount} / ${data.result.totalCount}`}</AppText>
            <AppText variant="caption">승인 버전 · {data.result.approvedVersion}</AppText>
            {!review ? <AppText>측정 기록을 확인한 뒤 제출해 주세요.</AppText> : null}
          </SurfaceCard>
          <ResultConditions
            result={data.result}
            onOpenCondition={(nextConditionId) =>
              router.push({
                pathname: '/researcher-workflow/[sessionId]/measurement-details',
                params: { sessionId, conditionId: nextConditionId },
              })
            }
          />
        </>
      )}
    </ReviewLayout>
  );
}

function CommandError({ message }: { message: string }) {
  return (
    <FeedbackPanel
      title="Edge 요청을 완료하지 못했어요"
      subtitle={message}
      tone="danger"
      icon="alert"
    />
  );
}
