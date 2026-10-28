// Thin client for the Precon ERP API. The token lives in localStorage for now;
// moving to an httpOnly cookie is a later hardening step.

// Relative by default: the web server forwards /api/v1 to the API (next.config.ts rewrites).
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "/api/v1";
const TOKEN_KEY = "precon.accessToken";

export interface CurrentUser {
  id: string;
  email: string;
  fullName: string;
  role: { key: string; name: string };
  permissions: string[];
  modules: string[];
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function getToken(): string | null {
  return typeof window === "undefined" ? null : localStorage.getItem(TOKEN_KEY);
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const message = Array.isArray(body.message) ? body.message.join(", ") : body.message;
    throw new ApiError(response.status, message ?? response.statusText);
  }
  return response.status === 204 ? (undefined as T) : response.json();
}

export const apiPost = <T>(path: string, body?: unknown) =>
  api<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });

export const apiPatch = <T>(path: string, body: unknown) =>
  api<T>(path, { method: "PATCH", body: JSON.stringify(body) });

export const apiPut = <T>(path: string, body: unknown) =>
  api<T>(path, { method: "PUT", body: JSON.stringify(body) });

/** Builds "?a=1&b=2", skipping empty values. */
export function queryString(params: Record<string, string | number | undefined | null>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") search.set(key, String(value));
  }
  const s = search.toString();
  return s ? `?${s}` : "";
}

export async function login(email: string, password: string): Promise<CurrentUser> {
  const result = await apiPost<{ accessToken: string; user: CurrentUser }>("/auth/login", {
    email,
    password,
  });
  localStorage.setItem(TOKEN_KEY, result.accessToken);
  return result.user;
}

export function fetchCurrentUser(): Promise<CurrentUser> {
  return api<CurrentUser>("/auth/me");
}

export async function logout(): Promise<void> {
  try {
    await apiPost<void>("/auth/logout");
  } finally {
    localStorage.removeItem(TOKEN_KEY);
  }
}

/** POST a file (multipart/form-data, field "file") plus any text fields, and parse the JSON reply. */
export async function apiUpload<T>(path: string, file: File, fields: Record<string, string> = {}): Promise<T> {
  const token = getToken();
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) form.append(name, value);
  form.append("file", file);
  const response = await fetch(`${API_URL}${path}`, {
    method: "POST",
    body: form, // the browser sets the multipart Content-Type and boundary
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = Array.isArray(body.message) ? body.message.join(", ") : body.message;
    throw new ApiError(response.status, message ?? response.statusText);
  }
  return body as T;
}

/** GET a file with the user's token and save it in the browser. */
export async function apiDownload(path: string, fallbackName: string): Promise<void> {
  const token = getToken();
  const response = await fetch(`${API_URL}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!response.ok) throw new ApiError(response.status, response.statusText);
  const name = /filename="([^"]+)"/.exec(response.headers.get("Content-Disposition") ?? "")?.[1] ?? fallbackName;
  const url = URL.createObjectURL(await response.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
