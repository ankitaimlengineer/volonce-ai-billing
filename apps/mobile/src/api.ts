import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as Print from "expo-print";
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
  tax_percent?: number | string;
  unit?: string;
  current_stock?: number;
  is_active: boolean;
};

export type Customer = {
  id: string;
  name: string;
  mobile?: string;
  phone?: string;
  email?: string;
  outstanding?: number | string;
  current_balance?: number | string;
};

// બિલ આઇટમ્સ અને પેમેન્ટ મોડેલ્સ
export type InvoiceItemPayload = {
  product_id: string;
  quantity: number;
  discount_percent?: number;
};

export type PaymentPayload = {
  method: "cash" | "upi" | "card" | "bank_transfer";
  amount: number;
};

export type InvoiceCreatePayload = {
  customer_id?: string | null;
  items: InvoiceItemPayload[];
  payments: PaymentPayload[];
  notes?: string;
};

// AI સ્કેન પરિણામ મોડેલ્સ
export type ScannedItem = {
  raw_name: string;
  matched_product_id: string | null;
  matched_product_name: string | null;
  confidence: number;
  quantity: number;
  rate: number;
  tax_percent: number;
  total: number;
};

export type BillScanResponse = {
  invoice_number?: string;
  invoice_date?: string;
  vendor_or_customer?: string;
  items: ScannedItem[];
  subtotal: number;
  tax_total: number;
  grand_total: number;
  overall_confidence: number;
};

export type CustomerFaceMatchResponse = {
  matched: boolean;
  customer: {
    id: string;
    name: string;
    mobile: string | null;
    outstanding: number;
    confidence: number;
  } | null;
};

function message(data: unknown, fallback: string): string {
  const detail = (data as { detail?: unknown } | null)?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return "દાખલ કરેલી વિગતો તપાસો (Validation Error)";
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
    throw new ApiError("સર્વર સાથે કનેક્ટ થઈ શક્યું નથી. Wi-Fi અને IP ચેક કરો.", 0);
  } finally {
    clearTimeout(timer);
  }
}

async function parse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = "કંઈક ખોટું થયું છે";
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

// ---------------- AUTHENTICATION APIS ----------------

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
  authRequest<{ items: Product[] } | Product[]>("GET", "/api/v1/products?page_size=100");

// Customers
export const getCustomers = () =>
  authRequest<{ items: Customer[] } | Customer[]>("GET", "/api/v1/customers?page_size=100");

// Create Invoice
export const createInvoice = (payload: InvoiceCreatePayload) => {
  const idempotencyKey =
    "m-" + Date.now().toString(36) + "-" + Math.random().toString(36).substring(2, 9);
  return authRequest<any>("POST", "/api/v1/invoices", payload, {
    "Idempotency-Key": idempotencyKey,
  });
};

// ---------------- Helper to convert file URI to Blob ----------------
function uriToBlob(uri: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.onload = function () {
      resolve(xhr.response);
    };
    xhr.onerror = function () {
      reject(new ApiError("ફોટો વાંચવામાં સમસ્યા આવી.", 0));
    };
    xhr.responseType = "blob";
    xhr.open("GET", uri, true);
    xhr.send(null);
  });
}

// ---------------- AI CAMERA SCANNING APIS ----------------

// ૧. કેમેરા ફોટો પરથી Gemini AI સ્કેનર (Android-Safe Blob Upload)
export async function scanBillImage(imageUri: string): Promise<BillScanResponse> {
  let token = await getAccess();
  const fileBlob = await uriToBlob(imageUri);

  const upload = async (bearerToken: string | null) => {
    const formData = new FormData();
    formData.append("file", fileBlob, "camera_scan.jpg");

    return await fetch(`${API_URL}/api/v1/ai/scan-bill`, {
      method: "POST",
      headers: {
        Authorization: bearerToken ? `Bearer ${bearerToken}` : "",
      },
      body: formData,
    });
  };

  let res = await upload(token);
  if (res.status === 401 && (await refreshTokens())) {
    token = await getAccess();
    res = await upload(token);
  }

  return parse<BillScanResponse>(res);
}

// ૨. ગ્રાહકનો ચહેરો ઓળખવા માટે (Android-Safe Blob Upload)
export async function matchCustomerFace(imageUri: string): Promise<CustomerFaceMatchResponse> {
  let token = await getAccess();
  const fileBlob = await uriToBlob(imageUri);

  const upload = async (bearerToken: string | null) => {
    const formData = new FormData();
    formData.append("file", fileBlob, "face_scan.jpg");

    return await fetch(`${API_URL}/api/v1/ai/match-customer-face`, {
      method: "POST",
      headers: {
        Authorization: bearerToken ? `Bearer ${bearerToken}` : "",
      },
      body: formData,
    });
  };

  let res = await upload(token);
  if (res.status === 401 && (await refreshTokens())) {
    token = await getAccess();
    res = await upload(token);
  }

  return parse<CustomerFaceMatchResponse>(res);
}

// ---------------- PDF ડાઉનલોડ, પ્રિન્ટ અને શેર ફંક્શન્સ ----------------

// ૧. સર્વર પરથી અસલ રંગીન PDF ડાઉનલોડ કરી ફોનમાં સેવ કરવા માટે (Using Expo Legacy API)
export async function downloadInvoicePdf(invoiceId: string, invoiceNumber: string): Promise<string> {
  const token = await getAccess();
  const fileUri = `${FileSystem.documentDirectory}Invoice-${invoiceNumber}.pdf`;

  const downloadResult = await FileSystem.downloadAsync(
    `${API_URL}/api/v1/whatsapp/invoices/${invoiceId}/download-pdf`,
    fileUri,
    {
      headers: {
        Authorization: token ? `Bearer ${token}` : "",
      },
    }
  );

  return downloadResult.uri;
}

// ૨. મોબાઈલમાંથી સીધા પ્રિન્ટર પર પ્રિન્ટ કરવા માટે
export async function printInvoicePdf(fileUri: string) {
  await Print.printAsync({ uri: fileUri });
}

// ૩. ફોનમાં PDF સેવ / શેર / ડાઉનલોડ્સ ફોલ્ડરમાં મૂકવા માટે
export async function shareOrSavePdf(fileUri: string) {
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(fileUri, {
      mimeType: "application/pdf",
      dialogTitle: "Invoice PDF",
      UTI: "com.adobe.pdf",
    });
  }
}