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

export type DashboardSummary = {
  date_from: string;
  date_to: string;
  sales: number | string;
  bills: number;
  collections: number | string;
  purchases: number | string;
  cogs: number | string;
  gross_profit: number | string;
  margin_percent: number | string;
  expenses: number | string;
  net_profit: number | string;
  receivable: number | string;
  payable: number | string;
  stock_value: number | string;
  low_stock: number;
  out_of_stock: number;
};

export type Product = {
  id: string;
  name: string;
  sku?: string;
  barcode?: string;
  selling_price: number | string;
  purchase_price: number | string;
  tax_rate?: number;
  unit?: string;
  current_stock?: number;
  is_active: boolean;
};

export type Customer = {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  current_balance?: number | string;
};

export type InvoiceItemCreate = {
  product_id: string;
  quantity: number;
  unit_price: number;
  tax_rate?: number;
  discount?: number;
};

export type InvoiceCreatePayload = {
  customer_id?: string;
  items: InvoiceItemCreate[];
  payment_mode?: "CASH" | "UPI" | "CREDIT" | "CARD";
  paid_amount?: number;
  notes?: string;
};

function message(data: unknown, fallback: string): string {
  const detail = (data as { detail?: unknown } | null)?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return "Please check the entered details";
  return fallback;
}

async function raw(
  method: string,
  path: string,
  body?: unknown,
  token?: string | null,
  extraHeaders?: Record<string, string>
) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(extraHeaders || {}),
  };
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

export async function authRequest<T>(
  method: string,
  path: string,
  body?: unknown,
  extraHeaders?: Record<string, string>
): Promise<T> {
  let res = await raw(method, path, body, await getAccess(), extraHeaders);
  if (res.status === 401 && (await refreshTokens())) {
    res = await raw(method, path, body, await getAccess(), extraHeaders);
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

// ---------------- BUSINESS / REPORT / POS APIS ----------------

// Dashboard Metrics
export const getDashboardSummary = (from?: string, to?: string) => {
  let query = "";
  if (from && to) query = `?date_from=${from}&date_to=${to}`;
  return authRequest<DashboardSummary>("GET", `/api/v1/reports/summary${query}`);
};

// Catalog / Products
export const getProducts = () =>
  authRequest<{ items: Product[] } | Product[]>("GET", "/api/v1/products");

// Customers
export const getCustomers = () =>
  authRequest<{ items: Customer[] } | Customer[]>("GET", "/api/v1/customers");

// Create Invoice (Generates random Idempotency-Key)
export const createInvoice = (payload: InvoiceCreatePayload) => {
  const idempotencyKey =
    "m-" + Date.now().toString(36) + "-" + Math.random().toString(36).substring(2, 9);
  return authRequest<any>("POST", "/api/v1/invoices", payload, {
    "Idempotency-Key": idempotencyKey,
  });
};