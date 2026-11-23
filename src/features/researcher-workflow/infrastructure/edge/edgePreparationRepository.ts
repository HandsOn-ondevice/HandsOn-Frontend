import { EdgeApiError, type EdgeApi } from '@/lib/edgeApi';
import type { ProcedureSelection } from '@/features/procedures/procedureRepository';
import { createRequestId } from '../../application/request-id';

const workProfileId = 'kit-distance-v1';
const operatorId = 'operator-01';
const attempts = new WeakMap<EdgeApi, Map<string, string>>();

function selectionKey({ environmentId, procedureId, approvedVersion }: ProcedureSelection) {
  return JSON.stringify([environmentId, procedureId, approvedVersion]);
}

type SessionPayload = {
  sessionId?: unknown;
  procedure?: {
    procedureId?: unknown;
    title?: unknown;
    version?: unknown;
    preparation?: unknown;
  };
  checks?: unknown;
};

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function invalidResponse() {
  return new EdgeApiError({ kind: 'invalid-response' });
}

export async function startEdgePreparation(edge: EdgeApi, selection: ProcedureSelection) {
  const key = selectionKey(selection);
  const selectionAttempts = attempts.get(edge) ?? new Map<string, string>();
  attempts.set(edge, selectionAttempts);
  const requestId = selectionAttempts.get(key) ?? createRequestId();
  selectionAttempts.set(key, requestId);

  try {
    const session = (await edge.post(
      '/sessions',
      {
        requestId,
        procedureId: selection.procedureId,
        procedureVersion: selection.approvedVersion,
        workProfileId,
        operatorId,
      },
      requestId,
    )) as SessionPayload | null;
    if (
      !isText(session?.sessionId) ||
      session.procedure?.procedureId !== selection.procedureId ||
      session.procedure?.version !== selection.approvedVersion
    ) {
      throw invalidResponse();
    }
    return session.sessionId;
  } catch (error) {
    // A rejected request can be attempted again after the server-side cause is resolved.
    // An ambiguous outcome keeps its key so a replay can recover the original session.
    if (
      error instanceof EdgeApiError &&
      error.kind === 'server' &&
      [400, 401, 403, 404, 409, 422].includes(error.status ?? 0) &&
      selectionAttempts.get(key) === requestId
    ) {
      selectionAttempts.delete(key);
    }
    throw error;
  }
}

export function acknowledgeEdgePreparation(edge: EdgeApi, selection: ProcedureSelection) {
  attempts.get(edge)?.delete(selectionKey(selection));
}

type PreparationItem = { id: string; title: string; description: string };
type PreparationCheck = { id: string; checked: boolean };

function isPreparationItem(value: unknown): value is PreparationItem {
  const item = value as Partial<PreparationItem> | null;
  return isText(item?.id) && isText(item?.title) && typeof item?.description === 'string';
}

function isCheck(value: unknown): value is PreparationCheck {
  const check = value as Partial<PreparationCheck> | null;
  return isText(check?.id) && typeof check?.checked === 'boolean';
}

export async function getEdgePreparation(edge: EdgeApi, sessionId: string, signal: AbortSignal) {
  const session = (await edge.get(
    `/sessions/${encodeURIComponent(sessionId)}`,
    signal,
  )) as SessionPayload | null;
  const procedure = session?.procedure;
  if (
    session?.sessionId !== sessionId ||
    !isText(procedure?.title) ||
    !isText(procedure?.version) ||
    !Array.isArray(procedure.preparation) ||
    !procedure.preparation.every(isPreparationItem) ||
    !Array.isArray(session.checks) ||
    !session.checks.every(isCheck)
  ) {
    throw invalidResponse();
  }

  const checkedItems = new Set(session.checks.filter((check) => check.checked).map(({ id }) => id));
  return {
    title: procedure.title,
    version: procedure.version,
    items: procedure.preparation.map((item) => ({
      ...item,
      checked: checkedItems.has(item.id),
    })),
  };
}

export type EdgePreparation = Awaited<ReturnType<typeof getEdgePreparation>>;
