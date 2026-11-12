import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { AppText, Button, TextField, spacing } from '@/design-system';
import type { ProcedureDraft, ProcedureDraftStep } from './procedureDraftRepository';

export type DraftEditor = { kind: 'step'; stepId: string } | { kind: 'materials' | 'precautions' };

export const editorLabels = { materials: '준비물', precautions: '주의사항' } as const;
export const draftEditorLabel = (editor: DraftEditor) =>
  editor.kind === 'step' ? '절차 단계' : editorLabels[editor.kind];
const useNativeKeyboardIntegration = Platform.OS !== 'web';

interface DraftEditFormProps {
  editor: DraftEditor;
  draft: ProcedureDraft;
  onClose: () => void;
  onApply: (update: (draft: ProcedureDraft) => ProcedureDraft) => void;
}

export function DraftEditForm({ editor, draft, onClose, onApply }: DraftEditFormProps) {
  const position =
    editor.kind === 'step' ? draft.steps.findIndex((s) => s.id === editor.stepId) : -1;
  const step = draft.steps[position];
  const [title, setTitle] = useState(step?.title ?? '');
  const [text, setText] = useState(
    editor.kind === 'step' ? (step?.description ?? '') : draft[editor.kind].join('\n'),
  );
  const [destination, setDestination] = useState(position);

  const label = draftEditorLabel(editor);

  function apply() {
    if (editor.kind === 'step') {
      if (!step || !title.trim()) return;
      onApply((current) => {
        const edited: ProcedureDraftStep = {
          ...step,
          title: title.trim(),
          description: text.trim(),
        };
        const steps = current.steps.filter(({ id }) => id !== step.id);
        steps.splice(destination, 0, edited);
        return { ...current, steps };
      });
    } else {
      const lines = text
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
      onApply((current) => ({ ...current, [editor.kind]: lines }));
    }
    onClose();
  }

  return (
    <>
      {editor.kind === 'step' ? (
        <>
          <TextField
            label="단계 이름"
            value={title}
            onChange={setTitle}
            withinSheet={useNativeKeyboardIntegration}
          />
          <View style={styles.order}>
            <Button
              label="위로 이동"
              variant="secondary"
              disabled={destination <= 0}
              onPress={() => setDestination((current) => Math.max(0, current - 1))}
            />
            <AppText variant="label" accessibilityLiveRegion="polite">
              {destination + 1} / {draft.steps.length}
            </AppText>
            <Button
              label="아래로 이동"
              variant="secondary"
              disabled={destination >= draft.steps.length - 1}
              onPress={() =>
                setDestination((current) => Math.min(draft.steps.length - 1, current + 1))
              }
            />
          </View>
        </>
      ) : null}
      <TextField
        label={editor.kind === 'step' ? '단계 내용' : label}
        support={editor.kind === 'step' ? undefined : '한 줄에 한 항목을 입력해 주세요.'}
        value={text}
        onChange={setText}
        multiline
        withinSheet={useNativeKeyboardIntegration}
      />
      <Button
        label="편집 적용"
        disabled={editor.kind === 'step' && (!step || !title.trim())}
        onPress={apply}
      />
    </>
  );
}

const styles = StyleSheet.create({
  order: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[8],
  },
});
