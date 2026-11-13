import { AppText, Button, FeedbackPanel, Screen } from '@/design-system';
import { selectDeviceCheck } from '../domain/device-check';
import { useWorkflowSession } from '../state/useWorkflowSession';

/** S06 실행 UI·측정·음성 기능은 다음 작업이다. 직접 URL 진입도 완료로 취급하지 않는다. */
export function ExecutionConnectionScreen({
  sessionId,
  onBack,
}: {
  sessionId: string;
  onBack: () => void;
}) {
  const { session, loading, error, refresh } = useWorkflowSession(sessionId);
  const entered = session && selectDeviceCheck(session).executionStarted;
  return (
    <Screen scroll>
      <AppText variant="heading">S06 연결 지점 · 실행 화면 미구현</AppText>
      <AppText>Mock 환경 · 실제 측정·장비 제어·AI·음성 동작 없음</AppText>
      {loading ? <AppText>세션 상태를 확인하고 있습니다.</AppText> : null}
      {error ? (
        <>
          <AppText>{error}</AppText>
          <Button label="상태 다시 확인" onPress={refresh} />
        </>
      ) : null}
      {session ? (
        <>
          <FeedbackPanel
            title={
              entered
                ? 'S05 Mock 점검과 시작 요청이 완료되었습니다'
                : 'S05 점검·시작 요청이 필요합니다'
            }
            subtitle={
              entered
                ? '세션 시작 상태만 전환했습니다. 실제 실험 측정은 수행하지 않았습니다.'
                : '주소로 직접 이동해도 점검 조건을 우회할 수 없습니다.'
            }
            tone={entered ? 'success' : 'warning'}
          />
          <AppText variant="caption">
            세션 {session.sessionId} · 절차 v{session.procedure.version}
          </AppText>
        </>
      ) : null}
      <Button label="S05 장치 점검으로 돌아가기" variant="secondary" onPress={onBack} />
    </Screen>
  );
}
