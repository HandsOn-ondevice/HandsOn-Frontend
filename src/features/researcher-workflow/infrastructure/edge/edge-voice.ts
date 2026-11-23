import { WorkflowError, type WorkflowCommand } from '../../domain/models';
import { postEdgeVoiceText, type EdgeSessionRequest } from './edge-session-request';

type MeasurementProposal = Extract<
  WorkflowCommand,
  { type: 'requestExecutionSample' | 'completeExecutionStep' }
>;

export type EdgeVoiceProposal = {
  cursorId: string;
  expectedRevision: number;
  message: string;
  command?: MeasurementProposal;
  needsClarification: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export async function interpretEdgeVoice(
  request: EdgeSessionRequest,
  sessionId: string,
  text: string,
): Promise<EdgeVoiceProposal> {
  const value = await postEdgeVoiceText(request, sessionId, text);
  if (
    !isRecord(value) ||
    value.sessionId !== sessionId ||
    value.text !== text ||
    value.executed !== false ||
    value.requiresConfirmation !== true ||
    typeof value.intent !== 'string' ||
    typeof value.cursorId !== 'string' ||
    typeof value.expectedRevision !== 'number' ||
    !Number.isSafeInteger(value.expectedRevision) ||
    value.expectedRevision < 0 ||
    typeof value.message !== 'string'
  ) {
    throw new WorkflowError('EDGE_REJECTED', 'Edge 음성 해석 응답을 확인해 주세요.');
  }

  const { cursorId, expectedRevision, intent, command } = value;
  let measurement: MeasurementProposal | undefined;
  if (isRecord(command) && command.type === intent && command.cursorId === cursorId) {
    if (command.type === 'requestExecutionSample') {
      measurement = { type: command.type, cursorId };
    } else if (
      command.type === 'completeExecutionStep' &&
      typeof command.sampleAttemptId === 'string' &&
      command.sampleAttemptId
    ) {
      measurement = { type: command.type, cursorId, sampleAttemptId: command.sampleAttemptId };
    }
  }

  return {
    cursorId,
    expectedRevision,
    message: typeof value.speechText === 'string' ? value.speechText : value.message,
    command: measurement,
    needsClarification: command === null && (intent === 'clarification' || intent === 'remeasure'),
  };
}
