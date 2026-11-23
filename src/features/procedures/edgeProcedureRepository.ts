import { EdgeApiError, getEdge } from '@/lib/edgeApi';
import type { ProcedureDetail } from './procedureModels';
import type { ProcedureRepository } from './procedureRepository';

type EdgeProcedure = Omit<ProcedureDetail, 'id' | 'approvedVersion'> & {
  procedureId: string;
  version: string;
  approval: 'approved';
  environmentId: string;
};

function toProcedure({ procedureId, version, ...details }: EdgeProcedure): ProcedureDetail {
  return { ...details, id: procedureId, approvedVersion: version };
}

export function createEdgeProcedureRepository(token?: string): ProcedureRepository {
  return {
    async list(environmentId) {
      const procedures = await getEdge<readonly EdgeProcedure[]>(
        '/procedures',
        { environmentId },
        token,
      );
      if (!Array.isArray(procedures)) throw new EdgeApiError({ kind: 'invalid-response' });
      return procedures
        .filter(
          (procedure) =>
            procedure.approval === 'approved' && procedure.environmentId === environmentId,
        )
        .map(toProcedure);
    },
    async getDetail({ procedureId, approvedVersion, environmentId }) {
      try {
        const procedure = await getEdge<EdgeProcedure>(
          `/procedures/${encodeURIComponent(procedureId)}`,
          { version: approvedVersion },
          token,
        );
        return procedure?.approval === 'approved' && procedure.environmentId === environmentId
          ? toProcedure(procedure)
          : null;
      } catch (error) {
        if (error instanceof EdgeApiError && error.status === 404) return null;
        throw error;
      }
    },
  };
}
