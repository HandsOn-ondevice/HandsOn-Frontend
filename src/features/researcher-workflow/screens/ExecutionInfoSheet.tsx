import { AppText, BottomSheet, Button } from '@/design-system';
import type { ExperimentSession } from '../domain/models';
import { selectExecution } from '../domain/execution';
import { useMockDeviceCheckControls } from '../state/WorkflowProvider';
import { PreviewTools } from './PreviewTools';
import { MockExecutionScenarioControl } from './MockExecutionScenarioControl';

/** 기존 개발용 시나리오 설정은 작업 메뉴와 구분된 정보 시트에서만 제공한다. */
export function ExecutionInfoSheet({
  session,
  pending,
  open,
  onClose,
  onDeviceCheck,
}: {
  session: ExperimentSession | null;
  pending: boolean;
  open: boolean;
  onClose: () => void;
  onDeviceCheck?: () => void;
}) {
  const controls = useMockDeviceCheckControls();
  const state = session ? selectExecution(session) : null;
  return (
    <BottomSheet open={open} onClose={onClose} title="현재 작업 정보" icon="flask">
      {session && state ? (
        <PreviewTools available={!!controls}>
          <MockExecutionScenarioControl
            controls={controls}
            key={session.sessionId}
            sessionId={session.sessionId}
            disabled={pending || state.sampling || !!state.pendingVoice || state.completed}
          />
        </PreviewTools>
      ) : null}
      <AppText>
        일시정지와 재개는 앱 상태만 변경합니다. 마지막 회차를 완료하면 누락·이상 검토로 이동합니다.
      </AppText>
      {session?.source === 'mock' ? (
        <AppText>현재 값은 장치에서 수집한 실측값이 아닙니다.</AppText>
      ) : null}
      <AppText>
        화면을 나갔다 돌아와도 현재 회차는 유지됩니다. 앱을 종료하거나 새로고침하면 진행 기록이
        초기화됩니다.
      </AppText>
      {onDeviceCheck ? (
        <Button
          label="장치 점검으로 돌아가기"
          variant="secondary"
          onPress={() => {
            onClose();
            onDeviceCheck();
          }}
        />
      ) : null}
    </BottomSheet>
  );
}
