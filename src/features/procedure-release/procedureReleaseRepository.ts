import {
  approveEdgeProcedureDraft,
  findSavedDemoDraft,
  getDemoProcedureDraftId,
  getProcedureDraftRepository,
  isDraftRevisionConflict,
  loadEdgeProcedureApproval,
  procedureDraftRepository,
  recordDemoProcedureRelease,
  type ProcedureDraft,
} from '@/features/procedure-draft/procedureDraftRepository';
import { demoLedProcedure } from '@/features/procedures/demoProcedures';
import type { ProcedureDetail } from '@/features/procedures/procedureModels';
import { EdgeApiError } from '@/lib/edgeApi';
import { describeStepCriteria, getProcedureReleaseBlockers } from './procedureReleaseRules';

export class ProcedureReleaseRejected extends Error {}

export type ProcedureReleaseReceipt = Pick<
  ProcedureDetail,
  'id' | 'code' | 'approvedVersion' | 'approvedBy' | 'title'
>;

interface ProcedureReleaseReview<Receipt extends ProcedureReleaseReceipt> {
  draft: ProcedureDraft;
  blockers: readonly string[];
  proposedVersion: string | null;
  approverName: string | null;
  published: Receipt | null;
}

interface ProcedureReleaseInput {
  environmentId: string;
  draft: ProcedureDraft;
  reviewConfirmed: boolean;
  equipmentConfirmed: boolean;
  reason?: string;
}

/** Frontend boundary for review and publication of a saved draft. */
export interface ProcedureReleaseRepository<
  Receipt extends ProcedureReleaseReceipt = ProcedureDetail,
> {
  load(environmentId: string, draftId: string): Promise<ProcedureReleaseReview<Receipt> | null>;
  publish(input: ProcedureReleaseInput): Promise<Receipt>;
}

// These fixed responses stand in for server-assigned versions in development and Maestro.
function demoReleaseMetadata(environmentId: string, draftId: string) {
  if (draftId === getDemoProcedureDraftId(environmentId)) {
    return {
      id: demoLedProcedure.id,
      code: demoLedProcedure.code,
      approvedVersion: 'v1.3',
      estimatedMinutes: demoLedProcedure.estimatedMinutes,
    };
  }
  return { id: draftId, code: 'LED-DEMO', approvedVersion: 'v1.0', estimatedMinutes: null };
}

const approverName = demoLedProcedure.approvedBy;

export const procedureReleaseRepository: ProcedureReleaseRepository = {
  async load(environmentId, draftId) {
    const saved = findSavedDemoDraft(environmentId, draftId);
    if (!saved) return null;
    const { release, ...draft } = saved;
    const metadata = demoReleaseMetadata(environmentId, draftId);
    return {
      draft,
      blockers: getProcedureReleaseBlockers(draft),
      proposedVersion: metadata.approvedVersion,
      approverName,
      published: release ?? null,
    };
  },

  async publish({ environmentId, draft, reviewConfirmed, equipmentConfirmed }) {
    if (!reviewConfirmed || !equipmentConfirmed) {
      throw new ProcedureReleaseRejected('장비와 절차 검토를 모두 확인해 주세요.');
    }
    return recordDemoProcedureRelease(environmentId, draft.id, (saved) => {
      if (!saved) throw new ProcedureReleaseRejected('저장된 초안을 찾을 수 없어요.');

      const { release, ...current } = saved;
      if (JSON.stringify(draft) !== JSON.stringify(current)) {
        throw new ProcedureReleaseRejected('초안이 변경됐어요. 최신 초안을 다시 검토해 주세요.');
      }
      if (release) return release;

      if (getProcedureReleaseBlockers(current).length) {
        throw new ProcedureReleaseRejected('미확정 기준과 장비 확인을 먼저 완료해 주세요.');
      }

      return {
        ...demoReleaseMetadata(environmentId, current.id),
        title: current.title,
        description: current.description,
        approvedBy: approverName,
        category: 'led',
        stepCount: current.steps.length,
        conditions: [],
        equipment: current.materials,
        criteria: current.steps.flatMap((step) => describeStepCriteria(step) ?? []),
        steps: current.steps.map(({ title, description }) =>
          description.trim() ? `${title}\n${description}` : title,
        ),
        precautions: current.precautions,
      };
    });
  },
};

function edgeReceipt(
  draft: ProcedureDraft,
  result: Awaited<ReturnType<typeof approveEdgeProcedureDraft>>,
): ProcedureReleaseReceipt {
  return {
    id: result.id,
    code: result.id,
    title: draft.title,
    approvedVersion: result.version,
    approvedBy: result.approvedBy,
  };
}

export function getProcedureReleaseRepository(
  token?: string,
): ProcedureReleaseRepository<ProcedureReleaseReceipt> {
  const repository = getProcedureDraftRepository(token);
  if (repository === procedureDraftRepository) return procedureReleaseRepository;

  return {
    async load(environmentId, draftId) {
      const draft = await repository.load(environmentId, draftId);
      if (!draft?.edge) return null;
      const result = await loadEdgeProcedureApproval(draft, token);
      return {
        draft,
        blockers: getProcedureReleaseBlockers(draft),
        proposedVersion: null,
        approverName: null,
        published: result ? edgeReceipt(draft, result) : null,
      };
    },

    async publish({ draft, reviewConfirmed, equipmentConfirmed, reason }) {
      if (!reviewConfirmed || !equipmentConfirmed || !reason?.trim()) {
        throw new ProcedureReleaseRejected('장비와 절차를 확인하고 승인 사유를 입력해 주세요.');
      }

      try {
        return edgeReceipt(draft, await approveEdgeProcedureDraft(draft, reason.trim(), token));
      } catch (error) {
        if (isDraftRevisionConflict(error)) {
          throw new ProcedureReleaseRejected('초안이 변경됐어요. 최신 초안을 다시 검토해 주세요.');
        }
        if (error instanceof EdgeApiError && error.code === 'REVIEW_REQUIRED') {
          throw new ProcedureReleaseRejected('미확정 항목과 실행 기준을 먼저 검토해 주세요.');
        }
        throw error;
      }
    },
  };
}
