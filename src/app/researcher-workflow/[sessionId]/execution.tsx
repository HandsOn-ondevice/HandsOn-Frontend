import { router, useLocalSearchParams } from 'expo-router';
import { ExecutionScreen } from '@/features/researcher-workflow/screens/ExecutionScreen';

export default function ExecutionRoute() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  return (
    <ExecutionScreen
      key={sessionId}
      sessionId={sessionId}
      onBack={() =>
        router.dismissTo({
          pathname: '/researcher-workflow/[sessionId]/device-check',
          params: { sessionId },
        })
      }
      onClarification={() =>
        router.push({
          pathname: '/researcher-workflow/[sessionId]/voice-clarification',
          params: { sessionId },
        })
      }
    />
  );
}
