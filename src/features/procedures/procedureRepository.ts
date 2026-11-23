import { EdgeApiError, type EdgeApi } from '@/lib/edgeApi';
import { demoProcedureCatalog, type DemoProcedureEntry } from './demoProcedures';
import type { ProcedureDetail, ProcedureSummary } from './procedureModels';

export interface ProcedureSelection {
  procedureId: string;
  approvedVersion: string;
  environmentId: string;
}

export interface ProcedureRepository {
  list: (environmentId: string) => Promise<readonly ProcedureSummary[]>;
  getDetail: (selection: ProcedureSelection) => Promise<ProcedureDetail | null>;
}

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

export function createEdgeProcedureRepository(edge: Pick<EdgeApi, 'get'>): ProcedureRepository {
  return {
    async list(environmentId) {
      const response = await edge.get(
        `/procedures?environmentId=${encodeURIComponent(environmentId)}`,
      );
      if (!Array.isArray(response)) throw new EdgeApiError({ kind: 'invalid-response' });
      return response
        .map((item) => readProcedure(item, environmentId)?.summary)
        .filter((item) => item !== undefined);
    },
    async getDetail({ procedureId, approvedVersion, environmentId }) {
      let response: unknown;
      try {
        response = await edge.get(
          `/procedures/${encodeURIComponent(procedureId)}?version=${encodeURIComponent(approvedVersion)}`,
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
      return {
        ...summary,
        conditions: readItems(value.conditions, isCondition),
        equipment: readItems(value.equipment, isText),
        criteria: readItems(value.criteria, isCriterion),
        steps: readItems(value.steps, isText),
        precautions: readItems(value.precautions, isText),
      };
    },
  };
}

function toSummary(detail: ProcedureDetail): ProcedureSummary {
  return {
    id: detail.id,
    code: detail.code,
    title: detail.title,
    description: detail.description,
    approvedVersion: detail.approvedVersion,
    approvedBy: detail.approvedBy,
    estimatedMinutes: detail.estimatedMinutes,
    stepCount: detail.stepCount,
    category: detail.category,
    lastUsedAt: detail.lastUsedAt,
  };
}

export function createDemoProcedureRepository(
  catalog: readonly DemoProcedureEntry[] = demoProcedureCatalog,
): ProcedureRepository {
  function isExecutable(entry: DemoProcedureEntry, environmentId: string) {
    return entry.status === 'approved' && entry.environmentIds.includes(environmentId);
  }

  return {
    list: async (environmentId) =>
      catalog
        .filter((entry) => isExecutable(entry, environmentId))
        .map(({ detail }) => toSummary(detail)),
    getDetail: async ({ procedureId, approvedVersion, environmentId }) =>
      catalog.find(
        (entry) =>
          isExecutable(entry, environmentId) &&
          entry.detail.id === procedureId &&
          entry.detail.approvedVersion === approvedVersion,
      )?.detail ?? null,
  };
}

const demoRepository = createDemoProcedureRepository();

function requireDemoSource() {
  if (__DEV__ || process.env.EXPO_PUBLIC_HANDSON_MAESTRO === '1') return;
  throw new Error('절차 API가 아직 연결되지 않았습니다.');
}

export const procedureRepository: ProcedureRepository = {
  list: async (environmentId) => {
    requireDemoSource();
    return demoRepository.list(environmentId);
  },
  getDetail: async (selection) => {
    requireDemoSource();
    return demoRepository.getDetail(selection);
  },
};
