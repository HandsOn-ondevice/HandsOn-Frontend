import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { AppText, Button, FeedbackPanel, Screen, StatusBadge, SurfaceCard } from '@/design-system';
import { useEntrySelection } from '@/features/entry/EntrySelectionProvider';
import { useExpertHome } from './useExpertHome';

type TaskKind = 'procedure' | 'result';

/** Shows the selected procedure or result summary reached from E01. */
export function ExpertTaskScreen({ kind }: { kind: TaskKind }) {
  const { selection } = useEntrySelection();
  const router = useRouter();
  const params = useLocalSearchParams<{ procedureId?: string; resultId?: string }>();
  if (selection?.role !== 'expert') return <Redirect href="/" />;

  const goHome = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/expert');
  };

  return (
    <Screen scroll>
      <ExistingTask
        kind={kind}
        environmentId={selection.environment.id}
        procedureId={params.procedureId}
        resultId={params.resultId}
      />
      <Button label="숙련자 홈으로" variant="secondary" icon="back" onPress={goHome} />
    </Screen>
  );
}

function ExistingTask({
  kind,
  environmentId,
  procedureId,
  resultId,
}: {
  kind: TaskKind;
  environmentId: string;
  procedureId?: string;
  resultId?: string;
}) {
  const { state, refresh } = useExpertHome(environmentId);
  if (state.status === 'loading') return <FeedbackPanel title="선택한 작업을 불러오는 중이에요." />;
  if (state.status === 'error')
    return (
      <>
        <FeedbackPanel title="선택한 작업을 불러오지 못했어요." tone="warning" />
        <Button label="다시 시도" variant="secondary" onPress={refresh} />
      </>
    );

  const procedure = state.data.procedures.find((item) => item.id === procedureId);
  const result = state.data.results.find(
    (item) => item.id === resultId && item.procedureId === procedureId,
  );
  if (!procedure || (kind === 'result' && !result))
    return (
      <FeedbackPanel
        title="선택한 작업을 찾을 수 없어요."
        subtitle="현재 작업 환경의 목록에서 다시 선택해 주세요."
        tone="warning"
      />
    );

  const title =
    kind === 'result' ? '결과 검토' : procedure.status === 'draft' ? '절차 편집' : '승인 절차';
  return (
    <>
      <AppText variant="heading" accessibilityRole="header">
        {title}
      </AppText>
      <SurfaceCard title={procedure.title} subtitle={procedure.version}>
        <StatusBadge
          label={procedure.status === 'draft' ? '초안 · 실행 불가' : '승인'}
          tone={procedure.status === 'draft' ? 'warning' : 'success'}
        />
        <AppText>{procedure.summary}</AppText>
      </SurfaceCard>
      {result ? (
        <SurfaceCard
          title={`${result.studentName} · ${result.deviceName}`}
          subtitle={result.submittedLabel}
        >
          <StatusBadge
            label={result.status === 'pending' ? '검토 대기' : '검토 완료'}
            tone={result.status === 'pending' ? 'warning' : 'success'}
          />
          <AppText>{result.summary}</AppText>
        </SurfaceCard>
      ) : null}
      <FeedbackPanel
        title={`${kind === 'result' ? '결과 검토' : '절차 편집·승인'} 기능을 준비하고 있어요.`}
        subtitle="현재는 선택한 작업의 요약만 확인할 수 있어요."
      />
    </>
  );
}
