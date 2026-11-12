import { Platform } from 'react-native';

import type { ProcedureDraft } from '@/features/procedure-draft/procedureDraftRepository';
import type { SavedRecording } from '@/features/recording/recordingSession';
import { readSavedRecording } from '@/features/recording/recordingStorage';

export interface GenerateDraftRequest {
  recordingId: string;
  title: string;
  confirmedText: string;
}

export interface TranscriptionService {
  transcribe(recording: SavedRecording): Promise<{ text: string }>;
  generateDraft(request: GenerateDraftRequest): Promise<ProcedureDraft>;
}

const demoEnabled = __DEV__ || process.env.EXPO_PUBLIC_HANDSON_MAESTRO === '1';

export const demoTranscriptionRecordingId = 'recording-0-demo0001';
export const demoTranscriptionEnvironmentId = 'demo-circuits';

export async function readTranscriptionRecording(recordingId: string) {
  if (Platform.OS !== 'web') return readSavedRecording(recordingId);
  if (!demoEnabled || recordingId !== demoTranscriptionRecordingId) return null;

  const recording: SavedRecording = {
    id: demoTranscriptionRecordingId,
    uri: 'demo://recording/led-output',
    fileName: `${demoTranscriptionRecordingId}.m4a`,
    mimeType: 'audio/mp4',
    durationMs: 138000,
    sizeBytes: 1344800,
    createdAt: '2026-11-12T04:00:00.000Z',
    title: 'LED 출력 특성 측정',
    environment: { id: demoTranscriptionEnvironmentId, name: '전자회로 실험실' },
  };
  return recording;
}

const demoText =
  '새 LED 모듈의 출력 특성을 측정할 거야. 먼저 전원이 꺼져 있는지 확인해. ' +
  'LED와 조도 센서 수광면의 거리는 20cm로 맞추고 서로 정면을 보게 해. ' +
  '전원을 켠 뒤 세 센서가 모두 갱신되는지 확인해. LED를 끈 상태를 기준으로 기록하고, ' +
  '25%, 50%, 75%, 100% 순서로 바꿔. 각 조건은 5초 안정화한 뒤 세 번 측정해.';

export const demoTranscriptionChecklist = [
  {
    id: 'equipment',
    title: '장비 7개 · 출력 조건 5개',
    description: '고유명사 인식 완료',
    status: '수정',
  },
  {
    id: 'measurements',
    title: '수치 3개',
    description: '20cm · 5초 · 조건별 3회',
    status: '확인',
  },
  {
    id: 'thresholds',
    title: '정의되지 않은 기준 3개',
    description: '전압 · 과전류 · 오래된 값',
    status: '질문 예정',
  },
] as const;

function waitForDemoResponse() {
  return new Promise<void>((resolve) => setTimeout(resolve, 500));
}

// Keep the demo behind the same gate as the work environment and draft fixtures.
export const transcriptionService: TranscriptionService | null = demoEnabled
  ? {
      async transcribe(recording) {
        if (!recording.uri || recording.sizeBytes <= 0 || recording.durationMs <= 0) {
          throw new Error('녹음 원본이 비어 있어요.');
        }
        await waitForDemoResponse();
        return { text: demoText };
      },
      async generateDraft({ recordingId, title, confirmedText }) {
        if (!confirmedText.trim()) throw new Error('확인한 텍스트를 입력해 주세요.');

        await waitForDemoResponse();
        const reviewStep = {
          id: 'review-transcript',
          title: '작업 설명 검토',
          description: confirmedText,
          needsReview: true,
        };

        return {
          id: `generated-${recordingId}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
          title,
          description: confirmedText,
          status: 'draft',
          version: 'v0.1',
          steps: [reviewStep],
          materials: [],
          precautions: [],
          pendingItems: [
            {
              id: 'review-transcript-content',
              label: '작업 설명의 단계와 완료 기준을 검토해 주세요.',
              stepId: reviewStep.id,
            },
          ],
          savedAt: null,
        };
      },
    }
  : null;
