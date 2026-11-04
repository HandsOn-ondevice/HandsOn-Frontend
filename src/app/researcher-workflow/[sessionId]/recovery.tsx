import { router, useLocalSearchParams } from 'expo-router';
import { RecoveryScreen } from '@/features/researcher-workflow/screens/RecoveryScreen';

export default function RecoveryRoute() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  return (
    <RecoveryScreen
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
