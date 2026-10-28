import * as SQLite from "expo-sqlite";
import { Product, Customer, InvoiceCreatePayload, createInvoice, getProducts, getCustomers } from "./api";

const DB_NAME = "volonce_billing_offline.db";
let dbInstance: SQLite.SQLiteDatabase | null = null;

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbInstance) {
    dbInstance = await SQLite.openDatabaseAsync(DB_NAME);
    await initDbTables(dbInstance);
  }
  return dbInstance;
}

// ૧. લોકલ ડેટાબેઝ ટેબલો બનાવો
async function initDbTables(db: SQLite.SQLiteDatabase) {
  // પ્રોડક્ટ્સ કેશ ટેબલ (બારકોડ ઇન્ડેક્સ સાથે)
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS cached_products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      sku TEXT,
      barcode TEXT,
      selling_price REAL NOT NULL,
      purchase_price REAL DEFAULT 0,
      tax_percent REAL DEFAULT 0,
      unit TEXT DEFAULT 'pcs',
      current_stock REAL DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      updated_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_prod_barcode ON cached_products(barcode);
    CREATE INDEX IF NOT EXISTS idx_prod_name ON cached_products(name);

    CREATE TABLE IF NOT EXISTS cached_customers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      mobile TEXT,
      phone TEXT,
      email TEXT,
      outstanding REAL DEFAULT 0,
      current_balance REAL DEFAULT 0,
      updated_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_cust_mobile ON cached_customers(mobile);

    CREATE TABLE IF NOT EXISTS offline_invoices (
      id TEXT PRIMARY KEY,
      customer_id TEXT,
      customer_name TEXT,
      customer_mobile TEXT,
      total_amount REAL NOT NULL,
      payload_json TEXT NOT NULL,
      sync_status TEXT DEFAULT 'pending',
      last_error TEXT,
      created_at TEXT NOT NULL
    );
  `);
}

// ૨. સર્વર પરથી પ્રોડક્ટ્સ અને કસ્ટમર્સ લોકલ SQLite માં કેશ કરો
export async function syncCatalogToLocalDb(): Promise<{ productsCount: number; customersCount: number }> {
  try {
    const db = await getDb();
    const [prodRes, custRes] = await Promise.all([getProducts(), getCustomers()]);

    const products: Product[] = Array.isArray(prodRes) ? prodRes : (prodRes as any).items || [];
    const customers: Customer[] = Array.isArray(custRes) ? custRes : (custRes as any).items || [];

    const now = new Date().toISOString();

    // Batch insert products
    await db.withTransactionAsync(async () => {
      for (const p of products) {
        await db.runAsync(
          `INSERT OR REPLACE INTO cached_products 
           (id, name, sku, barcode, selling_price, purchase_price, tax_percent, unit, current_stock, is_active, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            p.id,
            p.name,
            p.sku || null,
            p.barcode || null,
            Number(p.selling_price) || 0,
            Number(p.purchase_price) || 0,
            Number(p.tax_percent) || 0,
            p.unit || "pcs",
            p.current_stock ?? 0,
            p.is_active ? 1 : 0,
            now,
          ]
        );
      }

      for (const c of customers) {
        await db.runAsync(
          `INSERT OR REPLACE INTO cached_customers 
           (id, name, mobile, phone, email, outstanding, current_balance, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            c.id,
            c.name,
            c.mobile || null,
            c.phone || null,
            c.email || null,
            Number(c.outstanding) || 0,
            Number(c.current_balance) || 0,
            now,
          ]
        );
      }
    });

    return { productsCount: products.length, customersCount: customers.length };
  } catch (err) {
    console.log("Local SQLite catalog cache note:", err);
    return { productsCount: 0, customersCount: 0 };
  }
}

// ૩. બારકોડ પરથી લોકલ પ્રોડક્ટ શોધો (Fastest Lookup)
export async function findProductByBarcode(barcode: string): Promise<Product | null> {
  const db = await getDb();
  const cleanBarcode = barcode.trim();
  const row = await db.getFirstAsync<any>(
    "SELECT * FROM cached_products WHERE barcode = ? OR sku = ? LIMIT 1",
    [cleanBarcode, cleanBarcode]
  );
  if (!row) return null;
  return {
    ...row,
    is_active: Boolean(row.is_active),
  };
}

// ૪. લોકલ પ્રોડક્ટ્સ લિસ્ટ અને સર્ચ (Offline Search)
export async function getLocalCachedProducts(query?: string): Promise<Product[]> {
  const db = await getDb();
  if (!query || !query.trim()) {
    const rows = await db.getAllAsync<any>(
      "SELECT * FROM cached_products WHERE is_active = 1 ORDER BY name ASC LIMIT 200"
    );
    return rows.map((r) => ({ ...r, is_active: Boolean(r.is_active) }));
  }

  const like = `%${query.trim()}%`;
  const rows = await db.getAllAsync<any>(
    `SELECT * FROM cached_products 
     WHERE is_active = 1 AND (name LIKE ? OR sku LIKE ? OR barcode LIKE ?) 
     ORDER BY name ASC LIMIT 100`,
    [like, like, like]
  );
  return rows.map((r) => ({ ...r, is_active: Boolean(r.is_active) }));
}

// ૫. લોકલ ગ્રાહકો લિસ્ટ (Offline Customers)
export async function getLocalCachedCustomers(query?: string): Promise<Customer[]> {
  const db = await getDb();
  if (!query || !query.trim()) {
    return await db.getAllAsync<Customer>(
      "SELECT * FROM cached_customers ORDER BY name ASC LIMIT 200"
    );
  }
  const like = `%${query.trim()}%`;
  return await db.getAllAsync<Customer>(
    "SELECT * FROM cached_customers WHERE name LIKE ? OR mobile LIKE ? ORDER BY name ASC LIMIT 100",
    [like, like]
  );
}

// ૬. ઑફલાઇન બિલ SQLite માં સેવ કરો
export async function saveInvoiceOffline(
  payload: InvoiceCreatePayload,
  customerName: string = "Walk-in Customer",
  customerMobile?: string,
  totalAmount: number = 0
): Promise<string> {
  const db = await getDb();
  const offlineId = "off-" + Date.now().toString(36) + "-" + Math.random().toString(36).substring(2, 7);
  const now = new Date().toISOString();

  await db.runAsync(
    `INSERT INTO offline_invoices 
     (id, customer_id, customer_name, customer_mobile, total_amount, payload_json, sync_status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`,
    [
      offlineId,
      payload.customer_id || null,
      customerName,
      customerMobile || null,
      totalAmount,
      JSON.stringify(payload),
      now,
    ]
  );

  return offlineId;
}

// ૭. તમામ ઑફલાઇન પેન્ડિંગ બિલો લાવો
export async function getPendingOfflineInvoices(): Promise<any[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>(
    "SELECT * FROM offline_invoices ORDER BY created_at DESC"
  );
  return rows.map((r) => ({
    ...r,
    payload: JSON.parse(r.payload_json),
  }));
}

// ૮. સિંક થઈ ગયેલું બિલ હટાવો
export async function removeOfflineInvoice(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync("DELETE FROM offline_invoices WHERE id = ?", [id]);
}

// ૯. નેટ આવે ત્યારે ૧-ક્લિકમાં તમામ બિલો સર્વર પર સિંક કરો
export async function syncAllOfflineInvoices(): Promise<{ synced: number; failed: number }> {
  const db = await getDb();
  const pending = await getPendingOfflineInvoices();
  if (pending.length === 0) return { synced: 0, failed: 0 };

  let synced = 0;
  let failed = 0;

  for (const item of pending) {
    try {
      await createInvoice(item.payload);
      await removeOfflineInvoice(item.id);
      synced++;
    } catch (err: any) {
      failed++;
      await db.runAsync(
        "UPDATE offline_invoices SET sync_status = 'failed', last_error = ? WHERE id = ?",
        [err.message || "Sync error", item.id]
      );
    }
  }

  return { synced, failed };
}