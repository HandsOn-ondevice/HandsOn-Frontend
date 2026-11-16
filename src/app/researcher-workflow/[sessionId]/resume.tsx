import { router, useLocalSearchParams } from 'expo-router';
import { ResumeScreen } from '@/features/researcher-workflow/screens/ResumeScreen';

export default function ResumeRoute() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  return (
    <ResumeScreen
      key={sessionId}
      sessionId={sessionId}
      onBack={() =>
        router.dismissTo({
          pathname: '/researcher-workflow/[sessionId]/paused',
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
