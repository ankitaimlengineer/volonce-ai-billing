const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type TokenResponse = {
  access_token: string;
  refresh_token: string;
  token_type: string;
  setup_completed: boolean;
};

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  auth = false
): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (auth) {
    const token = localStorage.getItem("access_token");
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!res.ok) {
    let message = "Something went wrong";
    try {
      const data = await res.json();
      if (typeof data.detail === "string") message = data.detail;
      else if (Array.isArray(data.detail)) message = "Please check the entered details";
    } catch {}
    throw new ApiError(message, res.status);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export function apiPost<T>(path: string, body: unknown): Promise<T> {
  return request<T>("POST", path, body);
}

export function authGet<T>(path: string): Promise<T> {
  return request<T>("GET", path, undefined, true);
}

export function authPut<T>(path: string, body: unknown): Promise<T> {
  return request<T>("PUT", path, body, true);
}

export function authPost<T>(path: string, body?: unknown): Promise<T> {
  return request<T>("POST", path, body, true);
}

export async function authDelete(path: string): Promise<void> {
  await request<void>("DELETE", path, undefined, true);
}

export async function authUpload(path: string, file: File): Promise<void> {
  const token = localStorage.getItem("access_token");
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  if (!res.ok) {
    let message = "Upload failed";
    try {
      const data = await res.json();
      if (typeof data.detail === "string") message = data.detail;
    } catch {}
    throw new ApiError(message, res.status);
  }
}

// Images are private, so we fetch them with the token and show them as a blob URL
export async function authBlobUrl(path: string): Promise<string | null> {
  const token = localStorage.getItem("access_token");
  const res = await fetch(`${API_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) return null;
  return URL.createObjectURL(await res.blob());
}

// TEMPORARY: localStorage is only for development.
// We will move tokens to httpOnly cookies in a later step.
export function saveTokens(t: TokenResponse) {
  localStorage.setItem("access_token", t.access_token);
  localStorage.setItem("refresh_token", t.refresh_token);
}

export function clearTokens() {
  localStorage.removeItem("access_token");
  localStorage.removeItem("refresh_token");
}