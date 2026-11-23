import { Stack, router } from 'expo-router';
import { ScrollView } from 'react-native';
import { AppBar, FeedbackPanel, Screen, StatusBar, spacing } from '@/design-system';
import { WorkflowProvider } from '@/features/researcher-workflow/state/WorkflowProvider';
import { isEdgeDataEnabled } from '@/lib/edgeApi';

export default function ResearcherWorkflowLayout() {
  if (isEdgeDataEnabled()) {
    return (
      <Stack
        screenOptions={{ headerShown: false }}
        screenLayout={({ route, children }) =>
          route.name === '[sessionId]/preparation' ? (
            children
          ) : (
            <Screen>
              <StatusBar />
              <AppBar
                mode="back"
                title="실험 세션"
                onBack={() => (router.canGoBack() ? router.back() : router.replace('/student'))}
              />
              <ScrollView contentContainerStyle={{ padding: spacing[24] }}>
                <FeedbackPanel
                  title="이 단계의 Edge 연동을 준비 중이에요."
                  subtitle="연구생 홈에서 실험 현황을 확인해 주세요."
                />
              </ScrollView>
            </Screen>
          )
        }
      />
    );
  }

  return (
    <WorkflowProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </WorkflowProvider>
  );
}
