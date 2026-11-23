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
    | 'cleanupOutputStopped'
    | 'cleanupOutputFailed'
    | 'cleanupCheckConfirmed'
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
    | 'measurementCompleted'
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
    | 'cleanupOutputStopped'
    | 'cleanupCheckConfirmed'
    | 'cleanupConfirmed'
    | 'cleanupRevoked'
    | 'experimentFinished'
    | 'mockSubmissionRequested'
    | 'mockSubmissionFailed'
    | 'mockResultSubmitted'
    | 'resultSubmitted';
  readonly occurredAt: string;
  readonly evidenceId?: string;
  readonly checkId?: PreparationCheckId;
  readonly attemptId?: string;
  readonly cursor?: ExecutionCursor;
  readonly commandId?: string;
  readonly voiceChoice?: VoiceChoice | 'cancel';
  readonly cleanupCheckId?: CleanupCheckId;
  readonly resultId?: string;
}

export interface EdgeCleanupState {
  readonly attempts: readonly {
    readonly attemptId: string;
    readonly status: 'passed' | 'failed';
    readonly requestedAt: string;
    readonly completedAt: string;
    readonly validUntil: string;
    readonly bootId: string;
    readonly response: {
      readonly success: boolean;
      readonly state: 'off' | 'unknown' | 'on';
      readonly dataOrigin: 'simulation' | 'hardware';
    };
    readonly evidenceId: string;
    readonly issue?: DiagnosticIssue | null;
  }[];
  readonly checks: readonly {
    readonly id: CleanupCheckId;
    readonly checked: boolean;
    readonly confirmedAt: string | null;
    readonly evidenceId: string | null;
  }[];
  readonly deviceReleasedAt: string | null;
}

export type EdgeSubmission =
  | { readonly status: 'not_submitted'; readonly resultId: null; readonly submittedAt: null }
  | {
      readonly status: 'submitted';
      readonly sessionId: string;
      readonly resultId: string;
      readonly submittedAt: string;
    };

export interface ExperimentSession {
  readonly sessionId: string;
  readonly operatorId: string;
  readonly source: 'mock' | 'api';
  readonly dataOrigin?: 'simulation' | 'hardware';
  readonly workflowVersion?: '1.0' | '2.0';
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
    | 'awaitingCleanup'
    | 'readyToSubmit'
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
  readonly measurementCompletedAt?: string | null;
  readonly cleanup?: EdgeCleanupState | null;
  readonly submission?: EdgeSubmission | null;
  readonly resultId?: string | null;
  readonly submittedAt?: string | null;
}

export type WorkflowCommand =
  | {
      readonly type: 'requestReviewMeasurement';
      readonly conditionId: string;
      readonly trialIndex: number;
    }
  | { readonly type: 'startCleanup' }
  | { readonly type: 'retryCleanupOutput' }
  | { readonly type: 'requestCleanup' }
  | {
      readonly type: 'setCleanupCheck';
      readonly checkId: CleanupCheckId;
      readonly checked: boolean;
    }
  | { readonly type: 'finishExperiment' }
  | { readonly type: 'submitMockResult' }
  | { readonly type: 'submitResult' }
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
  | 'WORKFLOW_VERSION_REQUIRED'
  | 'CLEANUP_OUTPUT_FAILED'
  | 'CLEANUP_OUTPUT_REQUIRED'
  | 'CLEANUP_OUTPUT_EXPIRED'
  | 'CLEANUP_CHECK_ORDER'
  | 'CLEANUP_INCOMPLETE'
  | 'CLEANUP_CHECK_IRREVERSIBLE'
  | 'CLEANUP_DEVICE_RELEASED'
  | 'MEASUREMENTS_INCOMPLETE'
  | 'ALREADY_SUBMITTED'
  | 'OUTCOME_UNKNOWN'
  | 'EDGE_REJECTED';

export class WorkflowError extends Error {
  readonly session?: ExperimentSession;
  readonly resultId?: string;
  readonly replayed?: boolean;

  constructor(
    readonly code: WorkflowErrorCode,
    message: string,
    details?: { session?: ExperimentSession; resultId?: string; replayed?: boolean },
  ) {
    super(message);
    this.name = 'WorkflowError';
    this.session = details?.session;
    this.resultId = details?.resultId;
    this.replayed = details?.replayed;
  }
}
