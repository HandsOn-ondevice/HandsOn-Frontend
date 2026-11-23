import { router, useLocalSearchParams } from 'expo-router';
import { VoiceClarificationScreen } from '@/features/researcher-workflow/screens/VoiceClarificationScreen';

export default function VoiceClarificationRoute() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  return (
    <VoiceClarificationScreen
      key={sessionId}
      sessionId={sessionId}
      onBack={() =>
        router.dismissTo({
          pathname: '/researcher-workflow/[sessionId]/execution',
          params: { sessionId },
        })
      }
    />
  );
}
