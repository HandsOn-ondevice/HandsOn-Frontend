import { Redirect, useRouter } from 'expo-router';
import { useEntrySelection } from '@/features/entry/EntrySelectionProvider';
import { usePreparationHandoff } from '@/features/procedures/PreparationHandoffProvider';
import { PreparationHandoffPreview } from '@/dev/PreparationHandoffPreview';

export default function PreparationBoundary() {
  const router = useRouter();
  const { selection } = useEntrySelection();
  const { request } = usePreparationHandoff();
  if (selection?.role !== 'student') return <Redirect href="/" />;
  if (
    !(__DEV__ || process.env.EXPO_PUBLIC_HANDSON_MAESTRO === '1') ||
    !request ||
    request.environment.id !== selection.environment.id
  ) {
    return <Redirect href="/procedures" />;
  }

  return (
    <PreparationHandoffPreview
      request={request}
      onBack={() => {
        if (router.canGoBack()) router.back();
        else router.replace('/procedures');
      }}
    />
  );
}
