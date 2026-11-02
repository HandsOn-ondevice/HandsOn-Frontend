import { AppText, Button, FeedbackPanel, Screen } from '@/design-system';
import { selectPreparation } from '../domain/preparation';
import { useWorkflowSession } from '../state/useWorkflowSession';

/** S05 구현이 아닌 연결 안내. 센서 통신이나 측정 시작 기능을 제공하지 않는다. */
export function DeviceCheckConnectionScreen({
  sessionId,
  onBack,
}: {
  sessionId: string;
  onBack: () => void;
}) {
  const { session, loading, error, refresh } = useWorkflowSession(sessionId);
  const ready = session ? selectPreparation(session).awaitingDeviceCheck : false;
  return (
    <Screen scroll>
      <AppText variant="heading">S05 연결 지점 · 미구현</AppText>
      <AppText>Mock 환경 · 실제 센서 통신을 수행하지 않았습니다.</AppText>
      {loading ? <AppText>준비 상태를 불러오고 있습니다.</AppText> : null}
      {error ? (
        <>
          <AppText>{error}</AppText>
          <Button label="다시 확인" onPress={refresh} />
        </>
      ) : null}
      {session ? (
        <FeedbackPanel
          title={ready ? '작업자 준비 확인이 완료되었습니다' : 'S04 준비 확인이 필요합니다'}
          subtitle={
            ready
              ? '5/6 확인 · 전원·센서 통신 점검은 S05 구현 후 별도로 진행합니다.'
              : '필수 확인을 마친 뒤 확인 완료를 눌러 주세요.'
          }
          tone="info"
        />
      ) : null}
      <Button label="S04 준비 화면으로 돌아가기" variant="secondary" onPress={onBack} />
    </Screen>
  );
}
