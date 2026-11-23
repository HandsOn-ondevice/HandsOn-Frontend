import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { AppText, Button, FeedbackPanel, Screen, StatusBadge, SurfaceCard } from '@/design-system';
import { useEntrySelection } from '@/features/entry/EntrySelectionProvider';
import { useExpertHome } from './useExpertHome';
import { loadExpertHome } from './expertHomeData';

type TaskKind = 'procedure' | 'result' | 'draft';

/** Shows the selected procedure or result summary reached from E01. */
export function ExpertTaskScreen({ kind }: { kind: TaskKind }) {
  const { selection } = useEntrySelection();
  const router = useRouter();
  const params = useLocalSearchParams<{
    draftId?: string;
    procedureId?: string;
    resultId?: string;
    version?: string;
  }>();
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
        edgeToken={selection.edgeToken}
        procedureId={kind === 'draft' ? params.draftId : params.procedureId}
        resultId={params.resultId}
        version={params.version}
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
  edgeToken,
  version,
}: {
  kind: TaskKind;
  environmentId: string;
  procedureId?: string;
  resultId?: string;
  edgeToken?: string;
  version?: string;
}) {
  const loadHome = useCallback((id: string) => loadExpertHome(id, edgeToken), [edgeToken]);
  const { state, refresh } = useExpertHome(environmentId, loadHome);
  if (state.status === 'loading') return <FeedbackPanel title="선택한 작업을 불러오는 중이에요." />;
  if (state.status === 'error')
    return (
      <>
        <FeedbackPanel title="선택한 작업을 불러오지 못했어요." tone="warning" />
        <Button label="다시 시도" variant="secondary" onPress={refresh} />
      </>
    );

  const procedure = state.data.procedures.find(
    (item) =>
      item.id === procedureId &&
      (version === undefined || item.version === version) &&
      (kind !== 'draft' || item.status === 'draft'),
  );
  const result = state.data.results.find(
    (item) => item.id === resultId && item.procedureId === procedureId,
  );
  if (kind === 'result' ? !result : !procedure)
    return (
      <FeedbackPanel
        title="선택한 작업을 찾을 수 없어요."
        subtitle="현재 작업 환경의 목록에서 다시 선택해 주세요."
        tone="warning"
      />
    );

  if (kind === 'procedure' && procedure?.status === 'draft') {
    return (
      <Redirect
        href={{ pathname: '/expert/drafts/[draftId]', params: { draftId: procedure.id } }}
      />
    );
  }

  const title = kind === 'result' ? '결과 검토' : kind === 'draft' ? '절차 초안' : '승인 절차';
  return (
    <>
      <AppText variant="heading" accessibilityRole="header">
        {title}
      </AppText>
      {procedure && kind !== 'result' ? (
        <SurfaceCard title={procedure.title} subtitle={procedure.version}>
          <StatusBadge
            label={procedure.status === 'draft' ? '초안 · 실행 불가' : '승인'}
            tone={procedure.status === 'draft' ? 'warning' : 'success'}
          />
          <AppText>{procedure.summary}</AppText>
        </SurfaceCard>
      ) : null}
      {result ? (
        <SurfaceCard
          title={result.procedureTitle}
          subtitle={`${result.studentName} · ${result.deviceName}`}
        >
          <StatusBadge
            label={result.status === 'pending' ? '검토 대기' : '검토 완료'}
            tone={result.status === 'pending' ? 'warning' : 'success'}
          />
          <AppText>{result.summary}</AppText>
          <AppText variant="caption">{result.submittedLabel}</AppText>
        </SurfaceCard>
      ) : null}
      <FeedbackPanel
        title={`${kind === 'result' ? '결과 검토' : '절차 편집·승인'} 기능을 준비하고 있어요.`}
        subtitle="현재는 선택한 작업의 요약만 확인할 수 있어요."
      />
    </>
  );
}
