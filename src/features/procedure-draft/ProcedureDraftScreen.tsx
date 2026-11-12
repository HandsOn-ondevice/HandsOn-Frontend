import { useState } from 'react';
import { usePreventRemove } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import {
  AppText,
  BottomSheet,
  Button,
  FeedbackPanel,
  Icon,
  IconButton,
  Screen,
  StatusBadge,
  StatusBar,
  SurfaceCard,
  colors,
  radii,
  spacing,
} from '@/design-system';
import { DraftEditSheet, editorLabels, type DraftEditor } from './DraftEditSheet';
import type { ProcedureDraftStep } from './procedureDraftRepository';
import { useProcedureDraft } from './useProcedureDraft';

interface ProcedureDraftScreenProps {
  environmentId: string;
  draftId: string;
  onClose: () => void;
  onReview: (stepId: string) => void;
}

type StepGroup = { index: number; steps: ProcedureDraftStep[] };

function groupSteps(steps: readonly ProcedureDraftStep[]) {
  const groups: StepGroup[] = [];
  steps.forEach((step, index) => {
    const previous = groups.at(-1);
    if (previous && step.group && previous.steps[0].group?.id === step.group.id) {
      previous.steps.push(step);
    } else {
      groups.push({ index, steps: [step] });
    }
  });
  return groups;
}

