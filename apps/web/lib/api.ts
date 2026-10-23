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
  token_type: string;
  setup_completed: boolean;
};

export const API_URL = (
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"
).replace(/\/+$/, "");

function extractMessage(data: unknown, fallback: string): string {
  if (!data || typeof data !== "object") return fallback;
  const detail = (data as { detail?: unknown }).detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail.map((d) => (typeof d === "string" ? d : d.msg ?? fallback)).join(", ");
  }
  return fallback;
}

// Auto-refresh token if 401/403 occurs
let refreshing: Promise<boolean> | null = null;
async function refreshAccessToken(): Promise<boolean> {
  if (!refreshing) {
    refreshing = (async () => {
      const rt = localStorage.getItem("refresh_token");
      if (!rt) return false;
      try {
        const res = await fetch(`${API_URL}/api/v1/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: rt }),
        });
        if (!res.ok) return false;
        const data = (await res.json()) as TokenResponse;
        saveTokens(data);
        return true;
      } catch {
        return false;
      }
    })().finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  auth = false,
  extraHeaders?: Record<string, string>
): Promise<T> {
  const makeCall = async (tokenOverride?: string | null) => {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (auth) {
      const token = tokenOverride !== undefined ? tokenOverride : localStorage.getItem("access_token");
      if (token) headers["Authorization"] = `Bearer ${token}`;
    }
    if (extraHeaders) Object.assign(headers, extraHeaders);

    return await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  };

  let res = await makeCall();

  // If unauthorized/forbidden, attempt refresh once
  if ((res.status === 401 || res.status === 403) && auth) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      res = await makeCall(localStorage.getItem("access_token"));
    }
  }

  if (!res.ok) {
    let message = "Something went wrong";
    try {
      message = extractMessage(await res.json(), message);
    } catch {}
    throw new ApiError(message, res.status);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export function apiGet<T>(path: string): Promise<T> {
  return request<T>("GET", path);
}

export function apiPost<T>(path: string, body: unknown): Promise<T> {
  return request<T>("POST", path, body);
}

export function authGet<T>(path: string): Promise<T> {
  return request<T>("GET", path, undefined, true);
}

export function authPost<T>(
  path: string,
  body?: unknown,
  extraHeaders?: Record<string, string>
): Promise<T> {
  return request<T>("POST", path, body, true, extraHeaders);
}

export function authPut<T>(path: string, body?: unknown): Promise<T> {
  return request<T>("PUT", path, body, true);
}

export function authPatch<T>(path: string, body?: unknown): Promise<T> {
  return request<T>("PATCH", path, body, true);
}

export function authDelete(path: string): Promise<void> {
  return request<void>("DELETE", path, undefined, true);
}

export async function authUpload<T>(path: string, file: Blob | File): Promise<T> {
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
      message = extractMessage(await res.json(), message);
    } catch {}
    throw new ApiError(message, res.status);
  }

  return res.json() as Promise<T>;
}

export async function authDownload(path: string, filename: string): Promise<void> {
  const token = localStorage.getItem("access_token");
  const res = await fetch(`${API_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new ApiError("Download failed", res.status);
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function authBlobUrl(path: string): Promise<string | null> {
  const token = localStorage.getItem("access_token");
  const res = await fetch(`${API_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) return null;
  return URL.createObjectURL(await res.blob());
}

export function saveTokens(t: TokenResponse) {
  localStorage.setItem("access_token", t.access_token);
  localStorage.setItem("refresh_token", t.refresh_token);
}

export function clearTokens() {
  localStorage.removeItem("access_token");
  localStorage.removeItem("refresh_token");
}