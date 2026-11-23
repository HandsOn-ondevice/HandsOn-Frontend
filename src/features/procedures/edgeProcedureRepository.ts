import { EdgeApiError, getEdge } from '@/lib/edgeApi';
import type { ProcedureDetail } from './procedureModels';
import type { ProcedureRepository } from './procedureRepository';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isCondition(value: unknown): value is ProcedureDetail['conditions'][number] {
  return (
    isRecord(value) && isText(value.label) && isCount(value.repetitions) && value.repetitions > 0
  );
}

function isCriterion(value: unknown): value is ProcedureDetail['criteria'][number] {
  return isRecord(value) && isText(value.title) && isText(value.description);
}

function readItems<T>(value: unknown, isItem: (item: unknown) => item is T): T[] {
  return Array.isArray(value) ? value.filter(isItem) : [];
}

function readApproved(value: unknown, environmentId: string): ProcedureDetail | null {
  if (
    !isRecord(value) ||
    !isText(value.procedureId) ||
    !isText(value.version) ||
    !isText(value.title) ||
    !isText(value.approval)
  ) {
    throw new EdgeApiError({ kind: 'invalid-response' });
  }
  if (value.approval !== 'approved' || value.environmentId !== environmentId) {
    return null;
  }

  const steps = readItems(value.steps, isText);
  const execution = isRecord(value.execution) ? value.execution : undefined;
  return {
    id: value.procedureId,
    code: isText(value.code) ? value.code : value.procedureId,
    title: value.title,
    approvedVersion: value.version,
    description: isText(value.description) ? value.description : undefined,
    approvedBy: isText(value.approvedBy) ? value.approvedBy : undefined,
    estimatedMinutes: isCount(value.estimatedMinutes) ? value.estimatedMinutes : null,
    stepCount: isCount(value.stepCount) ? value.stepCount : steps.length || undefined,
    category: value.category === 'led' || value.category === 'sensor' ? value.category : undefined,
    lastUsedAt: isText(value.lastUsedAt) ? value.lastUsedAt : undefined,
    conditions: readItems(execution?.conditions ?? value.conditions, isCondition),
    equipment: readItems(value.equipment, isText),
    criteria: readItems(value.criteria, isCriterion),
    steps,
    precautions: readItems(value.precautions, isText),
  };
}

export function createEdgeProcedureRepository(token?: string): ProcedureRepository {
  return {
    async list(environmentId) {
      const response = await getEdge<unknown>('/procedures', { environmentId }, token);
      if (!Array.isArray(response)) throw new EdgeApiError({ kind: 'invalid-response' });
      return response
        .map((item) => readApproved(item, environmentId))
        .filter((item) => item !== null);
    },
    async getDetail({ procedureId, approvedVersion, environmentId }) {
      let response: unknown;
      try {
        response = await getEdge<unknown>(
          `/procedures/${encodeURIComponent(procedureId)}`,
          { version: approvedVersion },
          token,
        );
      } catch (error) {
        if (error instanceof EdgeApiError && error.status === 404) return null;
        throw error;
      }

      const procedure = readApproved(response, environmentId);
      return procedure?.id === procedureId && procedure.approvedVersion === approvedVersion
        ? procedure
        : null;
    },
  };
}
