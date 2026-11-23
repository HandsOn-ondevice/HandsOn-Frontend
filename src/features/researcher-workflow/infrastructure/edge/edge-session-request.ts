import { WorkflowError, type ExperimentSession } from '../../domain/models';

export type EdgeSessionRequest = (
  path: `/sessions${string}`,
  write?: { requestId?: string; body: string; timeoutMs?: number },
) => Promise<{ body: unknown; replayed: boolean }>;

class EdgeSessionHttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
    readonly stored: boolean,
  ) {
    super('Edge session request failed');
  }
}

export function createEdgeSessionRequest(baseUrl: string, token?: string): EdgeSessionRequest {
  return async (path, write) => {
    const origin = parseOrigin(baseUrl);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), write?.timeoutMs ?? 10_000);
    try {
      const headers: Record<string, string> = { Accept: 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;
      if (write) {
        headers['Content-Type'] = 'application/json';
        if (write.requestId) headers['Idempotency-Key'] = write.requestId;
      }
      const response = await fetch(`${origin}/api/v1${path}`, {
        method: write ? 'POST' : 'GET',
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
          replay !== null,
        );
      }
      return { body: await response.json(), replayed: replay === 'true' };
    } finally {
      clearTimeout(timer);
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
  return !(error instanceof EdgeSessionHttpError) || (error.status >= 500 && !error.stored);
}

function toWorkflowError(reason: unknown) {
  if (reason instanceof WorkflowError) return reason;
  if (!(reason instanceof EdgeSessionHttpError)) {
    return new WorkflowError(
      'EDGE_REJECTED',
      'Edge에 연결하지 못했어요. 연결 상태를 확인해 주세요.',
    );
  }

  const { status, body } = reason;
  const error = (body as { error?: { code?: unknown; message?: unknown } } | null)?.error;
  if (status === 401 || status === 403)
    return new WorkflowError('EDGE_REJECTED', 'Edge 접근 권한을 확인해 주세요.');
  const message =
    typeof error?.message === 'string'
      ? error.message
      : 'Edge가 요청을 처리하지 못했어요. 다시 시도해 주세요.';
  if (
    error?.code === 'REVISION_CONFLICT' ||
    error?.code === 'REQUEST_CONFLICT' ||
    error?.code === 'CHECK_NOT_EDITABLE' ||
    error?.code === 'INVALID_STATE' ||
    error?.code === 'INVALID_PROCEDURE' ||
    error?.code === 'PREPARATION_INCOMPLETE'
  ) {
    return new WorkflowError(error.code, message);
  }
  if (status === 404) return new WorkflowError('NOT_FOUND', message);
  return new WorkflowError('EDGE_REJECTED', message);
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
) {
  const write = { requestId: payload.requestId, body: JSON.stringify(payload) };
  for (let attempt = 0; ; attempt += 1) {
    try {
      const { body, replayed } = await request(path, write);
      return { session: parse(body), replayed };
    } catch (reason) {
      if (!outcomeUnknown(reason)) throw toWorkflowError(reason);
      if (attempt === 1) {
        throw new WorkflowError(
          'OUTCOME_UNKNOWN',
          'Edge의 응답을 확인하지 못했어요. 같은 요청을 다시 시도해 주세요.',
        );
      }
    }
  }
}
