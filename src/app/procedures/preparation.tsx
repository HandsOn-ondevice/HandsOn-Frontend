import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEntrySelection } from '@/features/entry/EntrySelectionProvider';
import { usePreparationHandoff } from '@/features/procedures/PreparationHandoffProvider';
import { EdgePreparationScreen } from '@/features/researcher-workflow/screens/EdgePreparationScreen';
import { PreparationHandoffPreview } from '@/dev/PreparationHandoffPreview';

export default function PreparationBoundary() {
  const router = useRouter();
  const { selection, edge } = useEntrySelection();
  const { sessionId } = useLocalSearchParams<{ sessionId?: string | string[] }>();
  const { request } = usePreparationHandoff();
  const onBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/procedures');
  };

  if (selection?.role !== 'student') return <Redirect href="/" />;
  if (edge) {
    if (typeof sessionId !== 'string' || !sessionId.trim()) {
      return <Redirect href="/procedures" />;
    }
    return (
      <EdgePreparationScreen key={sessionId} edge={edge} sessionId={sessionId} onBack={onBack} />
    );
  }
  if (
    !(__DEV__ || process.env.EXPO_PUBLIC_HANDSON_MAESTRO === '1') ||
    !request ||
    request.environment.id !== selection.environment.id
  ) {
    return <Redirect href="/procedures" />;
  }

  return <PreparationHandoffPreview request={request} onBack={onBack} />;
}
