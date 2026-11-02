import { router, useLocalSearchParams } from 'expo-router';
import { PreparationScreen } from '@/features/researcher-workflow/screens/PreparationScreen';

export default function PreparationRoute() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  return (
    <PreparationScreen
      key={sessionId}
      sessionId={sessionId}
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/researcher-workflow'))}
      onDeviceCheck={() =>
        router.push({
          pathname: '/researcher-workflow/[sessionId]/device-check',
          params: { sessionId },
        })
      }
    />
  );
}
