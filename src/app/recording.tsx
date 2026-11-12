import { Redirect } from 'expo-router';
import { useEntrySelection } from '@/features/entry/EntrySelectionProvider';
import { RecordingScreen } from '@/features/recording/RecordingScreen';

export default function RecordingRoute() {
  const { selection } = useEntrySelection();
  if (selection?.role !== 'expert') return <Redirect href="/" />;
  return <RecordingScreen environment={selection.environment} />;
}
