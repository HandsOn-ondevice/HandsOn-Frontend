import { WorkflowError, type ExperimentSession, type WorkflowErrorCode } from '../../domain/models';
import { parseEdgeSession } from './edge-session';

type EdgeSessionPost =
  | { requestId?: string; body: string; timeoutMs?: number }
  | { heartbeat: true; signal?: AbortSignal };

export type EdgeSessionRequest = (
  path: `/sessions${string}`,
  post?: EdgeSessionPost,
) => Promise<{ body: unknown; replayed: boolean }>;

class EdgeSessionHttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
    readonly replay: string | null,
  ) {
    super('Edge session request failed');
  }
}

export function createEdgeSessionRequest(baseUrl: string, token?: string): EdgeSessionRequest {
  return async (path, post) => {
    const origin = parseOrigin(baseUrl);
    const controller = new AbortController();
    const abort = () => controller.abort();
    const abortSignal = post && 'heartbeat' in post ? post.signal : undefined;
    const write = post && 'body' in post ? post : undefined;
    if (abortSignal?.aborted) abort();
    abortSignal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(abort, write?.timeoutMs ?? 10_000);
    try {
      const headers: Record<string, string> = { Accept: 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;
      if (write) {
        headers['Content-Type'] = 'application/json';
        if (write.requestId) headers['Idempotency-Key'] = write.requestId;
      }
      const response = await fetch(`${origin}/api/v1${path}`, {
        method: post ? 'POST' : 'GET',
        credentials: 'omit',
        headers,
        body: write?.body,
        signal: controller.signal,
      });
      const replay = response.headers.get('X-Idempotent-Replay');
      if (!response.ok) {
        throw new EdgeSessionHttpError(
          response.status,
          await response.json().catch(() => null),
          replay,
        );
      }
      return { body: await response.json(), replayed: replay === 'true' };
    } finally {
      clearTimeout(timer);
      abortSignal?.removeEventListener('abort', abort);
    }
  };
}

function parseOrigin(baseUrl: string) {
  try {
    const url = new URL(baseUrl);
    if (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      url.pathname === '/' &&
      !url.search &&
      !url.hash &&
      !url.username &&
      !url.password
    ) {
      return url.origin;
    }
  } catch {
    // Invalid URLs use the same message as unsupported URL components.
  }
  throw new EdgeConfigurationError();
}

class EdgeConfigurationError extends WorkflowError {
  constructor() {
    super('EDGE_REJECTED', 'Edge 서버 주소를 확인해 주세요.');
  }
}

function outcomeUnknown(error: unknown) {
  if (error instanceof EdgeConfigurationError) return false;
  if (error instanceof WorkflowError && error.code === 'WORKFLOW_VERSION_REQUIRED') return false;
  return !(error instanceof EdgeSessionHttpError) || (error.status >= 500 && error.replay === null);
}

const edgeErrorCodes = [
  'REVISION_CONFLICT',
  'REQUEST_CONFLICT',
  'CHECK_NOT_EDITABLE',
  'INVALID_STATE',
  'INVALID_PROCEDURE',
  'PREPARATION_INCOMPLETE',
  'WORKFLOW_VERSION_REQUIRED',
  'CLEANUP_OUTPUT_FAILED',
  'CLEANUP_OUTPUT_REQUIRED',
  'CLEANUP_OUTPUT_EXPIRED',
  'CLEANUP_CHECK_ORDER',
  'CLEANUP_INCOMPLETE',
  'CLEANUP_CHECK_IRREVERSIBLE',
  'CLEANUP_DEVICE_RELEASED',
  'MEASUREMENTS_INCOMPLETE',
  'ALREADY_SUBMITTED',
] as const satisfies readonly WorkflowErrorCode[];

function toWorkflowError(reason: unknown, sessionId?: string) {
  if (reason instanceof WorkflowError) return reason;
  if (!(reason instanceof EdgeSessionHttpError)) {
    return new WorkflowError(
      'EDGE_REJECTED',
      'Edge에 연결하지 못했어요. 연결 상태를 확인해 주세요.',
    );
  }

  const { status, body } = reason;
  const payload = body as {
    session?: unknown;
    error?: { code?: unknown; message?: unknown; details?: { resultId?: unknown } };
  } | null;
  const error = payload?.error;
  if (status === 401 || status === 403)
    return new WorkflowError('EDGE_REJECTED', 'Edge 접근 권한을 확인해 주세요.');
  const message =
    typeof error?.message === 'string'
      ? error.message
      : 'Edge가 요청을 처리하지 못했어요. 다시 시도해 주세요.';
  const code = edgeErrorCodes.find((candidate) => candidate === error?.code);
  let session: ExperimentSession | undefined;
  if (sessionId && payload?.session !== undefined) {
    try {
      session = parseEdgeSession(payload.session, sessionId);
    } catch {
      // The caller can recover from an invalid error snapshot using a fresh GET.
    }
  }
  const resultId =
    code === 'ALREADY_SUBMITTED' && typeof error?.details?.resultId === 'string'
      ? error.details.resultId
      : undefined;
  return new WorkflowError(code ?? (status === 404 ? 'NOT_FOUND' : 'EDGE_REJECTED'), message, {
    session,
    resultId,
    replayed: reason.replay === 'true',
  });
}

export async function readEdgeSession(request: EdgeSessionRequest, path: `/sessions${string}`) {
  try {
    return (await request(path)).body;
  } catch (reason) {
    throw toWorkflowError(reason);
  }
}

export async function postEdgeVoiceText(
  request: EdgeSessionRequest,
  sessionId: string,
  text: string,
) {
  try {
    return (
      await request(`/sessions/${encodeURIComponent(sessionId)}/voice/interpret`, {
        body: JSON.stringify({ text }),
        // The Edge agent can take up to 15 seconds before returning a fallback.
        timeoutMs: 20_000,
      })
    ).body;
  } catch (reason) {
    throw toWorkflowError(reason);
  }
}

export async function writeEdgeSession(
  request: EdgeSessionRequest,
  path: `/sessions${string}`,
  payload: { requestId: string },
  parse: (value: unknown) => ExperimentSession,
  options: { sessionId?: string; retryUnknown?: boolean } = {},
) {
  const write = { requestId: payload.requestId, body: JSON.stringify(payload) };
  for (let attempt = 0; ; attempt += 1) {
    try {
      const { body, replayed } = await request(path, write);
      return { session: parse(body), replayed };
    } catch (reason) {
      if (!outcomeUnknown(reason)) throw toWorkflowError(reason, options.sessionId);
      if (attempt === 1 || options.retryUnknown === false) {
        throw new WorkflowError(
          'OUTCOME_UNKNOWN',
          'Edge의 응답을 확인하지 못했어요. 같은 요청을 다시 시도해 주세요.',
        );
      }
    }
  }
}
