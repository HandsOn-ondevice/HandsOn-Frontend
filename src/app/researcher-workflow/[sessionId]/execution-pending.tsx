import { router, useLocalSearchParams } from 'expo-router';
import { ExecutionConnectionScreen } from '@/features/researcher-workflow/screens/ExecutionConnectionScreen';

export default function ExecutionConnectionRoute() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  return (
    <ExecutionConnectionScreen
      key={sessionId}
      sessionId={sessionId}
      onBack={() =>
        router.canGoBack()
          ? router.back()
          : router.replace({
              pathname: '/researcher-workflow/[sessionId]/device-check',
              params: { sessionId },
            })
      }
    />
  );
}
