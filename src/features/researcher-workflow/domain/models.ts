import type { ResumeCheckAttempt, ResumeCheckTarget } from './resume';
import type {
  DeviceCheckAttempt,
  DeviceCheckDefinition,
  DeviceDiagnosticsReport,
  SensorReading,
  DiagnosticIssue,
} from './device-check';
import type { ExecutionDefinition, ExecutionState, ExecutionCursor } from './execution';
import type { VoiceChoice } from './voice-clarification';
import type { CleanupCheckId, CompletionState } from './completion';

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
    | 'executionResumed'
    | 'resumeChecked'
    | 'resumeSetupConfirmed'
    | 'resumeSetupRevoked'
    | 'measurementConfirmed'
    | 'measurementAccepted'
    | 'voiceClarificationConfirmed'
    | 'voiceClarificationCancelled'
    | 'recoveryRequested'
    | 'recoveryChecked'
    | 'cleanupOutputConfirmed'
    | 'cleanupConfirmed'
    | 'cleanupRevoked'
    | 'experimentFinished'
    | 'mockResultSubmitted';
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
  readonly cleanupCheckId?: CleanupCheckId;
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
    | 'executionPaused'
    | 'resumeCheckRequested'
    | 'resumeCheckPassed'
    | 'resumeCheckFailed'
    | 'resumeSetupConfirmed'
    | 'resumeSetupRevoked'
    | 'executionResumed'
    | 'executionSampleRequested'
    | 'executionSampleReceived'
    | 'executionSampleRejected'
    | 'measurementAccepted'
    | 'voiceClarificationRequested'
    | 'voiceClarificationDismissed'
    | 'voiceClarificationResolved'
    | 'recoveryRequested'
    | 'recoveryFailed'
    | 'recoverySucceeded'
    | 'reviewMeasurementRequested'
    | 'cleanupStarted'
    | 'cleanupOutputRequested'
    | 'cleanupOutputConfirmed'
    | 'cleanupOutputFailed'
    | 'cleanupConfirmed'
    | 'cleanupRevoked'
    | 'experimentFinished'
    | 'mockSubmissionRequested'
    | 'mockSubmissionFailed'
    | 'mockResultSubmitted';
  readonly occurredAt: string;
  readonly evidenceId?: string;
  readonly checkId?: PreparationCheckId;
  readonly attemptId?: string;
  readonly cursor?: ExecutionCursor;
  readonly commandId?: string;
  readonly voiceChoice?: VoiceChoice | 'cancel';
  readonly cleanupCheckId?: CleanupCheckId;
}

export interface ExperimentSession {
  readonly sessionId: string;
  readonly operatorId: string;
  readonly source: 'mock' | 'api';
  readonly dataOrigin?: 'simulation' | 'hardware';
  readonly procedure: ProcedureSnapshot;
  readonly phase:
    | 'preparing'
    | 'awaitingDeviceCheck'
    | 'readyToExecute'
    | 'running'
    | 'paused'
    | 'held'
    | 'cancelled'
    | 'cleaningUp'
    | 'completed'
    | 'submitted';
  readonly revision: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly checks: readonly PreparationCheck[];
  readonly evidence: readonly Evidence[];
  readonly events: readonly WorkflowEvent[];
  readonly deviceChecks: readonly DeviceCheckAttempt[];
  readonly pendingJob?: { readonly kind: string; readonly attemptId: string } | null;
  readonly holdReason?: DiagnosticIssue | null;
  readonly execution?: ExecutionState;
  readonly resumeChecks?: readonly ResumeCheckAttempt[];
  readonly completion?: CompletionState;
}

export type WorkflowCommand =
  | {
      readonly type: 'requestReviewMeasurement';
      readonly conditionId: string;
      readonly trialIndex: number;
    }
  | { readonly type: 'startCleanup' }
  | { readonly type: 'retryCleanupOutput' }
  | {
      readonly type: 'setCleanupCheck';
      readonly checkId: CleanupCheckId;
      readonly checked: boolean;
    }
  | { readonly type: 'finishExperiment' }
  | { readonly type: 'submitMockResult' }
  | {
      readonly type: 'setPreparationCheck';
      readonly checkId: PreparationCheckId;
      readonly checked: boolean;
    }
  | { readonly type: 'completePreparation' }
  | { readonly type: 'startDeviceCheck' }
  | { readonly type: 'startExecution' }
  | { readonly type: 'pauseExecution'; readonly cursorId: string }
  | {
      readonly type: 'checkResume';
      readonly pauseEventId: string;
      readonly cursorId: string;
      readonly target: ResumeCheckTarget;
    }
  | {
      readonly type: 'confirmResumeSetup';
      readonly pauseEventId: string;
      readonly attemptId: string;
      readonly confirmed: boolean;
    }
  | { readonly type: 'resumeExecution'; readonly pauseEventId: string; readonly cursorId: string }
  | { readonly type: 'resumePausedExecution'; readonly cursorId: string }
  | { readonly type: 'requestExecutionSample'; readonly cursorId: string }
  | {
      readonly type: 'requestRecovery';
      readonly cursorId: string;
      readonly blockedAttemptId: string;
    }
  | {
      readonly type: 'requestRecoveryRemeasurement';
      readonly cursorId: string;
      readonly recoveryId: string;
    }
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
  | 'REQUEST_CONFLICT'
  | 'OUTCOME_UNKNOWN'
  | 'EDGE_REJECTED';

export class WorkflowError extends Error {
  constructor(
    readonly code: WorkflowErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'WorkflowError';
  }
}
