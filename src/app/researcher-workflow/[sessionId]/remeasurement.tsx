import { router, useLocalSearchParams } from 'expo-router';
import { RemeasurementScreen } from '@/features/researcher-workflow/screens/RemeasurementScreen';

export default function RemeasurementRoute() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  return (
    <RemeasurementScreen
      key={sessionId}
      sessionId={sessionId}
      onBack={() =>
        router.dismissTo({
          pathname: '/researcher-workflow/[sessionId]/recovery',
          params: { sessionId },
        })
      }
      onExecution={() =>
        router.dismissTo({
          pathname: '/researcher-workflow/[sessionId]/execution',
          params: { sessionId },
        })
      }
    />
  );
}
