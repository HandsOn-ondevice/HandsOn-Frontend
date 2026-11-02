import { router, useLocalSearchParams } from 'expo-router';
import { DeviceCheckConnectionScreen } from '@/features/researcher-workflow/screens/DeviceCheckConnectionScreen';

export default function DeviceCheckConnectionRoute() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  return (
    <DeviceCheckConnectionScreen
      key={sessionId}
      sessionId={sessionId}
      onBack={() =>
        router.replace({
          pathname: '/researcher-workflow/[sessionId]/preparation',
          params: { sessionId },
        })
      }
    />
  );
}
