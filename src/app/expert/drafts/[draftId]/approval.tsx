import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Redirect,
  useFocusEffect,
  useLocalSearchParams,
  usePreventRemove,
  useRouter,
} from 'expo-router';
import { AppBar, Button, FeedbackPanel, Screen, StatusBar } from '@/design-system';
import { useEntrySelection } from '@/features/entry/EntrySelectionProvider';
import { EdgeApiError } from '@/lib/edgeApi';
import { ProcedureReleasePreview } from '@/features/procedure-release/ProcedureReleasePreview';
import {
  ProcedureReleaseResult,
  ProcedureReleaseView,
} from '@/features/procedure-release/ProcedureReleaseView';
import {
  getProcedureReleaseRepository,
  ProcedureReleaseRejected,
  type ProcedureReleaseReceipt,
} from '@/features/procedure-release/procedureReleaseRepository';

type Review = NonNullable<
  Awaited<ReturnType<ReturnType<typeof getProcedureReleaseRepository>['load']>>
>;

type ReviewState =
  { status: 'loading' | 'error' | 'missing' } | { status: 'ready'; review: Review };

export default function DraftApprovalRoute() {
  const { draftId, stepId } = useLocalSearchParams<{ draftId: string; stepId?: string }>();
  const router = useRouter();
  const { selection } = useEntrySelection();
  if (selection?.role !== 'expert') return <Redirect href="/" />;
  if (typeof draftId !== 'string' || !draftId) return <Redirect href="/expert" />;

  const editRoute = { pathname: '/expert/drafts/[draftId]' as const, params: { draftId } };
  const reviewedStepId = typeof stepId === 'string' ? stepId : undefined;
  const environmentId = selection.environment.id;

  return (
    <DraftApprovalContext
      key={JSON.stringify([environmentId, draftId, reviewedStepId])}
      draftId={draftId}
      stepId={reviewedStepId}
      environmentId={environmentId}
      edgeToken={selection.edgeToken}
      onBack={() => {
        if (router.canGoBack()) router.back();
        else if (reviewedStepId) {
          router.replace({
            pathname: '/expert/drafts/[draftId]/review',
            params: { draftId, stepId: reviewedStepId },
          });
        } else router.replace(editRoute);
      }}
      onEdit={() => router.dismissTo(editRoute)}
      onHome={() => router.dismissTo('/expert')}
    />
  );
}

