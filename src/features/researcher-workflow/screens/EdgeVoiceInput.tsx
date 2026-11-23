import { useRef, useState } from 'react';
import { AppText, Button, FeedbackPanel, TextField } from '@/design-system';
import type { WorkflowCommand } from '../domain/models';
import { interpretEdgeVoice, type EdgeVoiceProposal } from '../infrastructure/edge/edge-voice';
import type { EdgeSessionRequest } from '../infrastructure/edge/edge-session-request';
import { workflowErrorMessage } from '../state/useWorkflowSession';

type Props = {
  request: EdgeSessionRequest;
  sessionId: string;
  revision: number;
  cursorId: string;
  canInterpret: boolean;
  canSample: boolean;
  completableAttemptId?: string;
  execute: (command: WorkflowCommand) => Promise<boolean>;
};

export function EdgeVoiceInput({
  request,
  sessionId,
  revision,
  cursorId,
  canInterpret,
  canSample,
  completableAttemptId,
  execute,
}: Props) {
  const [text, setText] = useState('');
  const [interpreting, setInterpreting] = useState(false);
  const [error, setError] = useState<string>();
  const [proposal, setProposal] = useState<EdgeVoiceProposal>();
  const inFlight = useRef(false);
  const current = proposal?.expectedRevision === revision && proposal.cursorId === cursorId;
  const command = current ? proposal.command : undefined;
  const canConfirm =
    canInterpret &&
    (command?.type === 'requestExecutionSample'
      ? canSample
      : command?.type === 'completeExecutionStep' &&
        command.sampleAttemptId === completableAttemptId);

  const interpret = async () => {
    const utterance = text.trim();
    if (!canInterpret || !utterance || inFlight.current) return;
    inFlight.current = true;
    setInterpreting(true);
    setProposal(undefined);
    setError(undefined);
    try {
      setProposal(await interpretEdgeVoice(request, sessionId, utterance));
    } catch (reason) {
      setError(workflowErrorMessage(reason));
    } finally {
      inFlight.current = false;
      setInterpreting(false);
    }
  };

  const confirm = async (next: WorkflowCommand) => {
    if (await execute(next)) {
      setProposal(undefined);
      setText('');
    }
  };

  return (
    <>
      <AppText variant="heading" accessibilityRole="header">
        음성 명령 확인
      </AppText>
      <TextField
        label="명령 텍스트"
        value={text}
        maxLength={200}
        disabled={!canInterpret || interpreting}
        onChange={(value) => {
          setText(value);
          setProposal(undefined);
          setError(undefined);
        }}
      />
      <Button
        label="명령 해석 요청"
        variant="secondary"
        loading={interpreting}
        disabled={!canInterpret || !text.trim() || interpreting}
        onPress={() => void interpret()}
      />
      {error ? (
        <FeedbackPanel title="명령을 해석하지 못했습니다" subtitle={error} tone="danger" />
      ) : null}
      {proposal ? (
        <FeedbackPanel
          title={current ? 'Edge 명령 해석 결과' : '현재 회차 상태가 바뀌었습니다'}
          subtitle={current ? proposal.message : '현재 작업에서 명령을 다시 해석해 주세요.'}
          tone="info"
        />
      ) : null}
      {current && proposal.needsClarification ? (
        <Button
          label="명령 뜻 선택하기"
          variant="secondary"
          disabled={!canInterpret}
          onPress={() =>
            void confirm({
              type: 'requestVoiceClarification',
              cursorId,
              utterance: text.trim(),
            })
          }
        />
      ) : null}
      {command ? (
        <Button
          label={
            command.type === 'requestExecutionSample'
              ? '이 명령으로 측정 요청'
              : '이 명령으로 완료 요청'
          }
          disabled={!canConfirm}
          onPress={() => void confirm(command)}
        />
      ) : null}
      {current ? (
        <Button label="해석 결과 닫기" variant="secondary" onPress={() => setProposal(undefined)} />
      ) : null}
    </>
  );
}
