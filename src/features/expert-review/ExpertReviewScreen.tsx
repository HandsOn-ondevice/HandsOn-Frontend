import { useCallback, useRef, useState } from 'react';
import { Keyboard, Pressable, StyleSheet, View } from 'react-native';
import {
  ActionShelf,
  AppText,
  Button,
  FeedbackPanel,
  MetricTile,
  ResultChart,
  StatusBadge,
  SurfaceCard,
  TextField,
  colors,
  spacing,
} from '@/design-system';
import { ReviewLayout, ReviewQueryFeedback, useReviewQuery } from './ReviewLayout';
import {
  expertReviewRepository,
  type ExpertReviewRepository,
  type ReviewOutcome,
  type ReviewResult,
} from './reviewData';

type Decision = ReviewOutcome['status'];
type SubmitState = { status: 'idle' } | { status: 'sending' | 'failed'; decision: Decision };

type ScreenProps = {
  environmentId: string;
  resultId: string;
  procedureId: string;
  onBack: () => void;
  onOpenEvidence: (conditionId: string) => void;
  repository?: ExpertReviewRepository;
};

const reviewTitle = '연구생 결과 검토';

export function ExpertReviewScreen({
  environmentId,
  resultId,
  procedureId,
  onBack,
  onOpenEvidence,
  repository = expertReviewRepository,
}: ScreenProps) {
  const load = useCallback(
    () => repository.loadResult(environmentId, resultId, procedureId),
    [repository, environmentId, resultId, procedureId],
  );
  const { query, retry } = useReviewQuery(load);
  return query.status === 'ready' ? (
    <ResultReview
      result={query.data}
      onBack={onBack}
      onOpenEvidence={onOpenEvidence}
      submit={(outcome) => repository.submitReview(environmentId, resultId, outcome)}
    />
  ) : (
    <ReviewLayout title={reviewTitle} onBack={onBack}>
      <ReviewQueryFeedback subject="결과" loading={query.status === 'loading'} onRetry={retry} />
    </ReviewLayout>
  );
}

