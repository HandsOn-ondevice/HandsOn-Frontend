import { router, useLocalSearchParams } from 'expo-router';
import { PauseScreen } from '@/features/researcher-workflow/screens/PauseScreen';

export default function PauseRoute() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  return (
    <PauseScreen
      key={sessionId}
      sessionId={sessionId}
      onHome={() => router.dismissTo('/student')}
      onResume={() =>
        router.push({ pathname: '/researcher-workflow/[sessionId]/resume', params: { sessionId } })
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
