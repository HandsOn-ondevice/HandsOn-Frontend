import { useRef, useState, type ChangeEvent } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText, Button, colors, spacing } from '@/design-system';
import type { RecordingEnvironment } from './recordingSession';
import { saveWebRecording } from './webRecording';

interface WebRecordingPickerProps {
  title: string;
  environment: RecordingEnvironment;
  onSaved: (recordingId: string) => void;
}

export function WebRecordingPicker({ title, environment, onSaved }: WebRecordingPickerProps) {
  const input = useRef<HTMLInputElement>(null);
  const pending = useRef(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  async function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file || !title.trim() || pending.current) return;
    if (!file.size || !file.name.toLowerCase().endsWith('.m4a')) {
      setError('비어 있지 않은 M4A 파일을 선택해 주세요.');
      return;
    }

    pending.current = true;
    setSaving(true);
    setError(undefined);
    try {
      const recording = await saveWebRecording(file, title, environment);
      onSaved(recording.id);
    } catch {
      setError('브라우저에 오디오 파일을 저장하지 못했어요. 다시 선택해 주세요.');
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }

  return (
    <View style={styles.picker}>
      <input
        ref={input}
        type="file"
        hidden
        accept=".m4a"
        aria-label="준비된 오디오 파일"
        onChange={(event) => void onFileChange(event)}
      />
      {error ? <AppText color={colors.status.danger}>{error}</AppText> : null}
      <Button
        label="오디오 파일 선택"
        onPress={() => input.current?.click()}
        disabled={!title.trim()}
        loading={saving}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  picker: { flex: 1, gap: spacing[8] },
});
