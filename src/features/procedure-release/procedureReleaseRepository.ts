import {
  findSavedDemoDraft,
  getDemoProcedureDraftId,
  recordDemoProcedureRelease,
  type ProcedureDraft,
} from '@/features/procedure-draft/procedureDraftRepository';
import { demoLedProcedure } from '@/features/procedures/demoProcedures';
import type { ProcedureDetail } from '@/features/procedures/procedureModels';
import { describeStepCriteria, getProcedureReleaseBlockers } from './procedureReleaseRules';

export class ProcedureReleaseRejected extends Error {}

interface ProcedureReleaseReview {
  draft: ProcedureDraft;
  blockers: readonly string[];
  proposedVersion: string | null;
  approverName: string;
  published: ProcedureDetail | null;
}

interface ProcedureReleaseInput {
  environmentId: string;
  draft: ProcedureDraft;
  reviewConfirmed: boolean;
  equipmentConfirmed: boolean;
}

/** Frontend boundary for review and publication of a saved draft. */
export interface ProcedureReleaseRepository {
  load(environmentId: string, draftId: string): Promise<ProcedureReleaseReview | null>;
  publish(input: ProcedureReleaseInput): Promise<ProcedureDetail>;
}

// These fixed responses stand in for server-assigned versions in development and Maestro.
function demoReleaseMetadata(environmentId: string, draftId: string) {
  if (draftId === getDemoProcedureDraftId(environmentId)) {
    return { id: demoLedProcedure.id, code: demoLedProcedure.code, approvedVersion: 'v1.3' };
  }
  if (draftId === getDemoProcedureDraftId(environmentId, 'generated')) {
    return { id: draftId, code: 'LED-DEMO', approvedVersion: 'v1.0' };
  }
  return null;
}

const approverName = demoLedProcedure.approvedBy;

export const procedureReleaseRepository: ProcedureReleaseRepository = {
  async load(environmentId, draftId) {
    const saved = findSavedDemoDraft(environmentId, draftId);
    if (!saved) return null;
    const { release, ...draft } = saved;
    const metadata = demoReleaseMetadata(environmentId, draftId);
    const blockers = getProcedureReleaseBlockers(draft);
    if (!metadata) blockers.push('배포할 모의 절차에 연결된 초안을 선택해 주세요.');

    return {
      draft,
      blockers,
      proposedVersion: metadata?.approvedVersion ?? null,
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

      const metadata = demoReleaseMetadata(environmentId, current.id);
      if (!metadata || getProcedureReleaseBlockers(current).length) {
        throw new ProcedureReleaseRejected('미확정 기준과 장비 확인을 먼저 완료해 주세요.');
      }

      return {
        ...metadata,
        title: current.title,
        description: current.description,
        approvedBy: approverName,
        estimatedMinutes: demoLedProcedure.estimatedMinutes,
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
