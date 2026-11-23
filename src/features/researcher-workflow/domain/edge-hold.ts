import type { ExperimentSession } from './models';

export interface EdgeHold {
  readonly holdId: string;
  readonly heldAt: string;
  readonly reasonCode: string;
  readonly bootId: string;
  readonly cursorId: string | null;
  readonly allowedCommands: readonly string[];
  readonly nextSampleCommand: 'requestExecutionSample' | 'requestRecoveryRemeasurement' | null;
  readonly requiresConfirmation: boolean;
  readonly confirmationValidityMs: number;
  readonly resolvedAt: string | null;
}

export interface ResumeConfirmation {
  readonly holdId: string;
  readonly cursorId: string | null;
  readonly conditionsConfirmed: true;
  readonly installationConfirmed: true;
  readonly confirmedAt: string;
}

export function currentEdgeHold(session: ExperimentSession | null | undefined) {
  const hold = session?.hold;
  if (session?.phase === 'held' && hold?.resolvedAt === null) return hold;
}
