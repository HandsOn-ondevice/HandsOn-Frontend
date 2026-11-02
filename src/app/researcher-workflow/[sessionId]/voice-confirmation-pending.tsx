import { router, useLocalSearchParams } from 'expo-router';
import { VoiceClarificationConnectionScreen } from '@/features/researcher-workflow/screens/VoiceClarificationConnectionScreen';

export default function VoiceClarificationRoute() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  return (
    <VoiceClarificationConnectionScreen
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
