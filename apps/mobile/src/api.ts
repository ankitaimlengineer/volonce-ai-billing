import { Platform } from "react-native";
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

// કસ્ટમર ખાતાવહી (Ledger) મોડેલ્સ
export type CustomerLedgerRow = {
  id: string;
  created_at: string;
  entry_type: "sale" | "payment" | "sales_return" | "adjustment";
  debit: number | string;
  credit: number | string;
  balance: number | string;
  note: string | null;
};

export type CustomerLedgerOut = {
  customer_id: string;
  opening_balance: number | string;
  outstanding: number | string;
  items: CustomerLedgerRow[];
};

// વેપારી (Supplier) મોડેલ્સ
export type Supplier = {
  id: string;
  name: string;
  mobile?: string;
  email?: string;
  address?: string;
  gst_number?: string;
  opening_balance?: number | string;
  outstanding?: number | string;
};

export type SupplierLedgerRow = {
  id: string;
  created_at: string;
  entry_type: "purchase" | "payment" | "purchase_return" | "adjustment";
  debit: number | string;
  credit: number | string;
  balance: number | string;
  note: string | null;
};

export type SupplierLedgerOut = {
  supplier_id: string;
  opening_balance: number | string;
  outstanding: number | string;
  items: SupplierLedgerRow[];
};

// ખરીદી (Purchase) મોડેલ્સ
export type PurchaseItemPayload = {
  product_id: string;
  quantity: number;
  rate: number;
  tax_percent?: number;
  batch_no?: string;
  expiry_date?: string;
};

export type PurchaseCreatePayload = {
  supplier_id: string;
  invoice_number: string;
  purchase_date: string;
  items: PurchaseItemPayload[];
  paid_amount: number;
  payment_method?: string;
  notes?: string;
};

