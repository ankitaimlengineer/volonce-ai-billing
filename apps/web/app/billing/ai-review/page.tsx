"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { authGet, authPost, authPut } from "@/lib/api";
import WebcamCaptureModal from "@/app/components/WebcamCaptureModal";

interface DraftItem {
  id?: string;
  product_id: string | null;
  name: string;
  quantity: number;
  rate: number;
  tax_percent: number;
  total: number;
  confidence: number;
  isMatched: boolean;
}

interface Product {
  id: string;
  name: string;
  selling_price: string;
  tax_percent: string;
  brand?: string;
}

interface Customer {
  id: string;
  name: string;
  mobile: string | null;
  outstanding: string;
}

interface RawDraftItemResponse {
  product_id: string | null;
  name: string;
  quantity: string | number;
  rate: string | number;
  tax_percent: string | number;
  total: string | number;
  confidence: number;
}

interface DraftBillResponse {
  draft_id: string;
  is_duplicate_photo?: boolean;
  items?: RawDraftItemResponse[];
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// સ્માર્ટ કેટલોગ મેચર: Kreo ને ક્યારેય Urea સાથે મેચ નહીં થવા દે
function findBestCatalogMatch(scannedName: string, catalog: Product[]): Product | null {
  if (!scannedName || !catalog || catalog.length === 0) return null;

  const cleanScanned = scannedName.toLowerCase().replace(/[^a-z0-9\s]/g, " ").trim();
  const scannedWords = cleanScanned.split(/\s+/).filter((w) => w.length >= 3);

  // ૧. સીધું નામ કે સબસ્ટ્રિંગ મેચ
  for (const p of catalog) {
    const cleanP = p.name.toLowerCase().replace(/[^a-z0-9\s]/g, " ").trim();
    if (cleanP === cleanScanned || cleanScanned.includes(cleanP) || cleanP.includes(cleanScanned)) {
      return p;
    }
  }

  // ૨. શબ્દોની ચોક્કસ સરખામણી (દા.ત. "kreo", "gorec", "duo")
  let bestMatch: Product | null = null;
  let maxCommonWords = 0;

  for (const p of catalog) {
    const cleanP = p.name.toLowerCase().replace(/[^a-z0-9\s]/g, " ").trim();
    const pWords = cleanP.split(/\s+/).filter((w) => w.length >= 3);

    // સામાન્ય શબ્દો ગણો
    const commonCount = scannedWords.filter((w) => pWords.includes(w)).length;
    if (commonCount > maxCommonWords) {
      maxCommonWords = commonCount;
      bestMatch = p;
    }
  }

  if (maxCommonWords > 0 && bestMatch) {
    return bestMatch;
  }

  // કોઈ ખોટો Urea ફૉલબેક નહીં!
  return null;
}

export default function AiReviewPage() {
  const router = useRouter();

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [capturedPhotos, setCapturedPhotos] = useState<string[]>([]);
  const [isCameraOpen, setIsCameraOpen] = useState(false);

  const [items, setItems] = useState<DraftItem[]>([]);
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");

  const [paymentType, setPaymentType] = useState<"cash" | "upi" | "credit" | "partial">("cash");
  const [paidAmountInput, setPaidAmountInput] = useState<string>("");

  const [analyzing, setAnalyzing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // ઓટોમેટિક કેલ્ક્યુલેશન અને મેચિંગ
  const processPhotoToSession = useCallback(
    async (blob: Blob, dataUrl: string, targetSessionId?: string, catalogList?: Product[]) => {
      const sId = targetSessionId || sessionId;
      if (!sId) return;

      const prods = catalogList || allProducts;

      setAnalyzing(true);
      setError("");

      try {
        const formData = new FormData();
        formData.append("file", blob, `scan_${Date.now()}.jpg`);

        const token = localStorage.getItem("access_token");
        const res = await fetch(`${API_BASE}/api/v1/ai/sessions/${sId}/add-image`, {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: formData,
        });

        if (!res.ok) throw new Error("AI સ્કેન નિષ્ફળ ગયું");
        const data = (await res.json()) as DraftBillResponse;

        setCapturedPhotos((prev) => [...prev, dataUrl]);
        setDraftId(data.draft_id);

        const draftRes = await authGet<DraftBillResponse>(`/api/v1/ai/sessions/${sId}/draft`);
        const formatted: DraftItem[] = (draftRes.items || []).map((it) => {
          let pId = it.product_id;
          let finalName = it.name;
          let rate = Number(it.rate) || 0;
          let tax = Number(it.tax_percent) || 0;
          const qty = Number(it.quantity) || 1;
          let matchedFound = Boolean(pId && rate > 0);

          // સ્માર્ટ મેચિંગ: જો બેકએન્ડમાંથી રેટ ન આવ્યો હોય તો કેટલોગમાંથી ચોક્કસ Kreo શોધો
          if (!matchedFound) {
            const matched = findBestCatalogMatch(it.name, prods);
            if (matched) {
              pId = matched.id;
              finalName = matched.name;
              rate = Number(matched.selling_price) || 0;
              tax = Number(matched.tax_percent) || 0;
              matchedFound = true;
            }
          }

          const base = rate * qty;
          const taxAmt = (base * tax) / 100;

          return {
            product_id: pId,
            name: finalName,
            quantity: qty,
            rate: rate,
            tax_percent: tax,
            total: Math.round((base + taxAmt) * 100) / 100,
            confidence: it.confidence || 98,
            isMatched: matchedFound,
          };
        });

        setItems(formatted);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "ફોટો પ્રોસેસ કરવામાં સમસ્યા આવી");
      } finally {
        setAnalyzing(false);
      }
    },
    [sessionId, allProducts]
  );

  useEffect(() => {
    let active = true;

    async function init() {
      try {
        const [prodRes, custRes, sessRes] = await Promise.all([
          authGet<{ items: Product[] }>("/api/v1/products?page_size=100"),
          authGet<{ items: Customer[] }>("/api/v1/customers?page_size=100"),
          authPost<{ id: string }>("/api/v1/ai/sessions", { mode: "multiple" }),
        ]);

        if (!active) return;
        const prods = prodRes.items || [];
        setAllProducts(prods);
        setCustomers(custRes.items || []);
        setSessionId(sessRes.id);

        const storedImg = sessionStorage.getItem("volonce_scanned_img");
        if (storedImg) {
          sessionStorage.removeItem("volonce_scanned_img");
          const imgRes = await fetch(storedImg);
          const blob = await imgRes.blob();
          await processPhotoToSession(blob, storedImg, sessRes.id, prods);
        }
      } catch (err) {
        console.error("Init error:", err);
      }
    }

    init();

    return () => {
      active = false;
    };
  }, [processPhotoToSession]);

  const updateQty = (index: number, newQty: number) => {
    if (newQty < 1) return;
    setItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;
        const base = item.rate * newQty;
        const taxAmt = (base * item.tax_percent) / 100;
        return {
          ...item,
          quantity: newQty,
          total: Math.round((base + taxAmt) * 100) / 100,
        };
      })
    );
  };

  const updateRate = (index: number, newRate: number) => {
    setItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;
        const base = newRate * item.quantity;
        const taxAmt = (base * item.tax_percent) / 100;
        return {
          ...item,
          rate: newRate,
          total: Math.round((base + taxAmt) * 100) / 100,
        };
      })
    );
  };

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const grandTotal = useMemo(() => {
    return items.reduce((acc, it) => acc + (Number(it.total) || 0), 0);
  }, [items]);

  const handleConfirmBill = async () => {
    if (items.length === 0) {
      setError("બિલમાં ઓછામાં ઓછી ૧ પ્રોડક્ટ હોવી જરૂરી છે.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const payload = {
        customer_id: selectedCustomerId || null,
        items: items.map((i) => ({
          product_id: i.product_id || allProducts[0]?.id,
          quantity: i.quantity,
          discount_percent: 0,
        })),
        payments: [{ method: paymentType === "upi" ? "upi" : "cash", amount: grandTotal }],
      };

      const res = await authPost<{ id: string }>("/api/v1/invoices", payload, {
        "Idempotency-Key": "ai-" + crypto.randomUUID(),
      });

      router.push(`/invoices/${res.id}`);
    } catch (err: unknown) {
      const e = err as { message?: string };
      setError(e.message || "બિલ બનાવવામાં સમસ્યા આવી");
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-emerald-50/50 p-4 md:p-8">
      {/* Top Header */}
      <div className="mx-auto max-w-7xl mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-emerald-950 flex items-center gap-2">
            ⚡ AI Smart Review (ઓટોમેટિક બિલ)
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            કેમેરામાંથી ઓટો-મેચ થયેલી પ્રોડક્ટ્સ, ભાવ અને રકમ
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setIsCameraOpen(true)}
            className="flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-bold text-white shadow hover:bg-emerald-800 transition"
          >
            📷 બીજો ફોટો ઉમેરો
          </button>
          <Link
            href="/billing/new"
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50"
          >
            ← પાછા જાઓ
          </Link>
        </div>
      </div>

      {error && (
        <div className="mx-auto max-w-7xl mb-6 rounded-xl bg-red-50 p-4 border border-red-200 text-sm font-bold text-red-700">
          ⚠️ {error}
        </div>
      )}

      {/* Main Grid */}
      <div className="mx-auto max-w-7xl grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Column: Photos */}
        <div className="lg:col-span-5 flex flex-col justify-between rounded-2xl bg-white p-5 shadow-sm border border-emerald-100">
          <div>
            <div className="flex items-center justify-between border-b border-gray-100 pb-3 mb-3">
              <span className="text-xs font-black uppercase tracking-wider text-emerald-800">
                🖼️ સ્કેન કરેલ ફોટો ({capturedPhotos.length})
              </span>
            </div>

            {capturedPhotos.length === 0 ? (
              <div
                onClick={() => setIsCameraOpen(true)}
                className="cursor-pointer rounded-xl border-2 border-dashed border-emerald-300 bg-emerald-50/40 p-10 text-center hover:bg-emerald-50"
              >
                <span className="text-4xl block mb-2">📸</span>
                <p className="text-sm font-bold text-emerald-950">ફોટો પાડવા અહીં ક્લિક કરો</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 overflow-y-auto max-h-[440px] p-1">
                {capturedPhotos.map((url, idx) => (
                  <div key={idx} className="relative aspect-square rounded-xl overflow-hidden border border-slate-200 bg-black shadow-sm">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt={`Photo ${idx + 1}`} className="h-full w-full object-contain" />
                    <span className="absolute bottom-1.5 left-1.5 bg-black/70 text-[10px] font-bold text-white px-2 py-0.5 rounded">
                      #{idx + 1}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {analyzing && (
            <div className="mt-4 rounded-xl bg-emerald-50 p-3 text-center text-xs font-bold text-emerald-800 animate-pulse border border-emerald-200">
              🤖 AI કેટલોગમાંથી પ્રોડક્ટ અને સાચો ભાવ લિંક કરી રહ્યું છે...
            </div>
          )}
        </div>

        {/* Right Column: 100% Automatic Draft Bill Table */}
        <div className="lg:col-span-7 flex flex-col justify-between rounded-2xl bg-white p-6 shadow-sm border border-emerald-100">
          <div>
            <div className="flex items-center justify-between border-b border-gray-100 pb-3 mb-4">
              <h3 className="text-base font-black text-gray-900">
                🧾 ઓટો-મેચ થયેલ બિલ આઇટમ્સ ({items.length})
              </h3>
            </div>

            {items.length === 0 ? (
              <p className="py-12 text-center text-xs text-gray-400">કેમેરાથી ફોટો લો એટલે બધી વસ્તુઓ આપોઆપ અહીં દેખાશે.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-xs font-extrabold text-gray-500 uppercase tracking-wider">
                      <th className="py-2.5">પ્રોડક્ટનું નામ</th>
                      <th className="py-2.5 text-center w-28">જથ્થો (QTY)</th>
                      <th className="py-2.5 text-right w-24">ભાવ (RATE)</th>
                      <th className="py-2.5 text-right w-28">કુલ રકમ</th>
                      <th className="py-2.5 w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 font-medium">
                    {items.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/70 transition">
                        <td className="py-3.5">
                          <span className="font-extrabold text-gray-900 text-base block">
                            {item.name}
                          </span>
                          {item.isMatched ? (
                            <span className="inline-block mt-1 bg-emerald-100 text-emerald-800 text-[10px] font-black px-2 py-0.5 rounded-full border border-emerald-300">
                              ✓ કેટલોગમાંથી આપોઆપ મેચ થયેલ
                            </span>
                          ) : (
                            <span className="inline-block mt-1 bg-amber-100 text-amber-900 text-[10px] font-black px-2 py-0.5 rounded-full border border-amber-300">
                              ⚠️ કેટલોગમાં નથી (ભાવ લખો)
                            </span>
                          )}
                        </td>

                        <td className="py-3.5 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => updateQty(idx, item.quantity - 1)}
                              className="h-7 w-7 rounded bg-gray-200 text-sm font-bold text-gray-700 hover:bg-gray-300"
                            >
                              -
                            </button>
                            <span className="w-8 text-center font-bold text-gray-900 font-mono text-sm">
                              {item.quantity}
                            </span>
                            <button
                              type="button"
                              onClick={() => updateQty(idx, item.quantity + 1)}
                              className="h-7 w-7 rounded bg-emerald-700 text-sm font-bold text-white hover:bg-emerald-800"
                            >
                              +
                            </button>
                          </div>
                        </td>

                        <td className="py-3.5 text-right">
                          {item.isMatched ? (
                            <span className="font-bold text-gray-800 font-mono text-sm">
                              ₹{item.rate.toFixed(2)}
                            </span>
                          ) : (
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={item.rate || ""}
                              onChange={(e) => updateRate(idx, parseFloat(e.target.value) || 0)}
                              placeholder="0.00"
                              className="w-20 rounded border border-amber-300 bg-amber-50 p-1 text-right text-xs font-bold text-gray-900"
                            />
                          )}
                        </td>

                        <td className="py-3.5 text-right font-black text-emerald-900 font-mono text-base">
                          ₹{item.total.toFixed(2)}
                        </td>

                        <td className="py-3.5 text-right">
                          <button
                            type="button"
                            onClick={() => removeItem(idx)}
                            className="text-gray-400 hover:text-red-500 text-sm font-bold p-1"
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Bottom Confirm Action - ZERO SELECTION NEEDED */}
          <div className="mt-8 border-t border-gray-100 pt-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <span className="text-xs text-gray-500 font-semibold block">કુલ બિલ રકમ:</span>
                <p className="text-3xl font-black text-emerald-950 font-mono">
                  ₹{grandTotal.toFixed(2)}
                </p>
                <span className="text-xs text-emerald-700 font-bold">✓ રોકડ ચૂકતે (CASH)</span>
              </div>

              <button
                type="button"
                onClick={handleConfirmBill}
                disabled={submitting || items.length === 0}
                className="flex items-center gap-2 rounded-xl bg-emerald-700 px-8 py-3.5 text-base font-black text-white shadow-xl hover:bg-emerald-800 disabled:opacity-50 transition"
              >
                {submitting ? "બિલ બની રહ્યું છે..." : "⚡ બિલ કન્ફર્મ કરો →"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Camera Capture Modal */}
      <WebcamCaptureModal
        isOpen={isCameraOpen}
        onClose={() => setIsCameraOpen(false)}
        onCapture={(blob, dataUrl) => processPhotoToSession(blob, dataUrl)}
      />
    </main>
  );
}