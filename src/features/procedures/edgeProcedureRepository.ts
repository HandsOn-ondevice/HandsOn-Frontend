import { EdgeApiError, getEdge } from '@/lib/edgeApi';
import type { ProcedureDetail, ProcedureSummary } from './procedureModels';
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

function readProcedure(value: unknown, environmentId: string) {
  if (
    !isRecord(value) ||
    !isText(value.procedureId) ||
    !isText(value.version) ||
    !isText(value.title) ||
    !isText(value.approval)
  ) {
    throw new EdgeApiError({ kind: 'invalid-response' });
  }
  if (
    value.approval !== 'approved' ||
    (value.environmentId !== undefined && value.environmentId !== environmentId)
  ) {
    return null;
  }

  const summary: ProcedureSummary = {
    id: value.procedureId,
    code: isText(value.code) ? value.code : value.procedureId,
    title: value.title,
    approvedVersion: value.version,
    description: isText(value.description) ? value.description : undefined,
    approvedBy: isText(value.approvedBy) ? value.approvedBy : undefined,
    estimatedMinutes: isCount(value.estimatedMinutes) ? value.estimatedMinutes : undefined,
    stepCount: isCount(value.stepCount) ? value.stepCount : undefined,
    category: value.category === 'led' || value.category === 'sensor' ? value.category : undefined,
    lastUsedAt: isText(value.lastUsedAt) ? value.lastUsedAt : undefined,
  };
  return { summary, value };
}

export function createEdgeProcedureRepository(
  token?: string,
  read: typeof getEdge<unknown> = getEdge,
): ProcedureRepository {
  return {
    async list(environmentId) {
      const response = await read('/procedures', { environmentId }, token);
      if (!Array.isArray(response)) throw new EdgeApiError({ kind: 'invalid-response' });
      return response
        .map((item) => readProcedure(item, environmentId)?.summary)
        .filter((item) => item !== undefined);
    },
    async getDetail({ procedureId, approvedVersion, environmentId }) {
      let response: unknown;
      try {
        response = await read(
          `/procedures/${encodeURIComponent(procedureId)}`,
          { version: approvedVersion },
          token,
        );
      } catch (error) {
        if (error instanceof EdgeApiError && error.status === 404) return null;
        throw error;
      }
      const procedure = readProcedure(response, environmentId);
      if (
        procedure?.summary.id !== procedureId ||
        procedure.summary.approvedVersion !== approvedVersion
      ) {
        return null;
      }
      const { summary, value } = procedure;
      const execution = isRecord(value.execution) ? value.execution : undefined;
      return {
        ...summary,
        conditions: readItems(execution?.conditions ?? value.conditions, isCondition),
        equipment: readItems(value.equipment, isText),
        criteria: readItems(value.criteria, isCriterion),
        steps: readItems(value.steps, isText),
        precautions: readItems(value.precautions, isText),
      };
    },
  };
}
