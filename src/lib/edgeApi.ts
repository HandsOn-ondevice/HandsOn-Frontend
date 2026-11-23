export const edgeBaseUrl = process.env.EXPO_PUBLIC_HANDSON_EDGE_BASE_URL?.trim();

export function isEdgeDataEnabled() {
  return Boolean(edgeBaseUrl) && process.env.EXPO_PUBLIC_HANDSON_MAESTRO !== '1';
}

export class EdgeApiError extends Error {
  constructor(
    readonly kind: 'configuration' | 'network' | 'server' | 'invalid-response',
    readonly status?: number,
  ) {
    super(kind);
    this.name = 'EdgeApiError';
  }
}

function getEdgeOrigin() {
  try {
    const url = new URL(edgeBaseUrl ?? '');
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
    // Invalid URLs are reported as configuration errors.
  }
  throw new EdgeApiError('configuration');
}

export async function getEdge<T>(
  path: `/${string}`,
  query?: Record<string, string>,
  token?: string,
): Promise<T> {
  const url = new URL(`/api/v1${path}`, getEdgeOrigin());
  for (const [name, value] of Object.entries(query ?? {})) url.searchParams.set(name, value);

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    let response: Response;
    try {
      response = await fetch(url.toString(), {
        method: 'GET',
        headers,
        credentials: 'omit',
        redirect: 'error',
        signal: controller.signal,
      });
    } catch {
      throw new EdgeApiError('network');
    }
    if (!response.ok) throw new EdgeApiError('server', response.status);
    try {
      return (await response.json()) as T;
    } catch {
      throw new EdgeApiError(controller.signal.aborted ? 'network' : 'invalid-response');
    }
  } finally {
    clearTimeout(timeout);
  }
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
