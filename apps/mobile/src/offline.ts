import * as FileSystem from "expo-file-system/legacy";
import { createInvoice, InvoiceCreatePayload } from "./api";

const DRAFTS_FILE = `${FileSystem.documentDirectory}volonce_offline_drafts.json`;

export interface OfflineDraftInvoice {
  id: string; // Client-side generated ID
  idempotency_key: string;
  createdAt: string;
  customerName: string;
  customerMobile?: string;
  totalAmount: number;
  payload: InvoiceCreatePayload;
  syncStatus: "pending" | "failed";
  lastError?: string;
}

// ૧. તમામ ઓફલાઇન ડ્રાફ્ટ લાવો
export async function getOfflineDrafts(): Promise<OfflineDraftInvoice[]> {
  try {
    const info = await FileSystem.getInfoAsync(DRAFTS_FILE);
    if (!info.exists) return [];
    const content = await FileSystem.readAsStringAsync(DRAFTS_FILE);
    return JSON.parse(content) || [];
  } catch (err) {
    console.log("Error reading offline drafts:", err);
    return [];
  }
}

// ૨. નવું ઓફલાઇન બિલ ફોનમાં સેવ કરો
export async function saveOfflineDraft(
  draft: Omit<OfflineDraftInvoice, "id" | "createdAt" | "syncStatus">
): Promise<OfflineDraftInvoice> {
  const drafts = await getOfflineDrafts();
  const newDraft: OfflineDraftInvoice = {
    ...draft,
    id: "draft-" + Date.now().toString(36) + "-" + Math.random().toString(36).substring(2, 6),
    createdAt: new Date().toISOString(),
    syncStatus: "pending",
  };

  drafts.unshift(newDraft); // નવું બિલ સૌથી ઉપર
  await FileSystem.writeAsStringAsync(DRAFTS_FILE, JSON.stringify(drafts));
  return newDraft;
}

// ૩. ડ્રાફ્ટ ડિલીટ કરો
export async function removeOfflineDraft(id: string): Promise<void> {
  const drafts = await getOfflineDrafts();
  const filtered = drafts.filter((d) => d.id !== id);
  await FileSystem.writeAsStringAsync(DRAFTS_FILE, JSON.stringify(filtered));
}

// ૪. નેટ આવે ત્યારે ૧-ક્લિકમાં તમામ ઓફલાઇન બિલો સર્વર પર સિંક કરો
export async function syncOfflineDrafts(): Promise<{
  synced: number;
  failed: number;
}> {
  const drafts = await getOfflineDrafts();
  if (drafts.length === 0) return { synced: 0, failed: 0 };

  let syncedCount = 0;
  let failedCount = 0;
  const remaining: OfflineDraftInvoice[] = [];

  for (const draft of drafts) {
    try {
      await createInvoice(draft.payload);
      syncedCount++;
    } catch (err: any) {
      failedCount++;
      remaining.push({
        ...draft,
        syncStatus: "failed",
        lastError: err.message || "Sync failed",
      });
    }
  }

  await FileSystem.writeAsStringAsync(DRAFTS_FILE, JSON.stringify(remaining));
  return { synced: syncedCount, failed: failedCount };
}