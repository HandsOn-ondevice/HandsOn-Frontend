/** Screen models. API response mapping is supplied by the procedure repository. */
export interface ProcedureSummary {
  id: string;
  code: string;
  title: string;
  description: string;
  approvedVersion: string;
  approvedBy: string;
  estimatedMinutes: number;
  stepCount: number;
  category: 'led' | 'sensor';
  lastUsedAt?: string;
}

export interface ProcedureDetail extends ProcedureSummary {
  conditions: readonly { label: string; repetitions: number }[];
  equipment: readonly string[];
  criteria: readonly { title: string; description: string }[];
  steps: readonly string[];
  precautions: readonly string[];
}

export type ProcedureLookup<T> =
  { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: T };
