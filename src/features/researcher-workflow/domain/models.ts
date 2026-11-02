import type {
  DeviceCheckAttempt,
  DeviceCheckDefinition,
  DeviceDiagnosticsReport,
  SensorReading,
  DiagnosticIssue,
} from './device-check';
import type { ExecutionDefinition, ExecutionState, ExecutionCursor } from './execution';
import type { VoiceChoice } from './voice-clarification';

export type PreparationCheckId =
  'materials' | 'device' | 'powerOff' | 'wiring' | 'distance' | 'communication';

export interface PreparationRequirement {
  readonly id: PreparationCheckId;
  readonly title: string;
  readonly description: string;
  readonly guidance: string;
  readonly owner: 'operator' | 'system';
  readonly verifiedAt: 'S04' | 'S05';
  readonly requiredForDeviceCheck: boolean;
}

export interface ProcedureSnapshot {
  readonly procedureId: string;
  readonly version: string;
  readonly approval: 'approved';
  readonly title: string;
  readonly deviceId: string;
  readonly preparation: readonly PreparationRequirement[];
  readonly deviceCheck?: DeviceCheckDefinition;
  readonly execution?: ExecutionDefinition;
}

export interface PreparationCheck {
  readonly id: PreparationCheckId;
  readonly checked: boolean;
  readonly confirmedAt: string | null;
  readonly evidenceId: string | null;
}

export interface Evidence {
  readonly evidenceId: string;
  readonly sessionId: string;
  readonly checkId?: PreparationCheckId;
  readonly kind: 'human' | 'program' | 'sensor';
  readonly actorId: string;
  readonly action:
    | 'confirmed'
    | 'revoked'
    | 'preparationCompleted'
    | 'deviceCheckPassed'
    | 'deviceCheckFailed'
    | 'executionStarted'
    | 'measurementConfirmed'
    | 'measurementAccepted'
    | 'voiceClarificationConfirmed'
    | 'voiceClarificationCancelled';
  readonly recordedAt: string;
  readonly source: 'mock' | 'api';
  readonly attemptId?: string;
  readonly sensorId?: string;
  readonly readings?: readonly SensorReading[];
  readonly issue?: DiagnosticIssue;
  readonly diagnostics?: DeviceDiagnosticsReport;
  readonly cursor?: ExecutionCursor;
  readonly commandId?: string;
  readonly voiceChoice?: VoiceChoice | 'cancel';
}

export interface WorkflowEvent {
  readonly eventId: string;
  readonly requestId: string;
  readonly type:
    | 'sessionCreated'
    | 'checkConfirmed'
    | 'checkRevoked'
    | 'preparationCompleted'
    | 'deviceCheckStarted'
    | 'deviceCheckPassed'
    | 'deviceCheckFailed'
    | 'executionStarted'
    | 'executionSampleRequested'
    | 'executionSampleReceived'
    | 'executionSampleRejected'
    | 'measurementAccepted'
    | 'voiceClarificationRequested'
    | 'voiceClarificationDismissed'
    | 'voiceClarificationResolved';
  readonly occurredAt: string;
  readonly evidenceId?: string;
  readonly checkId?: PreparationCheckId;
  readonly attemptId?: string;
  readonly cursor?: ExecutionCursor;
  readonly commandId?: string;
  readonly voiceChoice?: VoiceChoice | 'cancel';
}

export interface ExperimentSession {
  readonly sessionId: string;
  readonly operatorId: string;
  readonly source: 'mock' | 'api';
  readonly procedure: ProcedureSnapshot;
  readonly phase: 'preparing' | 'awaitingDeviceCheck' | 'readyToExecute' | 'running';
  readonly revision: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly checks: readonly PreparationCheck[];
  readonly evidence: readonly Evidence[];
  readonly events: readonly WorkflowEvent[];
  readonly deviceChecks: readonly DeviceCheckAttempt[];
  readonly execution?: ExecutionState;
}

export type WorkflowCommand =
  | {
      readonly type: 'setPreparationCheck';
      readonly checkId: PreparationCheckId;
      readonly checked: boolean;
    }
  | { readonly type: 'completePreparation' }
  | { readonly type: 'startDeviceCheck' }
  | { readonly type: 'startExecution' }
  | { readonly type: 'requestExecutionSample'; readonly cursorId: string }
  | {
      readonly type: 'completeExecutionStep';
      readonly cursorId: string;
      readonly sampleAttemptId: string;
    }
  | {
      readonly type: 'requestVoiceClarification';
      readonly cursorId: string;
      readonly utterance: string;
    }
  | { readonly type: 'dismissVoiceClarification'; readonly commandId: string }
  | {
      readonly type: 'resolveVoiceClarification';
      readonly commandId: string;
      readonly choice: VoiceChoice;
    };

export interface CommandContext {
  readonly requestId: string;
  readonly expectedRevision: number;
}

export type WorkflowErrorCode =
  | 'NOT_FOUND'
  | 'INVALID_PROCEDURE'
  | 'INVALID_STATE'
  | 'CHECK_NOT_EDITABLE'
  | 'PREPARATION_INCOMPLETE'
  | 'REVISION_CONFLICT'
  | 'REQUEST_CONFLICT';

export class WorkflowError extends Error {
  constructor(
    readonly code: WorkflowErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'WorkflowError';
  }
}
