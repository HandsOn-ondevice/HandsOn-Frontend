import { useLocalSearchParams } from 'expo-router';
import { TranscriptionScreen } from '@/features/transcription/TranscriptionScreen';

export default function TranscriptionRoute() {
  const params = useLocalSearchParams<{ recordingId?: string }>();
  const recordingId = typeof params.recordingId === 'string' ? params.recordingId : '';
  return <TranscriptionScreen key={recordingId} recordingId={recordingId} />;
}
