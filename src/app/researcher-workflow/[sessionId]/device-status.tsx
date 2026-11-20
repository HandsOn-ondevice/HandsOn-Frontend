import { router, useLocalSearchParams } from 'expo-router';
import { SessionDeviceStatusScreen } from '@/features/researcher-workflow/screens/SessionDeviceStatusScreen';

export default function SessionDeviceStatusRoute() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  return (
    <SessionDeviceStatusScreen
      key={sessionId}
      sessionId={sessionId}
      onExecution={() =>
        router.dismissTo({
          pathname: '/researcher-workflow/[sessionId]/execution',
          params: { sessionId },
        })
      }
    />
  );
}
