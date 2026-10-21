import { API_URL } from "./config";
import { clearTokens, getAccess, getRefresh, saveTokens } from "./storage";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export type TokenResponse = {
  access_token: string;
  refresh_token: string;
  setup_completed: boolean;
};

export type Me = {
  id: string;
  email: string;
  full_name: string;
  role: string;
  organization_id: string | null;
  setup_completed: boolean;
};

function message(data: unknown, fallback: string): string {
  const detail = (data as { detail?: unknown } | null)?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return "Please check the entered details";
  return fallback;
}

async function raw(method: string, path: string, body?: unknown, token?: string | null) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    return await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    throw new ApiError("Server sathe connect thayu nathi. Wi-Fi ane IP check karo.", 0);
  } finally {
    clearTimeout(timer);
  }
}

async function parse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = "Something went wrong";
    try {
      msg = message(await res.json(), msg);
    } catch {}
    throw new ApiError(msg, res.status);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// Uses the refresh token to get a new access token. Returns false if it fails.
let refreshing: Promise<boolean> | null = null;
async function refreshTokens(): Promise<boolean> {
  if (!refreshing) {
    refreshing = (async () => {
      const rt = await getRefresh();
      if (!rt) return false;
      const res = await raw("POST", "/api/v1/auth/refresh", { refresh_token: rt });
      if (!res.ok) return false;
      const t = (await res.json()) as TokenResponse;
      await saveTokens(t.access_token, t.refresh_token);
      return true;
    })().finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}

// Authenticated request: on 401 it refreshes once and retries
export async function authRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res = await raw(method, path, body, await getAccess());
  if (res.status === 401 && (await refreshTokens())) {
    res = await raw(method, path, body, await getAccess());
  }
  return parse<T>(res);
}

export async function login(email: string, password: string): Promise<TokenResponse> {
  const t = await parse<TokenResponse>(
    await raw("POST", "/api/v1/auth/login", { email: email.trim(), password })
  );
  await saveTokens(t.access_token, t.refresh_token);
  return t;
}

export const getMe = () => authRequest<Me>("GET", "/api/v1/auth/me");

export async function logout() {
  const rt = await getRefresh();
  if (rt) {
    try {
      await raw("POST", "/api/v1/auth/logout", { refresh_token: rt });
    } catch {}
  }
  await clearTokens();
}
