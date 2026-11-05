import { demoProcedureCatalog, type DemoProcedureEntry } from './demoProcedures';
import type { ProcedureDetail, ProcedureSummary } from './procedureModels';

export interface ProcedureSelection {
  procedureId: string;
  approvedVersion: string;
  environmentId: string;
}

/** Frontend boundary; this does not specify a server request/response contract. */
export interface ProcedureRepository {
  list: (environmentId: string) => Promise<readonly ProcedureSummary[]>;
  getDetail: (selection: ProcedureSelection) => Promise<ProcedureDetail | null>;
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
