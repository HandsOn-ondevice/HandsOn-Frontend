import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { AppBar, Button, FeedbackPanel, Screen, StatusBar } from '@/design-system';
import { useEntrySelection } from '@/features/entry/EntrySelectionProvider';
import {
  StepCriteriaEditor,
  stepCriteriaTitle,
} from '@/features/procedure-draft/StepCriteriaEditor';
import { useProcedureDraft } from '@/features/procedure-draft/useProcedureDraft';

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
      stepId={stepId}
      onSaved={(savedStepId) =>
        router.push({
          pathname: '/expert/drafts/[draftId]/approval',
          params: { draftId, stepId: savedStepId },
        })
      }
      onBack={() => {
        if (router.canGoBack()) router.back();
        else router.replace({ pathname: '/expert/drafts/[draftId]', params: { draftId } });
      }}
    />
  );
}

function DraftReviewContext({
  environmentId,
  draftId,
  stepId,
  onSaved,
  onBack,
}: {
  environmentId: string;
  draftId: string;
  stepId?: string;
  onSaved: (stepId: string) => void;
  onBack: () => void;
}) {
  const { state, retryLoad } = useProcedureDraft(environmentId, draftId);
  const draft = state.status === 'ready' && state.draft.savedAt ? state.draft : null;
  const stepIndex = draft?.steps.findIndex((step) => step.id === stepId) ?? -1;
  const step = draft?.steps[stepIndex];

  if (draft && step) {
    return (
      <StepCriteriaEditor
        draft={draft}
        step={step}
        stepNumber={stepIndex + 1}
        environmentId={environmentId}
        onBack={onBack}
        onSaved={() => onSaved(step.id)}
      />
    );
  }

  return (
    <Screen scroll>
      <StatusBar />
      <AppBar title={stepCriteriaTitle} mode="back" onBack={onBack} />
      {state.status === 'loading' ? (
        <FeedbackPanel title="선택한 단계를 불러오는 중이에요." />
      ) : state.status === 'error' ? (
        <>
          <FeedbackPanel title="초안을 불러오지 못했어요." tone="warning" icon="alert" />
          <Button label="다시 시도" variant="secondary" onPress={retryLoad} />
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
