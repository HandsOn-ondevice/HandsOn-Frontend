type EdgeApiErrorInfo = {
  kind: 'configuration' | 'network' | 'server' | 'invalid-response';
  status?: number;
  code?: string;
};

export class EdgeApiError extends Error {
  readonly kind: EdgeApiErrorInfo['kind'];
  readonly status?: number;
  readonly code?: string;

  constructor({ kind, status, code }: EdgeApiErrorInfo) {
    super(kind);
    this.name = 'EdgeApiError';
    this.kind = kind;
    this.status = status;
    this.code = code;
  }
}

const REQUEST_TIMEOUT_MS = 10_000;

export function getEdgeBaseUrl() {
  if (process.env.EXPO_PUBLIC_HANDSON_MAESTRO === '1') return undefined;
  return process.env.EXPO_PUBLIC_HANDSON_EDGE_BASE_URL?.trim() || undefined;
}

function parseOrigin(baseUrl: string | undefined) {
  try {
    const url = new URL(baseUrl ?? '');
    if (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      url.host &&
      url.pathname === '/' &&
      !url.search &&
      !url.hash &&
      !url.username &&
      !url.password
    ) {
      return url.origin;
    }
  } catch {
    // Report invalid URLs and unsupported URL components as configuration errors.
  }
  throw new EdgeApiError({ kind: 'configuration' });
}

function readErrorCode(body: unknown) {
  const error = (body as { error?: { code?: unknown } } | null)?.error;
  return typeof error?.code === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/.test(error.code)
    ? error.code
    : undefined;
}

export function createEdgeApi({ baseUrl, token }: { baseUrl?: string; token?: string }) {
  const origin = parseOrigin(baseUrl);
  const headers: Record<string, string> = { Accept: 'application/json' };
  const bearerToken = token?.trim();
  if (bearerToken) headers.Authorization = `Bearer ${bearerToken}`;

  async function request(
    method: 'GET' | 'POST' | 'PATCH',
    path: `/${string}`,
    signal?: AbortSignal,
    payload?: { requestId: string },
  ): Promise<unknown> {
    const controller = new AbortController();
    const abort = () => controller.abort();
    const timer = setTimeout(abort, REQUEST_TIMEOUT_MS);
    if (signal?.aborted) abort();
    signal?.addEventListener('abort', abort);

    try {
      let response: Response;
      try {
        response = await fetch(`${origin}/api/v1${path}`, {
          method,
          credentials: 'omit',
          redirect: 'error',
          headers: payload
            ? {
                ...headers,
                'Content-Type': 'application/json',
                'Idempotency-Key': payload.requestId,
              }
            : headers,
          body: payload && JSON.stringify(payload),
          signal: controller.signal,
        });
      } catch {
        throw new EdgeApiError({ kind: 'network' });
      }

      let body: unknown;
      try {
        body = await response.json();
      } catch {
        if (response.ok) {
          throw new EdgeApiError({
            kind: controller.signal.aborted ? 'network' : 'invalid-response',
          });
        }
      }

      if (!response.ok) {
        throw new EdgeApiError({
          kind: 'server',
          status: response.status,
          code: readErrorCode(body),
        });
      }
      return body;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    }
  }

  function write<Payload extends { requestId: string }>(
    method: 'POST' | 'PATCH',
    path: `/${string}`,
    payload: Payload,
    signal?: AbortSignal,
  ) {
    return request(method, path, signal, payload);
  }

  return {
    get(path: `/${string}`, signal?: AbortSignal) {
      return request('GET', path, signal);
    },
    post<Payload extends { requestId: string }>(
      path: `/${string}`,
      payload: Payload,
      signal?: AbortSignal,
    ) {
      return write('POST', path, payload, signal);
    },
    write,
  };
}

export const edgeBaseUrl = process.env.EXPO_PUBLIC_HANDSON_EDGE_BASE_URL?.trim();

export function isEdgeDataEnabled() {
  return Boolean(edgeBaseUrl) && process.env.EXPO_PUBLIC_HANDSON_MAESTRO !== '1';
}

export async function getEdge<T>(
  path: `/${string}`,
  query?: Record<string, string>,
  token?: string,
): Promise<T> {
  const requestPath = query ? (`${path}?${new URLSearchParams(query)}` as const) : path;
  return (await createEdgeApi({ baseUrl: edgeBaseUrl, token }).get(requestPath)) as T;
}

export function getEdgeErrorMessage(error: unknown) {
  if (!(error instanceof EdgeApiError)) return undefined;
  if (error.status === 401 || error.status === 403) {
    return '선택한 역할의 Edge 접속 토큰을 확인해 주세요.';
  }
  switch (error.kind) {
    case 'configuration':
      return 'Edge 서버 주소를 확인해 주세요.';
    case 'network':
      return 'Edge 서버에 연결할 수 없어요.';
    case 'server':
      return `Edge 서버에서 조회하지 못했어요. (HTTP ${error.status})`;
    case 'invalid-response':
      return 'Edge 서버 응답을 읽을 수 없어요.';
  }
}