function DraftApprovalContext({
  draftId,
  stepId,
  environmentId,
  edgeToken,
  onBack,
  onEdit,
  onHome,
}: {
  draftId: string;
  stepId?: string;
  environmentId: string;
  edgeToken?: string;
  onBack: () => void;
  onEdit: () => void;
  onHome: () => void;
}) {
  const repository = useMemo(() => getProcedureReleaseRepository(edgeToken), [edgeToken]);
  const [state, setState] = useState<ReviewState>({ status: 'loading' });
  const [equipmentConfirmed, setEquipmentConfirmed] = useState(false);
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const [reason, setReason] = useState('');
  const [reasonLocked, setReasonLocked] = useState(false);
  const [preview, setPreview] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [published, setPublished] = useState<ProcedureReleaseReceipt | null>(null);
  const [leaving, setLeaving] = useState(false);
  const mounted = useRef(false);
  const inFlight = useRef(false);
  const focused = useRef(false);
  const loadRequest = useRef(0);
  const lastReview = useRef<string | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const loadReview = useCallback(async () => {
    if (!focused.current) return;
    const request = ++loadRequest.current;
    setState({ status: 'loading' });
    try {
      const review = await repository.load(environmentId, draftId);
      if (loadRequest.current !== request) return;
      const snapshot = review ? JSON.stringify(review) : null;
      if (lastReview.current !== snapshot) {
        lastReview.current = snapshot;
        setEquipmentConfirmed(false);
        setReviewConfirmed(false);
      }
      setState(review ? { status: 'ready', review } : { status: 'missing' });
      if (review?.published) setPublished(review.published);
    } catch {
      if (loadRequest.current === request) setState({ status: 'error' });
    }
  }, [draftId, environmentId, repository]);

  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      void loadReview();
      return () => {
        focused.current = false;
        loadRequest.current += 1;
      };
    }, [loadReview]),
  );

  const allowRemoval = usePreventRemove(
    !leaving && (preview || submitting || published !== null),
    () => {
      if (inFlight.current) return;
      if (preview) setPreview(false);
      else if (published) goHome();
    },
  );

  function goHome() {
    setLeaving(true);
    allowRemoval();
    onHome();
  }

  async function approve() {
    if (
      inFlight.current ||
      state.status !== 'ready' ||
      state.review.blockers.length > 0 ||
      !equipmentConfirmed ||
      !reviewConfirmed ||
      (state.review.draft.edge && !reason.trim())
    ) {
      return;
    }

    inFlight.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const procedure = await repository.publish({
        environmentId,
        draft: state.review.draft,
        equipmentConfirmed,
        reviewConfirmed,
        reason,
      });
      if (mounted.current) setPublished(procedure);
    } catch (failure) {
      if (!mounted.current) return;
      if (failure instanceof ProcedureReleaseRejected) {
        setError(failure.message);
        setReasonLocked(false);
        setEquipmentConfirmed(false);
        setReviewConfirmed(false);
        void loadReview();
      } else {
        if (
          failure instanceof EdgeApiError &&
          (failure.kind === 'network' ||
            failure.kind === 'invalid-response' ||
            (failure.status ?? 0) >= 500)
        ) {
          setReasonLocked(true);
        }
        setError('승인·배포 요청에 실패했어요. 다시 시도해 주세요.');
      }
    } finally {
      inFlight.current = false;
      if (mounted.current) setSubmitting(false);
    }
  }

  if (published) {
    return (
      <ProcedureReleaseResult
        procedure={published}
        edge={state.status === 'ready' && Boolean(state.review.draft.edge)}
        onHome={goHome}
      />
    );
  }

  if (state.status === 'ready') {
    const { draft, blockers, proposedVersion, approverName } = state.review;
    if (preview) {
      return (
        <ProcedureReleasePreview
          draft={draft}
          proposedVersion={proposedVersion}
          onBack={() => setPreview(false)}
        />
      );
    }

    const reviewedStep = stepId ? draft.steps.find(({ id }) => id === stepId) : undefined;
    return (
      <ProcedureReleaseView
        draft={draft}
        blockers={blockers}
        proposedVersion={proposedVersion}
        approverName={approverName}
        reviewConfirmed={reviewConfirmed}
        equipmentConfirmed={equipmentConfirmed}
        reason={reason}
        reasonLocked={reasonLocked}
        submitting={submitting}
        error={error}
        reviewedStep={reviewedStep?.criteria ? reviewedStep : undefined}
        onEquipmentChange={setEquipmentConfirmed}
        onReasonChange={setReason}
        onReviewChange={setReviewConfirmed}
        onApprove={() => void approve()}
        onBack={onBack}
        onEdit={onEdit}
        onPreview={() => setPreview(true)}
      />
    );
  }

  return (
    <Screen scroll>
      <StatusBar />
      <AppBar title="최종 승인과 버전 배포" mode="back" onBack={onBack} />
      {state.status === 'loading' ? (
        <FeedbackPanel title="저장된 초안을 불러오는 중이에요." />
      ) : state.status === 'error' ? (
        <>
          <FeedbackPanel title="승인 정보를 불러오지 못했어요." tone="warning" icon="alert" />
          <Button label="다시 시도" variant="secondary" onPress={() => void loadReview()} />
        </>
      ) : (
        <>
          <FeedbackPanel title="저장된 초안을 찾을 수 없어요." tone="warning" icon="alert" />
          <Button label="편집으로 돌아가기" variant="secondary" onPress={onEdit} />
        </>
      )}
    </Screen>
  );
}
