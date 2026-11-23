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

  return {
    async get(path: `/${string}`, signal?: AbortSignal): Promise<unknown> {
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
            headers,
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
    },
  };
}
