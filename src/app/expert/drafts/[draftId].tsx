import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEntrySelection } from '@/features/entry/EntrySelectionProvider';
import { ProcedureDraftScreen } from '@/features/procedure-draft/ProcedureDraftScreen';
import { ExpertTaskScreen } from '@/features/expert-home/ExpertTaskScreen';
import { isEdgeDataEnabled } from '@/lib/edgeApi';

export default function ProcedureDraftRoute() {
  const { draftId } = useLocalSearchParams<{ draftId: string }>();
  const router = useRouter();
  const { selection } = useEntrySelection();
  if (selection?.role !== 'expert') return <Redirect href="/" />;
  if (typeof draftId !== 'string' || !draftId) return <Redirect href="/expert" />;
  if (isEdgeDataEnabled()) return <ExpertTaskScreen kind="draft" />;

  return (
    <ProcedureDraftScreen
      key={JSON.stringify([selection.environment.id, draftId])}
      environmentId={selection.environment.id}
      draftId={draftId}
      onClose={() => {
        if (router.canGoBack()) router.back();
        else router.replace('/expert');
      }}
      onReview={(stepId) =>
        router.push({ pathname: '/expert/drafts/[draftId]/review', params: { draftId, stepId } })
      }
      onApproval={() =>
        router.push({ pathname: '/expert/drafts/[draftId]/approval', params: { draftId } })
      }
    />
  );
}
