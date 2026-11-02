import { useRef, useState } from 'react';
import { AppText, Button, Screen } from '@/design-system';
import { createRequestId } from '../application/request-id';
import { figmaPreparationFixture, mockProcedure } from '../infrastructure/mock/fixtures';
import { useWorkflowRepository } from '../state/WorkflowProvider';
import { workflowErrorMessage } from '../state/useWorkflowSession';

export function DevelopmentEntryScreen({ onOpen }: { onOpen: (sessionId: string) => void }) {
  const repository = useWorkflowRepository();
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
      <AppText variant="heading">연구생 워크플로 개발 진입</AppText>
      <AppText>Mock 환경 · 실제 실험이나 장비 제어를 수행하지 않습니다.</AppText>
      <AppText>
        S04 준비 확인, S05 장치 점검과 S06 Mock 실험 진행을 제공합니다. S07 의미 선택은
        미구현입니다.
      </AppText>
      <Button
        label="새 Mock 실험 준비 시작"
        loading={pending}
        onPress={() => {
          void start(false);
        }}
      />
      <Button
        label="Figma 검증용 2/6 상태 열기"
        variant="secondary"
        disabled={pending}
        onPress={() => {
          void start(true);
        }}
      />
      {error ? <AppText accessibilityLiveRegion="polite">{error}</AppText> : null}
      <AppText variant="caption">
        새 실험은 0/6으로 시작합니다. Mock 세션은 앱 재시작 시 초기화됩니다.
      </AppText>
    </Screen>
  );
}
