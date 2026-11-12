import { useEffect, useState } from 'react';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import {
  AppBar,
  AppText,
  Button,
  FeedbackPanel,
  Screen,
  StatusBadge,
  StatusBar,
  SurfaceCard,
} from '@/design-system';
import { useEntrySelection } from '@/features/entry/EntrySelectionProvider';
import {
  procedureDraftRepository,
  type ProcedureDraft,
} from '@/features/procedure-draft/procedureDraftRepository';

export default function DraftReviewRoute() {
  const { draftId, stepId } = useLocalSearchParams<{ draftId: string; stepId?: string }>();
  const router = useRouter();
  const { selection } = useEntrySelection();
  if (selection?.role !== 'expert') return <Redirect href="/" />;
  if (typeof draftId !== 'string' || !draftId) return <Redirect href="/expert" />;

  return (
    <DraftReviewContext
      key={JSON.stringify([selection.environment.id, draftId, stepId])}
      environmentId={selection.environment.id}
      draftId={draftId}
      stepId={typeof stepId === 'string' ? stepId : undefined}
      onBack={() => {
        if (router.canGoBack()) router.back();
        else router.replace({ pathname: '/expert/drafts/[draftId]', params: { draftId } });
      }}
    />
  );
}

type ReviewLookup =
  { status: 'loading' | 'error' } | { status: 'loaded'; draft: ProcedureDraft | null };

// E05 owns editing review criteria. This screen resolves the draft and selected step for it.
function DraftReviewContext({
  environmentId,
  draftId,
  stepId,
  onBack,
}: {
  environmentId: string;
  draftId: string;
  stepId?: string;
  onBack: () => void;
}) {
  const [lookup, setLookup] = useState<ReviewLookup>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    void procedureDraftRepository.load(environmentId, draftId).then(
      (draft) => {
        if (active) setLookup({ status: 'loaded', draft });
      },
      () => {
        if (active) setLookup({ status: 'error' });
      },
    );
    return () => {
      active = false;
    };
  }, [attempt, draftId, environmentId]);

  const draft = lookup.status === 'loaded' && lookup.draft?.savedAt ? lookup.draft : null;
  const stepIndex = draft?.steps.findIndex((step) => step.id === stepId) ?? -1;
  const step = draft?.steps[stepIndex];

  return (
    <Screen scroll>
      <StatusBar />
      <AppBar title="기준값 검토" mode="back" onBack={onBack} />
      {lookup.status === 'loading' ? (
        <FeedbackPanel title="선택한 단계를 불러오는 중이에요." />
      ) : lookup.status === 'error' ? (
        <>
          <FeedbackPanel title="초안을 불러오지 못했어요." tone="warning" icon="alert" />
          <Button
            label="다시 시도"
            variant="secondary"
            onPress={() => {
              setLookup({ status: 'loading' });
              setAttempt((current) => current + 1);
            }}
          />
        </>
      ) : draft && step ? (
        <>
          <AppText variant="heading" accessibilityRole="header">
            {draft.title}
          </AppText>
          <SurfaceCard title={`${stepIndex + 1}. ${step.title}`} subtitle={step.description}>
            <StatusBadge label="승인 전 초안" tone="warning" />
          </SurfaceCard>
          <FeedbackPanel title="기준값과 오류 규칙 편집을 준비하고 있어요." />
        </>
      ) : (
        <FeedbackPanel
          title="선택한 단계를 찾을 수 없어요."
          subtitle="초안으로 돌아가 단계를 다시 선택해 주세요."
          tone="warning"
          icon="alert"
        />
      )}
    </Screen>
  );
}
