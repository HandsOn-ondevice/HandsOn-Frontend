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
import { useProcedureDraft } from '@/features/procedure-draft/useProcedureDraft';

export default function DraftApprovalRoute() {
  const { draftId, stepId } = useLocalSearchParams<{ draftId: string; stepId?: string }>();
  const router = useRouter();
  const { selection } = useEntrySelection();
  if (selection?.role !== 'expert') return <Redirect href="/" />;
  if (typeof draftId !== 'string' || !draftId) return <Redirect href="/expert" />;

  return (
    <DraftApprovalContext
      key={JSON.stringify([selection.environment.id, draftId, stepId])}
      draftId={draftId}
      stepId={stepId}
      environmentId={selection.environment.id}
      onBack={() => {
        if (router.canGoBack()) router.back();
        else if (stepId) {
          router.replace({
            pathname: '/expert/drafts/[draftId]/review',
            params: { draftId, stepId },
          });
        } else {
          router.replace({ pathname: '/expert/drafts/[draftId]', params: { draftId } });
        }
      }}
    />
  );
}

function DraftApprovalContext({
  draftId,
  stepId,
  environmentId,
  onBack,
}: {
  draftId: string;
  stepId?: string;
  environmentId: string;
  onBack: () => void;
}) {
  const { state, retryLoad } = useProcedureDraft(environmentId, draftId);
  const draft = state.status === 'ready' && state.draft.savedAt ? state.draft : null;
  const step = draft?.steps.find(({ id }) => id === stepId);

  return (
    <Screen scroll>
      <StatusBar />
      <AppBar title="승인 검토" mode="back" onBack={onBack} />
      {draft && step?.criteria ? (
        <>
          <AppText variant="heading" accessibilityRole="header">
            {draft.title}
          </AppText>
          <FeedbackPanel
            title="기준을 저장했습니다"
            subtitle="최종 승인과 배포 기능은 준비 중이에요."
            tone="success"
            icon="check"
          />
          <SurfaceCard
            title={step.title}
            subtitle={step.criteria.equipmentVerified ? '실장비 확인 기록됨' : '실장비 확인 필요'}
          >
            <StatusBadge label="승인 전 초안" tone="warning" />
          </SurfaceCard>
          {draft.pendingItems.length ? (
            <SurfaceCard title="필수 미확정 항목" tone="subtle">
              {draft.pendingItems.map(({ id, label }) => (
                <AppText key={id}>{label}</AppText>
              ))}
            </SurfaceCard>
          ) : null}
        </>
      ) : state.status === 'loading' ? (
        <FeedbackPanel title="저장된 초안을 불러오는 중이에요." />
      ) : state.status === 'error' ? (
        <>
          <FeedbackPanel title="초안을 불러오지 못했어요." tone="warning" icon="alert" />
          <Button label="다시 시도" variant="secondary" onPress={retryLoad} />
        </>
      ) : (
        <FeedbackPanel title="저장된 기준을 찾을 수 없어요." tone="warning" icon="alert" />
      )}
    </Screen>
  );
}
