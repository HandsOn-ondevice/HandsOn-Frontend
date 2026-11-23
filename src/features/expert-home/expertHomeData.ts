import {
  getDemoProcedureDraftId,
  getProcedureDraftRepository,
  listDemoProcedureReleases,
  loadEdgeProcedureApproval,
  procedureDraftRepository,
} from '@/features/procedure-draft/procedureDraftRepository';
import { getDemoHomeReviews, type ReviewStatus } from '@/features/expert-review/reviewData';
import { getUnresolvedDraftItems } from '@/features/procedure-release/procedureReleaseRules';
import { demoLedProcedure } from '@/features/procedures/demoProcedures';
import { EdgeApiError, getEdge, isEdgeDataEnabled } from '@/lib/edgeApi';

export interface ExpertProcedure {
  readonly id: string;
  readonly title: string;
  readonly status: 'draft' | 'approved';
  readonly version: string;
  readonly updatedLabel: string;
  readonly summary: string;
  readonly detail?: string;
}

export interface ExpertResult {
  readonly id: string;
  readonly procedureId: string;
  readonly procedureTitle: string;
  readonly studentName: string;
  readonly deviceName: string;
  readonly status: ReviewStatus;
  readonly sessionId?: string;
  readonly approvedVersion?: string;
  readonly summary: string;
  readonly submittedLabel: string;
}

export type ExpertRecentWork = {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly updatedLabel: string;
} & (
  | { readonly kind: 'procedure'; readonly procedureId: string }
  | { readonly kind: 'result'; readonly resultId: string; readonly procedureId: string }
);

export interface ExpertHomeData {
  readonly dataOrigin?: 'simulation' | 'hardware';
  readonly displayName: string;
  readonly procedures: readonly ExpertProcedure[];
  readonly results: readonly ExpertResult[];
  readonly recentWork: readonly ExpertRecentWork[];
}

export type LoadExpertHome = (environmentId: string, edgeToken?: string) => Promise<ExpertHomeData>;

function createDemoHome(environmentId: string): ExpertHomeData {
  const procedureId = (name: string) => `${environmentId}:procedure:${name}`;
  const draftId = getDemoProcedureDraftId(environmentId);
  const { results, recentReviews } = getDemoHomeReviews(environmentId);

  return {
    displayName: '지연',
    procedures: [
      {
        id: draftId,
        title: 'LED 출력 특성 측정 초안',
        status: 'draft',
        version: 'v0.1',
        updatedLabel: '검토 대기',
        summary: '미확정 기준 3개',
        detail: '기준값 검토 필요',
      },
      {
        id: procedureId('led-output'),
        title: 'LED 출력 특성 측정',
        status: 'approved',
        version: 'v1.2',
        updatedLabel: '오늘 승인',
        summary: '16단계 · 준비물 7개',
      },
      {
        id: procedureId('i2c-sensor'),
        title: 'I2C 센서 수집 점검',
        status: 'approved',
        version: 'v1.0',
        updatedLabel: '어제 승인',
        summary: '센서 연결 · 측정값 확인',
      },
      {
        id: procedureId('power-check'),
        title: '전원 안정성 확인',
        status: 'approved',
        version: 'v1.1',
        updatedLabel: '2일 전 승인',
        summary: '전압 · 전류 확인',
      },
      {
        id: procedureId('environment-sensor'),
        title: '환경 센서 기준값 측정',
        status: 'approved',
        version: 'v1.0',
        updatedLabel: '3일 전 승인',
        summary: '온도 · 습도 측정',
      },
    ],
    results,
    recentWork: [
      ...recentReviews,
      {
        id: `${environmentId}:recent:draft`,
        kind: 'procedure',
        procedureId: draftId,
        title: 'LED 출력 특성 측정 초안',
        summary: '초안 편집',
        updatedLabel: '검토 대기',
      },
      {
        id: `${environmentId}:recent:review`,
        kind: 'result',
        resultId: `${environmentId}:result:led-m01`,
        procedureId: procedureId('led-output'),
        title: '이서준 · LED-M01',
        summary: '결과 검토 완료',
        updatedLabel: '어제',
      },
    ],
  };
}

