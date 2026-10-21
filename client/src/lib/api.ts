import { clearAuthState, getAuthState, setAuthState } from './auth-storage';

const API_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:3001/api';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Set while a token refresh is in flight so parallel 401s share one refresh. */
let refreshPromise: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  const auth = getAuthState();
  if (!auth?.refreshToken) {
    throw new ApiError(401, 'Session expired');
  }
  const res = await fetch(`${API_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: auth.refreshToken }),
  });
  if (!res.ok) {
    clearAuthState();
    throw new ApiError(401, 'Session expired');
  }
  const data = (await res.json()) as { accessToken: string; refreshToken: string; user: typeof auth.user };
  setAuthState({ accessToken: data.accessToken, refreshToken: data.refreshToken, user: data.user });
  return data.accessToken;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const doFetch = (token?: string) =>
    fetch(`${API_URL}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  let res = await doFetch(getAuthState()?.accessToken);

  // Access token expired: refresh once and retry (never for auth endpoints themselves).
  if (res.status === 401 && !path.startsWith('/auth/')) {
    refreshPromise ??= refreshAccessToken().finally(() => {
      refreshPromise = null;
    });
    try {
      const token = await refreshPromise;
      res = await doFetch(token);
    } catch (error) {
      throw error instanceof ApiError ? error : new ApiError(401, 'Session expired');
    }
  }

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const data = (await res.json()) as { error?: string; message?: string };
      message = data.error ?? data.message ?? message;
    } catch {
      /* non-JSON error body — keep default message */
    }
    throw new ApiError(res.status, message);
  }

  return (await res.json()) as T;
}

export function apiGet<T>(path: string): Promise<T> {
  return request<T>('GET', path);
}

export function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return request<T>('POST', path, body);
}

export function apiPut<T>(path: string, body?: unknown): Promise<T> {
  return request<T>('PUT', path, body);
}

export function apiPatch<T>(path: string, body?: unknown): Promise<T> {
  return request<T>('PATCH', path, body);
}

export function apiDelete<T>(path: string): Promise<T> {
  return request<T>('DELETE', path);
}

/** Fetches a raw file (e.g. NDJSON log download) with the current access token. */
export async function apiDownload(path: string): Promise<Blob> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { Authorization: `Bearer ${getAuthState()?.accessToken ?? ''}` },
  });
  if (!res.ok) {
    throw new ApiError(res.status, `Download failed (${res.status})`);
  }
  return res.blob();
}
