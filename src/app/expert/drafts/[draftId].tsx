import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEntrySelection } from '@/features/entry/EntrySelectionProvider';
import { ProcedureDraftScreen } from '@/features/procedure-draft/ProcedureDraftScreen';
import { getProcedureDraftRepository } from '@/features/procedure-draft/procedureDraftRepository';

export default function ProcedureDraftRoute() {
  const { draftId } = useLocalSearchParams<{ draftId: string }>();
  const router = useRouter();
  const { selection } = useEntrySelection();
  if (selection?.role !== 'expert') return <Redirect href="/" />;
  if (typeof draftId !== 'string' || !draftId) return <Redirect href="/expert" />;
  const environmentId = selection.environment.id;

  return (
    <ProcedureDraftScreen
      key={JSON.stringify([environmentId, draftId])}
      environmentId={environmentId}
      draftId={draftId}
      repository={getProcedureDraftRepository(selection.edgeToken)}
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
