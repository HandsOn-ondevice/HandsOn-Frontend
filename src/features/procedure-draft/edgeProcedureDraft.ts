import { createRequestId } from '@/features/researcher-workflow/application/request-id';
import { createEdgeApi, EdgeApiError, getEdgeBaseUrl } from '@/lib/edgeApi';
import type { ProcedureDraft, ProcedureDraftRepository } from './procedureDraftRepository';

export interface EdgeDraftExecution {
  readonly conditions: readonly { id: string; label: string; repetitions: number }[];
  readonly distanceMinCm: number;
  readonly distanceMaxCm: number;
  readonly lightMinRaw: number;
  readonly settlingSeconds: number;
  readonly staleAfterMs: number;
  readonly checkValidityMs: number;
}

export interface EdgeDraftMetadata {
  readonly environmentId: string;
  readonly revision: number;
  readonly execution: EdgeDraftExecution | null;
}

type EdgeDraft = ProcedureDraft & { readonly edge: EdgeDraftMetadata };
type ApprovedDraft = { id: string; version: string; approvedBy: string };
type CreateDraftInput = {
  requestId: string;
  environmentId: string;
  title: string;
  transcript: string;
  recordingId?: string;
};

function invalidResponse(): never {
  throw new EdgeApiError({ kind: 'invalid-response' });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isRevision(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isExecution(value: unknown): value is EdgeDraftExecution {
  if (!isRecord(value)) return false;
  const { conditions, distanceMinCm, distanceMaxCm, lightMinRaw, settlingSeconds } = value;
  return (
    Array.isArray(conditions) &&
    conditions.length > 0 &&
    conditions.every(
      (condition: unknown) =>
        isRecord(condition) &&
        typeof condition.id === 'string' &&
        typeof condition.label === 'string' &&
        isRevision(condition.repetitions) &&
        condition.repetitions > 0,
    ) &&
    Number.isFinite(distanceMinCm) &&
    Number.isFinite(distanceMaxCm) &&
    Number.isSafeInteger(lightMinRaw) &&
    Number.isFinite(settlingSeconds) &&
    Number.isSafeInteger(value.staleAfterMs) &&
    Number.isSafeInteger(value.checkValidityMs)
  );
}

function executionFields(execution: EdgeDraftExecution): EdgeDraftExecution {
  const {
    conditions,
    distanceMinCm,
    distanceMaxCm,
    lightMinRaw,
    settlingSeconds,
    staleAfterMs,
    checkValidityMs,
  } = execution;
  return {
    conditions: conditions.map(({ id, label, repetitions }) => ({ id, label, repetitions })),
    distanceMinCm,
    distanceMaxCm,
    lightMinRaw,
    settlingSeconds,
    staleAfterMs,
    checkValidityMs,
  };
}

function parseDraft(value: unknown): EdgeDraft {
  if (!isRecord(value)) return invalidResponse();
  const {
    id,
    procedureId,
    title,
    description,
    version,
    status,
    environmentId,
    revision,
    materials,
    precautions,
    pendingItems,
    execution,
    savedAt,
  } = value;

  if (
    typeof id !== 'string' ||
    !id ||
    id !== procedureId ||
    typeof title !== 'string' ||
    typeof description !== 'string' ||
    typeof version !== 'string' ||
    status !== 'draft' ||
    typeof environmentId !== 'string' ||
    !isRevision(revision) ||
    !Array.isArray(value.steps) ||
    !isStringList(materials) ||
    !isStringList(precautions) ||
    !isStringList(pendingItems) ||
    (execution !== null && !isExecution(execution)) ||
    typeof savedAt !== 'string' ||
    !Number.isFinite(Date.parse(savedAt))
  ) {
    return invalidResponse();
  }

  const steps = value.steps.map((step: unknown) => {
    if (!isRecord(step)) return invalidResponse();
    const { id, title, description, needsReview } = step;
    if (
      typeof id !== 'string' ||
      typeof title !== 'string' ||
      typeof description !== 'string' ||
      typeof needsReview !== 'boolean'
    ) {
      return invalidResponse();
    }
    return { id, title, description, needsReview };
  });

  return {
    id,
    title,
    description,
    version,
    status,
    steps,
    materials,
    precautions,
    pendingItems: pendingItems.map((label, index) => ({ id: `edge-pending-${index}`, label })),
    savedAt,
    edge: { environmentId, revision, execution: execution && executionFields(execution) },
  };
}

function parseApproval(value: unknown, draftId: string) {
  if (!isRecord(value)) return invalidResponse();
  const { approval, procedureId, version, approvedBy, draftRevision } = value;
  if (
    approval !== 'approved' ||
    procedureId !== draftId ||
    typeof version !== 'string' ||
    !version ||
    typeof approvedBy !== 'string' ||
    !isRevision(draftRevision)
  ) {
    return invalidResponse();
  }
  return { approved: { id: draftId, version, approvedBy }, draftRevision };
}

function draftPath(id: string): `/procedures/${string}/draft` {
  return `/procedures/${encodeURIComponent(id)}/draft`;
}

function isMissing(error: unknown) {
  return error instanceof EdgeApiError && error.status === 404;
}

export function isEdgeProcedureDraft(draft: ProcedureDraft): draft is EdgeDraft {
  return draft.edge !== undefined;
}

export function isDraftRevisionConflict(error: unknown) {
  return error instanceof EdgeApiError && error.code === 'REVISION_CONFLICT';
}

// A network or invalid-response error can occur after the server commits the write.
// Keep the ID with the matching payload so a UI retry receives the same outcome.
const pendingWrites = new Map<string, string>();

async function writeDraft<Result>(
  { baseUrl, token }: { baseUrl?: string; token?: string },
  method: 'POST' | 'PATCH',
  path: `/procedures/${string}`,
  payload: object,
  parse: (value: unknown) => Result,
): Promise<Result> {
  const key = JSON.stringify([baseUrl, method, path, payload]);
  const requestId = pendingWrites.get(key) ?? createRequestId();
  pendingWrites.set(key, requestId);
  try {
    const edge = createEdgeApi({ baseUrl, token });
    const result = parse(await edge.write(method, path, { requestId, ...payload }));
    pendingWrites.delete(key);
    return result;
  } catch (error) {
    // Authentication failures leave earlier writes made with valid credentials unresolved.
    if (
      error instanceof EdgeApiError &&
      (error.kind === 'configuration' ||
        (error.status !== undefined &&
          error.status < 500 &&
          error.status !== 401 &&
          error.status !== 403))
    ) {
      pendingWrites.delete(key);
    }
    throw error;
  }
}

export function createEdgeDraftRepository(
  baseUrl: string,
  token?: string,
): ProcedureDraftRepository {
  const edge = () => createEdgeApi({ baseUrl, token });
  return {
    async load(environmentId, draftId) {
      try {
        const draft = parseDraft(await edge().get(draftPath(draftId)));
        if (draft.id !== draftId || draft.edge.environmentId !== environmentId) {
          return invalidResponse();
        }
        return draft;
      } catch (error) {
        if (isMissing(error)) return null;
        throw error;
      }
    },
    async save(environmentId, draft) {
      if (!isEdgeProcedureDraft(draft) || draft.edge.environmentId !== environmentId) {
        throw new Error('작업 환경의 초안을 다시 불러와 주세요.');
      }
      const { execution, revision } = draft.edge;
      if (!execution) throw new Error('실행 기준을 먼저 입력해 주세요.');

      const payload = {
        expectedRevision: revision,
        steps: draft.steps.map(({ id, title, description, needsReview }) => ({
          id,
          title,
          description,
          needsReview,
        })),
        pendingItems: draft.pendingItems.map(({ label }) => label),
        execution: executionFields(execution),
      };
      return writeDraft({ baseUrl, token }, 'PATCH', draftPath(draft.id), payload, (value) => {
        const saved = parseDraft(value);
        if (
          saved.id !== draft.id ||
          saved.edge.environmentId !== environmentId ||
          saved.edge.revision !== revision + 1
        ) {
          return invalidResponse();
        }
        return saved;
      });
    },
    async saveStepCriteria() {
      throw new Error('Edge 초안의 실행 기준은 초안 편집 화면에서 저장해 주세요.');
    },
    async listSaved(environmentId) {
      const value = await edge().get('/procedures/drafts');
      if (!Array.isArray(value)) return invalidResponse();
      return value.map(parseDraft).filter(({ edge }) => edge.environmentId === environmentId);
    },
  };
}

export async function createEdgeProcedureDraft(
  { requestId, environmentId, title, transcript, recordingId }: CreateDraftInput,
  token?: string,
) {
  const edge = createEdgeApi({ baseUrl: getEdgeBaseUrl(), token });
  const value = await edge.write('POST', '/procedures/drafts', {
    requestId,
    title,
    confirmedText: transcript,
    environmentId,
    ...(recordingId ? { recordingId } : {}),
  });
  const draft = parseDraft(value);
  if (draft.edge.environmentId !== environmentId) return invalidResponse();
  return draft;
}

export async function loadEdgeProcedureApproval(
  draft: ProcedureDraft,
  token?: string,
): Promise<ApprovedDraft | null> {
  if (!isEdgeProcedureDraft(draft)) return null;
  const edge = createEdgeApi({ baseUrl: getEdgeBaseUrl(), token });
  try {
    const body = await edge.get(`/procedures/${encodeURIComponent(draft.id)}`);
    const { approved, draftRevision } = parseApproval(body, draft.id);
    return draft.edge.revision === draftRevision ? approved : null;
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
}

export async function approveEdgeProcedureDraft(
  draft: ProcedureDraft,
  reason: string,
  token?: string,
) {
  if (!isEdgeProcedureDraft(draft)) throw new Error('작업 환경의 초안을 다시 불러와 주세요.');
  const expectedRevision = draft.edge.revision;
  return writeDraft(
    { baseUrl: getEdgeBaseUrl(), token },
    'POST',
    `/procedures/${encodeURIComponent(draft.id)}/approve`,
    { expectedRevision, reason: reason.trim() },
    (value) => {
      const { approved, draftRevision } = parseApproval(value, draft.id);
      if (draftRevision !== expectedRevision) return invalidResponse();
      return approved;
    },
  );
}