// ખર્ચા (Expense) મોડેલ
export type ExpenseItem = {
  id: string;
  category: string;
  amount: number | string;
  expense_date: string;
  payment_method: string;
  notes: string | null;
  status: string;
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

// ---------------- BUSINESS SETUP TYPES ----------------
export type RegisterPayload = {
  business_name: string;
  full_name: string;
  email: string;
  mobile: string;
  password: string;
};

export type BusinessProfilePayload = {
  name: string;
  owner_name?: string;
  business_type: string;
  business_category: string;
  mobile: string;
  email?: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  gst_number?: string;
};

export type BusinessSettingsPayload = {
  bank_name?: string;
  bank_account_holder?: string;
  bank_account_number?: string;
  bank_ifsc?: string;
  upi_id?: string;
  terms_and_conditions?: string;
  invoice_footer?: string;
  invoice_template: string;
  invoice_prefix: string;
  invoice_number_padding: number;
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

// ૧. નવું એકાઉન્ટ રજીસ્ટર કરો
export async function register(payload: RegisterPayload): Promise<TokenResponse> {
  const t = await parse<TokenResponse>(
    await raw("POST", "/api/v1/auth/register", {
      business_name: payload.business_name.trim(),
      full_name: payload.full_name.trim(),
      email: payload.email.trim(),
      mobile: payload.mobile.trim() || null,
      password: payload.password,
    })
  );
  await saveTokens(t.access_token, t.refresh_token);
  return t;
}

// ૨. લૉગિન કરો
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

// ---------------- BUSINESS SETUP APIS (વેબ જેવા જ સેટઅપ સ્ટેપ્સ) ----------------

// ૧. બિઝનેસ પ્રોફાઇલ ડેટા લાવો
export const getBusinessProfile = () =>
  authRequest<any>("GET", "/api/v1/business/profile");

// ૨. Step 1: બિઝનેસ પ્રોફાઇલ વિગત સેવ કરો
export const updateBusinessProfile = (data: BusinessProfilePayload) =>
  authRequest<any>("PUT", "/api/v1/business/profile", data);

// ૩. Step 2: લોગો અથવા સહી અપલોડ કરો
export async function uploadBusinessBranding(
  kind: "logo" | "signature",
  imageUri: string
): Promise<any> {
  let token = await getAccess();
  const fileBlob = await uriToBlob(imageUri);

  const upload = async (bearerToken: string | null) => {
    const formData = new FormData();
    formData.append("file", fileBlob, `${kind}.jpg`);

    return await fetch(`${API_URL}/api/v1/business/${kind}`, {
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

  return parse<any>(res);
}

// ૪. Step 3: ઇન્વોઇસ અને બેંક સેટિંગ્સ સેવ કરો
export const updateBusinessSettings = (data: BusinessSettingsPayload) =>
  authRequest<any>("PUT", "/api/v1/business/settings", data);

// ૫. સેટઅપ ફાઇનલ કન્ફર્મ કરો (Complete Setup)
export const completeBusinessSetup = () =>
  authRequest<any>("POST", "/api/v1/business/complete-setup");

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

// Customers (ગ્રાહકો)
export const getCustomers = () =>
  authRequest<{ items: Customer[] } | Customer[]>("GET", "/api/v1/customers?page_size=100");

// ૧. નવો ગ્રાહક ઉમેરો
export const createCustomer = (data: {
  name: string;
  mobile?: string;
  customer_type?: string;
  opening_balance?: string;
}) => authRequest<Customer>("POST", "/api/v1/customers", data);

// ૨. ગ્રાહકની સંપૂર્ણ ખાતાવહી (Ledger) લાવો
export const getCustomerLedger = (customerId: string) =>
  authRequest<CustomerLedgerOut>("GET", `/api/v1/customers/${customerId}/ledger`);

// ૩. ગ્રાહક પાસેથી ઉધાર/જમા પેમેન્ટ મેળવો
export const recordCustomerPayment = (
  customerId: string,
  amount: number,
  method: "cash" | "upi" | "card" | "bank_transfer",
  note?: string
) => {
  const idempotencyKey = "pay-" + Date.now().toString(36) + "-" + Math.random().toString(36).substring(2, 7);
  return authRequest<any>(
    "POST",
    `/api/v1/customers/${customerId}/payments`,
    {
      amount,
      payment_method: method,
      note: note || null,
    },
    { "Idempotency-Key": idempotencyKey }
  );
};

// ---------------- SUPPLIERS & PURCHASES APIS ----------------

// ૪. સપ્લાયર લિસ્ટ
export const getSuppliers = () =>
  authRequest<{ items: Supplier[] } | Supplier[]>("GET", "/api/v1/suppliers?page_size=100");

// ૫. નવો સપ્લાયર ઉમેરો
export const createSupplier = (data: {
  name: string;
  mobile?: string;
  email?: string;
  address?: string;
  gst_number?: string;
  opening_balance?: string;
}) => authRequest<Supplier>("POST", "/api/v1/suppliers", data);

// ૬. સપ્લાયર ખાતાવહી લાવો
export const getSupplierLedger = (supplierId: string) =>
  authRequest<SupplierLedgerOut>("GET", `/api/v1/suppliers/${supplierId}/ledger`);

// ૭. સપ્લાયરને પેમેન્ટ ચૂકવો
export const recordSupplierPayment = (
  supplierId: string,
  amount: number,
  method: "cash" | "upi" | "card" | "bank_transfer",
  note?: string
) => {
  const idempotencyKey = "spay-" + Date.now().toString(36) + "-" + Math.random().toString(36).substring(2, 7);
  return authRequest<any>(
    "POST",
    `/api/v1/suppliers/${supplierId}/payments`,
    {
      amount,
      payment_method: method,
      note: note || null,
    },
    { "Idempotency-Key": idempotencyKey }
  );
};

// ૮. ખરીદી (Purchases) લિસ્ટ લાવો
export const getPurchases = () =>
  authRequest<any[]>("GET", "/api/v1/purchases?limit=50");

// ૯. નવી ખરીદી (Stock Purchase) નોંધો
export const createPurchase = (payload: PurchaseCreatePayload) => {
  const idempotencyKey = "pur-" + Date.now().toString(36) + "-" + Math.random().toString(36).substring(2, 8);
  return authRequest<any>("POST", "/api/v1/purchases", payload, {
    "Idempotency-Key": idempotencyKey,
  });
};

// ---------------- EXPENSES & BILLING APIS ----------------

// ૧૦. દુકાનના ખર્ચાની યાદી
export const getExpenses = () =>
  authRequest<{ items: ExpenseItem[]; total_amount: number | string }>("GET", "/api/v1/expenses?limit=100");

// ૧૧. નવો ખર્ચ ઉમેરો
export const createExpense = (data: {
  category: string;
  amount: number;
  expense_date: string;
  payment_method: string;
  notes?: string;
}) => {
  const idempotencyKey = "exp-" + Date.now().toString(36) + "-" + Math.random().toString(36).substring(2, 7);
  return authRequest<any>("POST", "/api/v1/expenses", data, {
    "Idempotency-Key": idempotencyKey,
  });
};

// ૧૨. નવું બિલ બનાવો (Create Invoice)
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

// ૧. કેમેરા ફોટો પરથી Gemini AI સ્કેનર
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

// ૨. ગ્રાહકનો ચહેરો ઓળખવા માટે
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

// ---------------- PDF ડાઉનલોડ, સેવ, પ્રિન્ટ અને શેર ફંક્શન્સ ----------------

// ૧. સર્વર પરથી PDF ડાઉનલોડ કરવી
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

  if (downloadResult.status !== 200) {
    throw new ApiError(
      `સર્વર ભૂલ (${downloadResult.status}): PDF ડાઉનલોડ થઈ શકી નથી.`,
      downloadResult.status
    );
  }

  const info = await FileSystem.getInfoAsync(downloadResult.uri);
  if (!info.exists || info.size === 0) {
    throw new ApiError("સર્વર પરથી ખાલી (0 kB) PDF ડાઉનલોડ થઈ છે. બેકએન્ડ તપાસો.", 500);
  }

  return downloadResult.uri;
}

// ૨. મોબાઈલના Downloads / Phone Storage માં PDF કાયમ માટે સેવ કરવી (Android SAF)
export async function savePdfToPhone(fileUri: string, invoiceNumber: string): Promise<boolean> {
  try {
    const info = await FileSystem.getInfoAsync(fileUri);
    if (!info.exists || info.size === 0) {
      throw new ApiError("PDF ફાઇલ ખાલી છે, સેવ કરી શકાતી નથી.", 0);
    }

    if (Platform.OS === "android") {
      const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
      if (permissions.granted) {
        const base64 = await FileSystem.readAsStringAsync(fileUri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        const createdUri = await FileSystem.StorageAccessFramework.createFileAsync(
          permissions.directoryUri,
          `Invoice-${invoiceNumber}.pdf`,
          "application/pdf"
        );
        await FileSystem.writeAsStringAsync(createdUri, base64, {
          encoding: FileSystem.EncodingType.Base64,
        });
        return true;
      }
    }
  } catch (err) {
    console.log("Save error:", err);
  }

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(fileUri, {
      mimeType: "application/pdf",
      dialogTitle: "Save Invoice PDF",
      UTI: "com.adobe.pdf",
    });
    return true;
  }
  return false;
}

// ૩. અસલ PDF ફાઇલ WhatsApp / Drive / Bluetooth પર શેર કરવી
export async function sharePdfFile(fileUri: string): Promise<void> {
  const info = await FileSystem.getInfoAsync(fileUri);
  if (!info.exists || info.size === 0) {
    throw new ApiError("PDF ફાઇલ ખાલી છે, શેર કરી શકાતી નથી.", 0);
  }

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(fileUri, {
      mimeType: "application/pdf",
      dialogTitle: "Share Invoice PDF",
      UTI: "com.adobe.pdf",
    });
  }
}

// ૪. મોબાઈલમાંથી સીધા પ્રિન્ટર પર પ્રિન્ટ કરવા માટે
export async function printInvoicePdf(fileUri: string): Promise<void> {
  const info = await FileSystem.getInfoAsync(fileUri);
  if (!info.exists || info.size === 0) {
    throw new ApiError("PDF ફાઇલ ખાલી છે, પ્રિન્ટ કરી શકાતી નથી.", 0);
  }
  await Print.printAsync({ uri: fileUri });
}

// ૫. જૂનો ફૉલબેક
export async function shareOrSavePdf(fileUri: string): Promise<void> {
  await sharePdfFile(fileUri);
}

// ---------------- PHASE 10 & 11: MULTI-PHOTO SESSIONS ----------------

export async function createCameraSession(mode: "single" | "multiple" = "multiple") {
  return authRequest<{ id: string }>("POST", "/api/v1/ai/sessions", { mode });
}

export async function addImageToCameraSession(sessionId: string, imageUri: string) {
  let token = await getAccess();
  const fileBlob = await uriToBlob(imageUri);

  const formData = new FormData();
  formData.append("file", fileBlob, "session_photo.jpg");

  const res = await fetch(`${API_URL}/api/v1/ai/sessions/${sessionId}/add-image`, {
    method: "POST",
    headers: { Authorization: token ? `Bearer ${token}` : "" },
    body: formData,
  });

  return parse<any>(res);
}

export async function getSessionDraftBill(sessionId: string) {
  return authRequest<any>("GET", `/api/v1/ai/sessions/${sessionId}/draft`);
}

// ---------------- ૧૦૦% વેબ જેવા જ સમાન નવા ફીચર્સ (INVOICES, REPORTS, SUBSCRIPTION, TRANSFERS) ----------------

// ૧. પાછલા તમામ બિલોની યાદી મેળવો (Invoices History)
export const getInvoices = (limit = 100) =>
  authRequest<any[]>("GET", `/api/v1/invoices?limit=${limit}`);

// ૨. ચોક્કસ બિલની વિગત લાવો
export const getInvoiceDetail = (invoiceId: string) =>
  authRequest<any>("GET", `/api/v1/invoices/${invoiceId}`);

// ૩. વેચાણ રિપોર્ટ (Sales Report)
export const getSalesReport = (from?: string, to?: string) => {
  const q = from && to ? `?date_from=${from}&date_to=${to}` : "";
  return authRequest<any>("GET", `/api/v1/reports/sales${q}`);
};

// ૪. નફો અને નુકસાન રિપોર્ટ (Profit & Loss Statement)
export const getProfitLossReport = (from?: string, to?: string) => {
  const q = from && to ? `?date_from=${from}&date_to=${to}` : "";
  return authRequest<any>("GET", `/api/v1/reports/profit-loss${q}`);
};

// ૫. કેશ ફ્લો રિપોર્ટ (Cash Flow Report)
export const getCashFlowReport = (from?: string, to?: string) => {
  const q = from && to ? `?date_from=${from}&date_to=${to}` : "";
  return authRequest<any>("GET", `/api/v1/reports/cash-flow${q}`);
};

// ૬. સબસ્ક્રિપ્શન સ્ટેટસ લાવો
export const getSubscriptionStatus = () =>
  authRequest<any>("GET", "/api/v1/subscription/status");

// ૭. તમામ સબસ્ક્રિપ્શન પ્લાન લિસ્ટ
export const getSubscriptionPlans = () =>
  authRequest<any[]>("GET", "/api/v1/subscription/plans");

// ૮. વાઉચર અથવા કૂપન કોડ રિડીમ કરો
export const redeemVoucherCode = (code: string) =>
  authRequest<any>("POST", "/api/v1/subscription/redeem-code", {
    code: code.trim().toUpperCase(),
  });

// ૯. ગોડાઉન સ્ટોક ટ્રાન્સફર્સ હિસ્ટ્રી
export const getStockTransfers = (limit = 50) =>
  authRequest<any[]>("GET", `/api/v1/inventory/transfers?limit=${limit}`);

// ૧૦. નવો સ્ટોક ટ્રાન્સફર નોંધો (Godown to Shop)
export const createStockTransfer = (payload: any) => {
  const idempotencyKey =
    "trf-" + Date.now().toString(36) + "-" + Math.random().toString(36).substring(2, 7);
  return authRequest<any>("POST", "/api/v1/inventory/transfers", payload, {
    "Idempotency-Key": idempotencyKey,
  });
};

// ૧૧. તમામ શાખાઓ અને ગોડાઉનની યાદી મેળવો
export const getShops = () =>
  authRequest<any[]>("GET", "/api/v1/business/shops");

// ૧૨. સક્રિય શાખા/ગોડાઉન ૧-ક્લિકમાં સ્વિચ કરો
export const setDefaultShop = (shopId: string) =>
  authRequest<any>("POST", `/api/v1/business/shops/${shopId}/set-default`);

// ૧૩. માલની એક્સપાયરી રિપોર્ટ લાવો
export const getExpiryReport = (days = 30) =>
  authRequest<any>("GET", `/api/v1/inventory/expiry?days=${days}`);

// ૧૪. મેન્યુઅલ સ્ટોક એડજસ્ટ કરો (Damage, Expired, Opening)
export const createStockMovement = (payload: {
  product_id: string;
  movement_type: "opening" | "adjustment" | "damage" | "expired";
  quantity: number | string;
  note?: string;
  batch_no?: string;
  expiry_date?: string;
}) => authRequest<any>("POST", "/api/v1/inventory/movements", payload);