function ResultReview({
  result,
  onBack,
  onOpenEvidence,
  submit,
}: {
  result: ReviewResult;
  onBack: () => void;
  onOpenEvidence: (conditionId: string) => void;
  submit: (outcome: ReviewOutcome) => Promise<ReviewOutcome>;
}) {
  const [comment, setComment] = useState('');
  const [outcome, setOutcome] = useState<ReviewOutcome>();
  const [showOutcome, setShowOutcome] = useState(false);
  const [submission, setSubmission] = useState<SubmitState>({ status: 'idle' });
  const inFlight = useRef(false);
  const status = outcome?.status ?? result.status;
  const sending = submission.status === 'sending';

  async function send(decision: Decision) {
    if (status !== 'pending' || inFlight.current) return;
    inFlight.current = true;
    Keyboard.dismiss();
    setSubmission({ status: 'sending', decision });
    try {
      const saved = await submit({ status: decision, comment: comment.trim() });
      setOutcome(saved);
      setShowOutcome(true);
      setSubmission({ status: 'idle' });
    } catch {
      setSubmission({ status: 'failed', decision });
    } finally {
      inFlight.current = false;
    }
  }

  if (showOutcome && outcome) {
    const reviewed = outcome.status === 'reviewed';
    const returnFromOutcome = reviewed ? onBack : () => setShowOutcome(false);
    return (
      <ReviewLayout
        title="처리 결과"
        onBack={returnFromOutcome}
        result={result}
        footer={
          <ActionShelf
            primary={reviewed ? '숙련자 홈으로' : '검토 화면으로 돌아가기'}
            onPrimary={returnFromOutcome}
          />
        }
      >
        <FeedbackPanel
          title={reviewed ? '결과 검토를 완료했습니다' : '재측정 요청을 기록했습니다'}
          subtitle={
            reviewed
              ? `${outcome.comment ? '검토 의견을 결과와 함께 기록했습니다.' : '검토 결과를 기록했습니다.'}\n최종 데이터 사용 여부는 숙련자가 결정합니다.`
              : outcome.comment
                ? '검토 의견과 함께 재측정 요청을 기록했습니다.'
                : '이 결과를 재측정이 필요한 상태로 기록했습니다.'
          }
          tone={reviewed ? 'success' : 'warning'}
          icon={reviewed ? 'check' : 'alert'}
        />
      </ReviewLayout>
    );
  }

  const highlightedIndex = result.conditions.findIndex(
    ({ id }) => id === result.issue?.conditionId,
  );
  const increasing =
    result.conditions.length > 1 &&
    result.conditions.every(({ value }, index, conditions) => {
      const previous = conditions[index - 1]?.value;
      return value !== null && (index === 0 || (previous != null && previous < value));
    });

  return (
    <ReviewLayout
      title={reviewTitle}
      onBack={onBack}
      result={result}
      footer={
        status === 'pending' ? (
          <>
            {submission.status === 'failed' ? (
              <View style={styles.submitError}>
                <FeedbackPanel
                  title="검토 결과를 저장하지 못했어요."
                  subtitle="입력한 의견을 유지했어요. 다시 시도해 주세요."
                  tone="danger"
                  icon="alert"
                />
                <Button
                  label="저장 다시 시도"
                  variant="secondary"
                  icon="retry"
                  onPress={() => void send(submission.decision)}
                />
              </View>
            ) : null}
            <ActionShelf
              primary="검토 완료"
              secondary="재측정 요청"
              onPrimary={() => void send('reviewed')}
              onSecondary={() => void send('remeasurementRequested')}
              disabled={sending}
              secondaryDisabled={sending}
              loading={sending && submission.decision === 'reviewed'}
              secondaryLoading={sending && submission.decision === 'remeasurementRequested'}
            />
          </>
        ) : undefined
      }
    >
      <View style={styles.intro}>
        <AppText variant="caption" color={colors.text.secondary}>
          {result.studentName} · {result.deviceName} · {result.approvedVersion}
        </AppText>
        <AppText variant="caption" color={colors.text.secondary}>
          {result.procedureTitle}
        </AppText>
        <AppText variant="heading" accessibilityRole="header" style={styles.heading}>
          {result.issue ? '보류와 재측정\n근거를 확인하세요' : '측정 결과와\n근거를 확인하세요'}
        </AppText>
        <StatusBadge
          label={
            status === 'pending' ? '검토 전' : status === 'reviewed' ? '검토 완료' : '재측정 요청'
          }
          tone={status === 'reviewed' ? 'success' : 'warning'}
          style={styles.badge}
        />
      </View>
      <View style={styles.metrics}>
        <MetricTile
          title="유효 측정"
          value={`${result.validCount} / ${result.totalCount}`}
          tone="success"
          style={styles.metric}
        />
        <MetricTile
          title="미해결"
          value={String(result.unresolvedCount)}
          meta="건"
          tone={result.unresolvedCount > 0 ? 'warning' : 'success'}
          style={styles.metric}
        />
      </View>
      {result.issue ? <IssueSummary issue={result.issue} onOpenEvidence={onOpenEvidence} /> : null}
      <ResultChart
        title="조건별 조도 평균"
        meta={increasing ? '증가 추세' : '조건을 눌러 상세 보기'}
        items={result.conditions}
        unit={result.unit}
        highlightedIndex={highlightedIndex}
        onItemPress={(index) => onOpenEvidence(result.conditions[index].id)}
      />
      {status === 'pending' ? (
        <TextField
          label="검토 의견"
          multiline
          value={comment}
          onChange={setComment}
          placeholder="예: 센서 복구 과정과 재측정값을 확인함"
          disabled={sending}
        />
      ) : (
        <SurfaceCard title="검토 의견">
          <AppText>{(outcome?.comment ?? result.comment) || '등록된 검토 의견이 없어요.'}</AppText>
        </SurfaceCard>
      )}
    </ReviewLayout>
  );
}

function IssueSummary({
  issue,
  onOpenEvidence,
}: {
  issue: NonNullable<ReviewResult['issue']>;
  onOpenEvidence: (conditionId: string) => void;
}) {
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${issue.title}, ${issue.subtitle}`}
        onPress={() => onOpenEvidence(issue.conditionId)}
        style={({ pressed }) => pressed && styles.pressed}
      >
        <SurfaceCard style={styles.issueCard}>
          <AppText variant="label">{issue.title}</AppText>
          <AppText color={colors.text.secondary}>{issue.subtitle}</AppText>
        </SurfaceCard>
      </Pressable>
      <AppText color={colors.text.secondary}>{issue.description}</AppText>
    </>
  );
}

const styles = StyleSheet.create({
  intro: { gap: spacing[4] },
  heading: { marginTop: spacing[8], marginBottom: spacing[8] },
  badge: { alignSelf: 'flex-start' },
  metrics: { flexDirection: 'row', gap: spacing[20] },
  metric: { flex: 1, minWidth: 0, minHeight: 115 },
  issueCard: { gap: spacing[6] },
  pressed: { opacity: 0.8 },
  submitError: {
    gap: spacing[8],
    paddingTop: spacing[12],
    paddingHorizontal: spacing[24],
    backgroundColor: colors.surface.card,
  },
});
