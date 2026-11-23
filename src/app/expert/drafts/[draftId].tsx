import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEntrySelection } from '@/features/entry/EntrySelectionProvider';
import { ProcedureDraftScreen } from '@/features/procedure-draft/ProcedureDraftScreen';

export default function ProcedureDraftRoute() {
  const { draftId } = useLocalSearchParams<{ draftId: string }>();
  const router = useRouter();
  const { selection } = useEntrySelection();
  if (selection?.role !== 'expert') return <Redirect href="/" />;
  if (typeof draftId !== 'string' || !draftId) return <Redirect href="/expert" />;

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
    />
  );
}
