import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import {
  AppText,
  Button,
  EvidenceRow,
  FeedbackPanel,
  Icon,
  IconButton,
  Screen,
  StatusBadge,
  StatusBar,
  colors,
  radii,
  spacing,
} from '@/design-system';
import { useEntrySelection } from '@/features/entry/EntrySelectionProvider';
import {
  procedureDraftRepository,
  type ProcedureDraft,
} from '@/features/procedure-draft/procedureDraftRepository';

type LoadState =
  { status: 'loading' | 'missing' | 'error' } | { status: 'ready'; draft: ProcedureDraft };

export default function GeneratedDraftRoute() {
  const { draftId } = useLocalSearchParams<{ draftId: string }>();
  const router = useRouter();
  const { selection } = useEntrySelection();
  if (selection?.role !== 'expert') return <Redirect href="/" />;
  if (typeof draftId !== 'string' || !draftId.trim()) return <Redirect href="/expert" />;

  return (
    <GeneratedDraft
      key={JSON.stringify([selection.environment.id, draftId])}
      environmentId={selection.environment.id}
      draftId={draftId}
      onBack={() => {
        if (router.canGoBack()) router.back();
        else router.replace('/expert');
      }}
    />
  );
}

function GeneratedDraft({
  environmentId,
  draftId,
  onBack,
}: {
  environmentId: string;
  draftId: string;
  onBack: () => void;
}) {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    void procedureDraftRepository.load(environmentId, draftId).then(
      (draft) => {
        if (active) setState(draft?.savedAt ? { status: 'ready', draft } : { status: 'missing' });
      },
      () => {
        if (active) setState({ status: 'error' });
      },
    );
    return () => {
      active = false;
    };
  }, [environmentId, draftId, attempt]);

  function retryLoad() {
    setState({ status: 'loading' });
    setAttempt((previous) => previous + 1);
  }

  return (
    <Screen>
      <StatusBar />
      <View style={styles.header}>
        <IconButton icon="back" accessibilityLabel="뒤로가기" onPress={onBack} />
        <AppText variant="label" accessibilityRole="header" style={styles.headerTitle}>
          AI 절차 초안
        </AppText>
        <View style={styles.headerSpacer} />
      </View>
      <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
        {state.status === 'ready' ? (
          <DraftSummary draft={state.draft} />
        ) : state.status === 'loading' ? (
          <FeedbackPanel title="초안을 불러오는 중이에요." />
        ) : (
          <>
            <FeedbackPanel
              title={
                state.status === 'missing'
                  ? '생성된 초안을 찾을 수 없어요.'
                  : '초안을 불러오지 못했어요.'
              }
              tone="warning"
              icon="alert"
            />
            <Button label="다시 시도" variant="secondary" onPress={retryLoad} />
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

function DraftSummary({ draft }: { draft: ProcedureDraft }) {
  return (
    <>
      <View style={styles.summaryLine}>
        <AppText variant="caption" color={colors.text.secondary}>
          자동 저장됨 · 승인 전
        </AppText>
        {draft.pendingItems.length > 0 ? (
          <StatusBadge label={`${draft.pendingItems.length}개 미확정`} tone="warning" />
        ) : null}
      </View>
      <AppText variant="heading">
        {draft.steps.length}단계 · 준비물 {draft.materials.length}개
      </AppText>
      <AppText variant="label">{draft.title}</AppText>
      <StatusBadge label={`초안 ${draft.version}`} />
      <View style={styles.warning}>
        <Icon name="alert" color={colors.status.warning} size={16} />
        <AppText variant="caption" style={styles.flex}>
          AI 초안은 실행할 수 없으며 숙련자가 모든 기준을 검토해야 합니다.
        </AppText>
      </View>
      {draft.steps.map((step, index) => (
        <EvidenceRow
          key={step.id}
          title={`${index + 1}. ${step.title}`}
          subtitle={step.description}
          meta={step.needsReview ? '미확정' : '초안'}
          kind="program"
          state={step.needsReview ? 'issue' : 'confirmed'}
          icon="check"
        />
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  header: {
    minHeight: 60,
    paddingHorizontal: spacing[20],
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[8],
  },
  headerTitle: { flex: 1, textAlign: 'center' },
  headerSpacer: { width: spacing[48] },
  flex: { flex: 1 },
  content: { padding: spacing[24], gap: spacing[10] },
  summaryLine: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[8],
  },
  warning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[8],
    borderRadius: radii[12],
    backgroundColor: colors.status.warningBg,
    padding: spacing[10],
  },
});
