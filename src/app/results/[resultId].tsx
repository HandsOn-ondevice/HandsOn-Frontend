import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEntrySelection } from '@/features/entry/EntrySelectionProvider';
import { HomeDestinationScreen } from '@/features/student-home/HomeDestinationScreen';
import { StudentResultScreen } from '@/features/student-home/StudentResultScreen';
import { isEdgeDataEnabled } from '@/lib/edgeApi';

export default function Result() {
  const router = useRouter();
  const { selection } = useEntrySelection();
  const { resultId, sessionId } = useLocalSearchParams<{ resultId?: string; sessionId?: string }>();
  if (selection?.role !== 'student') return <Redirect href="/" />;
  if (!isEdgeDataEnabled()) {
    return (
      <HomeDestinationScreen
        title="작업 결과"
        message="저장된 결과를 확인하는 화면을 준비하고 있어요."
      />
    );
  }
  if (typeof resultId !== 'string' || !resultId || typeof sessionId !== 'string' || !sessionId) {
    return <Redirect href="/student" />;
  }

  const environmentId = selection.environment.id;
  return (
    <StudentResultScreen
      key={JSON.stringify([environmentId, resultId, sessionId])}
      edgeToken={selection.edgeToken}
      environmentId={environmentId}
      resultId={resultId}
      sessionId={sessionId}
      onBack={() => router.dismissTo('/student')}
      onOpenCondition={(conditionId, result) =>
        router.push({
          pathname: '/results/[resultId]/evidence/[conditionId]',
          params: { resultId: result.id, sessionId: result.sessionId, conditionId },
        })
      }
    />
  );
}
