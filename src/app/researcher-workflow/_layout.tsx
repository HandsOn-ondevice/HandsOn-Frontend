import { Stack } from 'expo-router';
import { WorkflowProvider } from '@/features/researcher-workflow/state/WorkflowProvider';

export default function ResearcherWorkflowLayout() {
  return (
    <WorkflowProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </WorkflowProvider>
  );
}