export const loadExpertHome: LoadExpertHome = async (environmentId, edgeToken) => {
  if (!environmentId.trim()) throw new Error('작업 환경을 선택해 주세요.');
  if (isEdgeDataEnabled()) {
    const data = await getEdge<ExpertHomeData>('/home/expert', { environmentId }, edgeToken);
    if (
      typeof data?.displayName !== 'string' ||
      !Array.isArray(data.procedures) ||
      !data.procedures.every(
        (item) =>
          item &&
          typeof item.id === 'string' &&
          typeof item.title === 'string' &&
          typeof item.version === 'string' &&
          (item.status === 'draft' || item.status === 'approved'),
      ) ||
      !Array.isArray(data.results) ||
      !Array.isArray(data.recentWork)
    ) {
      throw new EdgeApiError({ kind: 'invalid-response' });
    }
    const approvedIds = new Set(
      data.procedures.filter(({ status }) => status === 'approved').map(({ id }) => id),
    );
    const draftsWithApproval = data.procedures.filter(
      ({ id, status }) => status === 'draft' && approvedIds.has(id),
    );
    if (draftsWithApproval.length === 0) return data;

    // The home response includes the draft after publishing. Compare revisions before hiding it.
    const drafts = getProcedureDraftRepository(edgeToken);
    const publications = await Promise.allSettled(
      draftsWithApproval.map(async ({ id }) => {
        const draft = await drafts.load(environmentId, id);
        return draft && (await loadEdgeProcedureApproval(draft, edgeToken)) ? id : undefined;
      }),
    );
    const publishedIds = new Set(
      publications.flatMap((result) =>
        result.status === 'fulfilled' && result.value ? [result.value] : [],
      ),
    );
    return {
      ...data,
      procedures: data.procedures.filter(
        ({ id, status }) => status !== 'draft' || !publishedIds.has(id),
      ),
    };
  }
  if (__DEV__ || process.env.EXPO_PUBLIC_HANDSON_MAESTRO === '1') {
    const demo = createDemoHome(environmentId);
    const savedDrafts = await procedureDraftRepository.listSaved(environmentId);
    const releases = listDemoProcedureReleases(environmentId);
    const replacedIds = new Set([
      ...savedDrafts.map(({ id }) => id),
      ...releases.map(({ draftId }) => draftId),
    ]);
    if (releases.some(({ procedure }) => procedure.id === demoLedProcedure.id)) {
      replacedIds.add(`${environmentId}:procedure:led-output`);
    }
    const approved = releases.map<ExpertProcedure>(({ procedure }) => ({
      id: procedure.id,
      title: procedure.title,
      status: 'approved',
      version: procedure.approvedVersion,
      updatedLabel: '승인·배포 완료',
      summary: `${procedure.stepCount}단계 · 준비물 ${procedure.equipment.length}개`,
    }));
    const savedProcedures = savedDrafts
      .filter(({ id }) => !releases.some(({ draftId }) => draftId === id))
      .map<ExpertProcedure>((draft) => {
        const pendingCount = getUnresolvedDraftItems(draft).length;
        return {
          id: draft.id,
          title: draft.title,
          status: draft.status,
          version: draft.version,
          updatedLabel: '임시 저장 완료',
          summary: `${draft.steps.length}단계 · 준비물 ${draft.materials.length}개`,
          detail: pendingCount ? `미확정 항목 ${pendingCount}개` : undefined,
        };
      });
    const latest = [...approved, ...savedProcedures];

    return {
      ...demo,
      procedures: [...latest, ...demo.procedures.filter((item) => !replacedIds.has(item.id))],
      recentWork: [
        ...latest.map<ExpertRecentWork>((procedure) => ({
          id: procedure.id,
          kind: 'procedure',
          procedureId: procedure.id,
          title: procedure.title,
          summary: procedure.status === 'approved' ? '승인·배포' : '초안 편집',
          updatedLabel: procedure.updatedLabel,
        })),
        ...demo.recentWork.filter(
          (item) => item.kind !== 'procedure' || !replacedIds.has(item.procedureId),
        ),
      ],
    };
  }
  throw new Error('숙련자 홈 조회가 아직 연결되지 않았습니다.');
};
