// The existing Precon NestJS API. Same endpoints and users as the web dashboard.

const TIMEOUT_MS = 15_000;

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: { key: string; name: string };
  permissions: string[];
  modules: string[];
}

export interface LoginResult {
  accessToken: string;
  expiresAt: string;
  user: User;
}

/** status is 0 when the server couldn't be reached at all. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(baseUrl: string, path: string, init: { method?: string; token?: string; body?: unknown } = {}): Promise<T> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        Accept: 'application/json',
        ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: abort.signal,
    });
  } catch {
    throw new ApiError(0, `Can't reach the server at ${baseUrl}. Check the address and that this phone is on the right network.`);
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { message?: string | string[] };
    const message = Array.isArray(body.message) ? body.message.join(', ') : body.message;
    throw new ApiError(response.status, message ?? `The server answered with an error (${response.status})`);
  }
  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}

export const login = (baseUrl: string, email: string, password: string) =>
  request<LoginResult>(baseUrl, '/auth/login', { method: 'POST', body: { email, password } });

export const fetchMe = (baseUrl: string, token: string) => request<User>(baseUrl, '/auth/me', { token });

/** Makes the token stop working on the server. */
export const logout = (baseUrl: string, token: string) => request<void>(baseUrl, '/auth/logout', { method: 'POST', token });
