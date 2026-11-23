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

export function getEdgeBaseUrl() {
  return process.env.EXPO_PUBLIC_HANDSON_MAESTRO === '1'
    ? undefined
    : process.env.EXPO_PUBLIC_HANDSON_EDGE_BASE_URL?.trim() || undefined;
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
    // Invalid URLs use the same error as unsupported URL components.
  }
  throw new EdgeApiError({ kind: 'configuration' });
}

function readErrorCode(body: unknown) {
  const error = (body as { error?: { code?: unknown } } | null)?.error;
  return typeof error?.code === 'string' ? error.code : undefined;
}

type EdgePath = `/${string}`;
const REQUEST_TIMEOUT_MS = 10_000;

export function createEdgeApi({ baseUrl, token }: { baseUrl?: string; token?: string }) {
  const origin = parseOrigin(baseUrl);
  const baseHeaders: Record<string, string> = { Accept: 'application/json' };
  const bearerToken = token?.trim();
  if (bearerToken) baseHeaders.Authorization = `Bearer ${bearerToken}`;

  async function get(path: EdgePath, signal?: AbortSignal) {
    const controller = new AbortController();
    const abort = () => controller.abort();
    const timer = setTimeout(abort, REQUEST_TIMEOUT_MS);
    if (signal?.aborted) abort();
    signal?.addEventListener('abort', abort);

    try {
      let response: Response;
      try {
        response = await fetch(`${origin}/api/v1${path}`, {
          method: 'GET',
          credentials: 'omit',
          headers: baseHeaders,
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

  return { get };
}

export type EdgeApi = ReturnType<typeof createEdgeApi>;
