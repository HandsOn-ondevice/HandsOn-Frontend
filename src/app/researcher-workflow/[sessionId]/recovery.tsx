import { router, useLocalSearchParams } from 'expo-router';
import { RecoveryScreen } from '@/features/researcher-workflow/screens/RecoveryScreen';

export default function RecoveryRoute() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  return (
    <RecoveryScreen
      key={sessionId}
      sessionId={sessionId}
      onRemeasurement={() =>
        router.push({
          pathname: '/researcher-workflow/[sessionId]/remeasurement',
          params: { sessionId },
        })
      }
      onBack={() =>
        router.dismissTo({
          pathname: '/researcher-workflow/[sessionId]/execution',
          params: { sessionId },
        })
      }
    />
  );
}
