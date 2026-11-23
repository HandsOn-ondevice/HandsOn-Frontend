import { router, useLocalSearchParams } from 'expo-router';
import { SessionMenuScreen } from '@/features/researcher-workflow/screens/SessionMenuScreen';

export default function SessionMenuRoute() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  return (
    <SessionMenuScreen
      key={sessionId}
      sessionId={sessionId}
      onExecution={() =>
        router.dismissTo({
          pathname: '/researcher-workflow/[sessionId]/execution',
          params: { sessionId },
        })
      }
      onDeviceStatus={() =>
        router.push({
          pathname: '/researcher-workflow/[sessionId]/device-status',
          params: { sessionId },
        })
      }
      onPause={() =>
        router.replace({
          pathname: '/researcher-workflow/[sessionId]/paused',
          params: { sessionId },
        })
      }
    />
  );
}
