import { router } from 'expo-router';
import { AppText, Screen } from '@/design-system';
import { DevelopmentEntryScreen } from '@/features/researcher-workflow/screens/DevelopmentEntryScreen';

export default function WorkflowDevelopmentEntry() {
  if (!__DEV__)
    return (
      <Screen>
        <AppText>실험 서비스를 준비하고 있습니다.</AppText>
      </Screen>
    );
  return (
    <DevelopmentEntryScreen
      onOpen={(sessionId) =>
        router.push({
          pathname: '/researcher-workflow/[sessionId]/preparation',
          params: { sessionId },
        })
      }
    />
  );
}
