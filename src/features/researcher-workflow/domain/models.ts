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
  readonly action: 'confirmed' | 'revoked' | 'preparationCompleted';
  readonly recordedAt: string;
  readonly source: 'mock' | 'api';
}

export interface WorkflowEvent {
  readonly eventId: string;
  readonly requestId: string;
  readonly type: 'sessionCreated' | 'checkConfirmed' | 'checkRevoked' | 'preparationCompleted';
  readonly occurredAt: string;
  readonly evidenceId?: string;
  readonly checkId?: PreparationCheckId;
}

export interface ExperimentSession {
  readonly sessionId: string;
  readonly operatorId: string;
  readonly source: 'mock' | 'api';
  readonly procedure: ProcedureSnapshot;
  readonly phase: 'preparing' | 'awaitingDeviceCheck';
  readonly revision: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly checks: readonly PreparationCheck[];
  readonly evidence: readonly Evidence[];
  readonly events: readonly WorkflowEvent[];
}

export type WorkflowCommand =
  | {
      readonly type: 'setPreparationCheck';
      readonly checkId: PreparationCheckId;
      readonly checked: boolean;
    }
  | { readonly type: 'completePreparation' };

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