export function ProcedureDraftScreen({
  environmentId,
  draftId,
  onClose,
  onReview,
}: ProcedureDraftScreenProps) {
  const { state, retryLoad, updateDraft, saveDraft } = useProcedureDraft(environmentId, draftId);
  const [editor, setEditor] = useState<DraftEditor | null>(null);
  const [selectedId, setSelectedId] = useState<string>();
  const [expandedId, setExpandedId] = useState<string>();
  const [showMenu, setShowMenu] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const [leave, setLeave] = useState<{ proceed: () => void } | null>(null);
  const [discarding, setDiscarding] = useState(false);

  const draft = state.status === 'ready' ? state.draft : null;
  const dirty = state.status === 'ready' && state.draft !== state.persisted;
  const saving = state.status === 'ready' && state.saveStatus === 'saving';
  const selected =
    draft?.steps.find(({ id }) => id === selectedId) ??
    draft?.steps.find(({ needsReview }) => needsReview) ??
    draft?.steps[0];

  usePreventRemove(!discarding && (dirty || saving || showSaved), ({ repeat }) => {
    if (showSaved) setShowSaved(false);
    else if (!saving) setLeave({ proceed: repeat });
  });

  async function review() {
    if (saving || !draft || !selected) return;
    if ((dirty || draft.savedAt === null) && !(await saveDraft())) return;
    onReview(selected.id);
  }

  async function save() {
    if (await saveDraft()) setShowSaved(true);
  }

  function openEditor(next: DraftEditor) {
    setShowMenu(false);
    setShowSaved(false);
    setEditor(next);
  }

  function close() {
    if (showSaved) setShowSaved(false);
    else onClose();
  }

  const pendingCount = draft?.pendingItems.length ?? 0;

  return (
    <Screen>
      <StatusBar />
      <View style={styles.header}>
        <IconButton icon="back" accessibilityLabel="뒤로가기" onPress={close} disabled={saving} />
        <AppText variant="label" accessibilityRole="header" style={styles.headerTitle}>
          {showSaved ? '처리 결과' : 'AI 절차 초안'}
        </AppText>
        <IconButton
          icon="more"
          accessibilityLabel="더 보기"
          onPress={() => setShowMenu(true)}
          disabled={!draft || saving}
        />
      </View>

      <ScrollView
        style={styles.scroll}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
      >
        {showSaved ? (
          <FeedbackPanel
            title="초안을 저장했습니다"
            subtitle={
              (pendingCount ? `미확정 기준 ${pendingCount}개를 포함한 초안입니다.\n` : '') +
              '승인 전까지 신규 연구생에게 노출되지 않습니다.'
            }
            tone="success"
            icon="check"
            style={styles.savedPanel}
          />
        ) : draft ? (
          <>
            <View style={styles.summary}>
              <View style={styles.summaryLine}>
                <AppText variant="caption" color={colors.text.secondary}>
                  {dirty
                    ? '편집 중 · 승인 전'
                    : draft.savedAt
                      ? '임시 저장됨 · 승인 전'
                      : '승인 전'}
                </AppText>
                {pendingCount ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`미확정 항목 ${pendingCount}개 보기`}
                    onPress={() => setShowMenu(true)}
                    disabled={saving}
                  >
                    <StatusBadge label={`${pendingCount}개 미확정`} tone="warning" />
                  </Pressable>
                ) : null}
              </View>
              <AppText variant="heading">
                {draft.steps.length}단계 · 준비물 {draft.materials.length}개
              </AppText>
              <StatusBadge label={`초안 ${draft.version}`} />
            </View>

            <View style={styles.warning}>
              <Icon name="alert" color={colors.status.warning} size={16} />
              <AppText variant="caption" style={styles.flex}>
                AI 초안은 실행할 수 없으며 숙련자가 모든 기준을 검토해야 합니다.
              </AppText>
            </View>

            {groupSteps(draft.steps).map(({ index, steps }) => {
              const first = steps[0];
              const expanded = expandedId === first.id;
              const grouped = steps.length > 1;
              const rangeSummary = grouped && first.group?.showRange ? first.group : undefined;
              const unresolved = steps.some(({ needsReview }) => needsReview);
              const start = index + 1;
              const number = rangeSummary
                ? `${start}–${index + steps.length}`
                : start === 1
                  ? '1.'
                  : String(start).padStart(2, '0');
              const title = rangeSummary?.title ?? first.title;
              const description = rangeSummary?.description ?? first.description;
              return (
                <SurfaceCard
                  key={first.id}
                  style={[styles.stepCard, unresolved && styles.unresolvedCard]}
                >
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${start}단계 ${title}`}
                    accessibilityState={{
                      expanded,
                      selected: steps.some(({ id }) => id === selected?.id),
                    }}
                    disabled={saving}
                    style={styles.stepRow}
                    onPress={() => {
                      setSelectedId(first.id);
                      setExpandedId(expanded ? undefined : first.id);
                    }}
                  >
                    <View style={[styles.marker, unresolved && styles.unresolvedMarker]}>
                      <Icon
                        name="check"
                        size={20}
                        color={unresolved ? colors.status.warning : colors.status.success}
                      />
                    </View>
                    <View style={styles.flex}>
                      <AppText variant="label">
                        {number} {title}
                      </AppText>
                      <AppText variant="caption" color={colors.text.secondary}>
                        {description}
                      </AppText>
                    </View>
                    <AppText
                      variant="caption"
                      color={unresolved ? colors.status.warning : colors.status.success}
                    >
                      {unresolved ? '미확정' : '초안'}
                    </AppText>
                  </Pressable>
                  {expanded ? (
                    <View style={styles.expandedSteps}>
                      {steps.map((step, offset) => (
                        <View key={step.id} style={styles.stepDetail}>
                          {grouped ? (
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel={`${start + offset}단계 ${step.title} 선택`}
                              accessibilityState={{ selected: step.id === selected?.id }}
                              onPress={() => setSelectedId(step.id)}
                              disabled={saving}
                              style={styles.flex}
                            >
                              <AppText
                                variant="label"
                                color={
                                  step.id === selected?.id
                                    ? colors.text.action
                                    : colors.text.primary
                                }
                              >
                                {start + offset}. {step.title}
                              </AppText>
                              <AppText variant="caption" color={colors.text.secondary}>
                                {step.description}
                              </AppText>
                            </Pressable>
                          ) : (
                            <AppText
                              variant="caption"
                              color={colors.text.secondary}
                              style={styles.flex}
                            >
                              검토할 단계로 선택됨
                            </AppText>
                          )}
                          <IconButton
                            icon="edit"
                            accessibilityLabel={`${step.title} 편집`}
                            disabled={saving}
                            onPress={() => {
                              setSelectedId(step.id);
                              openEditor({ kind: 'step', stepId: step.id });
                            }}
                          />
                        </View>
                      ))}
                    </View>
                  ) : null}
                </SurfaceCard>
              );
            })}
          </>
        ) : state.status === 'loading' ? (
          <FeedbackPanel title="초안을 불러오는 중이에요." />
        ) : state.status === 'error' ? (
          <>
            <FeedbackPanel title="초안을 불러오지 못했어요." tone="warning" />
            <Button label="다시 시도" variant="secondary" onPress={retryLoad} />
          </>
        ) : (
          <FeedbackPanel
            title="초안을 찾을 수 없어요."
            subtitle="현재 작업 환경에서 초안을 다시 선택해 주세요."
            tone="warning"
          />
        )}
      </ScrollView>

      {state.status === 'ready' ? (
        <View style={styles.footer}>
          {showSaved ? (
            <Button label="초안으로 돌아가기" onPress={() => setShowSaved(false)} />
          ) : (
            <>
              {state.saveStatus === 'error' ? (
                <AppText accessibilityRole="alert" color={colors.status.danger}>
                  초안을 저장하지 못했어요. 다시 시도해 주세요.
                </AppText>
              ) : null}
              <View style={styles.actions}>
                <Button
                  label={saving ? '저장 중' : '임시 저장'}
                  variant="secondary"
                  loading={saving}
                  onPress={() => void save()}
                  style={styles.secondaryAction}
                />
                <Button
                  label="기준값 검토"
                  disabled={!selected || saving}
                  onPress={() => void review()}
                  style={styles.primaryAction}
                />
              </View>
            </>
          )}
        </View>
      ) : null}

      {showMenu && draft ? (
        <BottomSheet open title="초안 정보" icon="guidance" onClose={() => setShowMenu(false)}>
          {draft.pendingItems.length ? (
            <SurfaceCard title={`미확정 항목 ${pendingCount}개`} tone="subtle">
              {draft.pendingItems.map(({ id, label }) => (
                <AppText key={id}>{label}</AppText>
              ))}
            </SurfaceCard>
          ) : null}
          {(['materials', 'precautions'] as const).map((kind) => (
            <SurfaceCard key={kind} title={editorLabels[kind]} tone="subtle">
              <AppText color={colors.text.secondary}>
                {draft[kind].join('\n') || '등록된 항목이 없어요.'}
              </AppText>
              <Button
                label={`${editorLabels[kind]} 편집`}
                variant="secondary"
                onPress={() => openEditor({ kind })}
              />
            </SurfaceCard>
          ))}
        </BottomSheet>
      ) : null}
      {editor && draft ? (
        <DraftEditSheet
          editor={editor}
          draft={draft}
          onClose={() => setEditor(null)}
          onApply={updateDraft}
        />
      ) : null}
      {leave ? (
        <BottomSheet
          open
          title="변경 내용을 저장하지 않았어요."
          subtitle="저장하지 않고 나가면 이번에 편집한 내용이 사라져요."
          tone="warning"
          icon="alert"
          onClose={() => setLeave(null)}
        >
          <Button label="계속 편집" onPress={() => setLeave(null)} />
          <Button
            label="저장하지 않고 나가기"
            variant="tertiary"
            onPress={() => {
              setDiscarding(true);
              setLeave(null);
              leave.proceed();
            }}
          />
        </BottomSheet>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    minHeight: 60,
    paddingHorizontal: spacing[20],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[8],
  },
  headerTitle: { flex: 1, textAlign: 'center' },
  scroll: { flex: 1 },
  content: { padding: spacing[24], gap: spacing[10] },
  summary: { gap: spacing[10] },
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
  stepCard: {
    minHeight: 66,
    padding: 0,
    borderWidth: 0,
    boxShadow: 'none',
  },
  unresolvedCard: { backgroundColor: colors.status.warningBg },
  stepRow: {
    minHeight: 66,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[10],
    paddingHorizontal: spacing[12],
    paddingVertical: spacing[8],
  },
  marker: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii[12],
    backgroundColor: colors.status.successBg,
  },
  unresolvedMarker: { backgroundColor: colors.status.warningBg },
  expandedSteps: { paddingHorizontal: spacing[12], paddingBottom: spacing[8] },
  stepDetail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[8],
    borderTopWidth: 1,
    borderColor: colors.border.default,
  },
  flex: { flex: 1 },
  footer: {
    backgroundColor: colors.surface.card,
    paddingHorizontal: spacing[24],
    paddingTop: spacing[14],
    paddingBottom: spacing[24],
    gap: spacing[8],
  },
  savedPanel: { padding: spacing[16], borderRadius: radii[20] },
  actions: { flexDirection: 'row', gap: spacing[12] },
  secondaryAction: { flex: 5 },
  primaryAction: { flex: 6 },
});
