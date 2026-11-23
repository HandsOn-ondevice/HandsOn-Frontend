import { isMockWorkflowEnabled } from '@/features/researcher-workflow/infrastructure/mock/mock-environment';
import { router } from 'expo-router';
import { AppText, Screen } from '@/design-system';
import { DevelopmentEntryScreen } from '@/features/researcher-workflow/screens/DevelopmentEntryScreen';

export default function WorkflowDevelopmentEntry() {
  if (!isMockWorkflowEnabled())
    return (
      <Screen>
        <AppText>개발용 Mock 세션 생성은 개발 빌드에서만 제공합니다.</AppText>
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
