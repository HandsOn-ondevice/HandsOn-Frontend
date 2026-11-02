import { router, useLocalSearchParams } from 'expo-router';
import { DeviceCheckConnectionScreen } from '@/features/researcher-workflow/screens/DeviceCheckConnectionScreen';

export default function DeviceCheckRoute() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  return (
    <DeviceCheckConnectionScreen
      key={sessionId}
      sessionId={sessionId}
      onBack={() =>
        router.canGoBack()
          ? router.back()
          : router.replace({
              pathname: '/researcher-workflow/[sessionId]/preparation',
              params: { sessionId },
            })
      }
      onExecution={() =>
        router.push({
          pathname: '/researcher-workflow/[sessionId]/execution-pending',
          params: { sessionId },
        })
      }
    />
  );
}
