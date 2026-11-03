import { useRef, useState } from 'react';
import { AppText, Button, Screen } from '@/design-system';
import { createRequestId } from '../application/request-id';
import { figmaPreparationFixture, mockProcedure } from '../infrastructure/mock/fixtures';
import { useWorkflowRepository, useMockDeviceCheckControls } from '../state/WorkflowProvider';
import { workflowErrorMessage } from '../state/useWorkflowSession';
import { PreviewTools } from './PreviewTools';

export function DevelopmentEntryScreen({ onOpen }: { onOpen: (sessionId: string) => void }) {
  const repository = useWorkflowRepository();
  const previewControls = useMockDeviceCheckControls();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  const start = async (fixture: boolean) => {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError(null);
    try {
      let session = await repository.createSession({
        requestId: createRequestId(),
        operatorId: 'mock-researcher',
        procedure: mockProcedure,
      });
      if (fixture) {
        for (const checkId of figmaPreparationFixture.confirmed) {
          session = await repository.executeCommand(
            session.sessionId,
            { type: 'setPreparationCheck', checkId, checked: true },
            { requestId: createRequestId(), expectedRevision: session.revision },
          );
        }
      }
      onOpen(session.sessionId);
    } catch (reason) {
      setError(workflowErrorMessage(reason));
    } finally {
      busy.current = false;
      setPending(false);
    }
  };

  return (
    <Screen scroll>
      <AppText variant="heading">연구자 워크플로</AppText>
      <AppText>준비 확인부터 장치 점검과 측정까지 차례대로 진행합니다.</AppText>
      <AppText>진행 기록은 앱을 종료하거나 새로고침하면 초기화됩니다.</AppText>
      <Button
        label="새 실험 준비 시작"
        loading={pending}
        onPress={() => {
          void start(false);
        }}
      />
      <PreviewTools available={!!previewControls}>
        <Button
          label="준비 항목 2개 확인 상태로 보기"
          variant="secondary"
          disabled={pending}
          onPress={() => {
            void start(true);
          }}
        />
      </PreviewTools>
      {error ? <AppText accessibilityLiveRegion="polite">{error}</AppText> : null}
      <AppText variant="caption">새 실험은 준비 항목 0/6으로 시작합니다.</AppText>
    </Screen>
  );
}
