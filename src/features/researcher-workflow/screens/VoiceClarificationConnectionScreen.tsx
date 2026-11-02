import { AppText, Button, FeedbackPanel, Screen } from '@/design-system';
import { selectExecution } from '../domain/execution';
import { useWorkflowSession } from '../state/useWorkflowSession';

/** S07의 후보 선택·명령 해석은 미구현. 전달 상태를 보여주고 실행 없이 되돌린다. */
export function VoiceClarificationConnectionScreen({
  sessionId,
  onBack,
}: {
  sessionId: string;
  onBack: () => void;
}) {
  const { session, loading, pending, error, refresh, execute } = useWorkflowSession(sessionId);
  const state = session ? selectExecution(session) : null;
  const back = async () => {
    if (state?.pendingVoice) {
      const next = await execute({
        type: 'dismissVoiceClarification',
        commandId: state.pendingVoice.commandId,
      });
      if (next && !next.execution?.pendingVoice) onBack();
    } else onBack();
  };
  return (
    <Screen scroll>
      <AppText variant="heading">S07 연결 지점 · 의미 선택 미구현</AppText>
      <AppText>Mock 환경 · 실제 음성 인식·명령 실행 없음</AppText>
      {loading ? <AppText>확인 요청을 불러오고 있습니다.</AppText> : null}
      {error ? (
        <>
          <AppText>{error}</AppText>
          <Button label="요청 다시 불러오기" onPress={refresh} disabled={pending} />
        </>
      ) : null}
      <FeedbackPanel
        title={
          state?.pendingVoice
            ? `“${state.pendingVoice.utterance}” 확인 대기`
            : '전달된 음성 확인 요청이 없습니다'
        }
        subtitle="모호한 명령은 실행하지 않았습니다. 단계·조건·회차와 유효 측정은 변경하지 않습니다."
        tone="warning"
      />
      {state?.pendingVoice ? (
        <AppText variant="caption">
          세션 {sessionId} · 조건 {state.pendingVoice.cursor.conditionId} ·{' '}
          {state.pendingVoice.cursor.trialIndex}회차
        </AppText>
      ) : null}
      <Button
        label="명령 실행 없이 S06으로 돌아가기"
        onPress={() => {
          void back();
        }}
        disabled={loading}
        loading={pending}
      />
    </Screen>
  );
}
