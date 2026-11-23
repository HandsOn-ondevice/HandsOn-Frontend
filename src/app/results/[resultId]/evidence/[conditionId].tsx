import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEntrySelection } from '@/features/entry/EntrySelectionProvider';
import { StudentResultScreen } from '@/features/student-home/StudentResultScreen';

export default function ResultEvidence() {
  const router = useRouter();
  const { selection } = useEntrySelection();
  const { resultId, sessionId, conditionId } = useLocalSearchParams<{
    resultId?: string;
    sessionId?: string;
    conditionId?: string;
  }>();
  if (selection?.role !== 'student') return <Redirect href="/" />;
  if (
    !selection.edge ||
    typeof resultId !== 'string' ||
    !resultId ||
    typeof sessionId !== 'string' ||
    !sessionId ||
    typeof conditionId !== 'string' ||
    !conditionId
  ) {
    return <Redirect href="/student" />;
  }

  const environmentId = selection.environment.edgeEnvironmentId ?? selection.environment.id;
  return (
    <StudentResultScreen
      key={JSON.stringify([environmentId, resultId, sessionId, conditionId])}
      access={selection.edge}
      environmentId={environmentId}
      resultId={resultId}
      sessionId={sessionId}
      conditionId={conditionId}
      onBack={() =>
        router.dismissTo({ pathname: '/results/[resultId]', params: { resultId, sessionId } })
      }
    />
  );
}
