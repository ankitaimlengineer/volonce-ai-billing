"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ApiError, authGet, authPost, clearTokens } from "@/lib/api";

interface ScannedItem {
  raw_name: string;
  matched_product_id: string | null;
  matched_product_name: string | null;
  confidence: number;
  quantity: number;
  rate: number;
  tax_percent: number;
  total: number;
}

interface Product {
  id: string;
  name: string;
  selling_price: string;
  tax_percent: string;
}

interface ScanBillApiResponse {
  invoice_number: string | null;
  invoice_date: string | null;
  items: ScannedItem[];
  subtotal: number;
  tax_total: number;
  grand_total: number;
  overall_confidence: number;
  duplicate_info?: {
    is_duplicate: boolean;
    reason: string | null;
  };
}

export default function AiReviewPage() {
  const router = useRouter();

  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [items, setItems] = useState<ScannedItem[]>([]);
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [isDuplicate, setIsDuplicate] = useState(false);
  const [duplicateReason, setDuplicateReason] = useState<string | null>(null);
  const [overallConfidence, setOverallConfidence] = useState(95.0);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "upi">("cash");
  const [loadingAi, setLoadingAi] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleAuthError = () => {
    clearTokens();
    router.replace("/login");
  };

  useEffect(() => {
    let active = true;

    async function initializeAiReview() {
      // 1. Fetch catalog products for dropdown fallback
      try {
        const res = await authGet<{ items: Product[] }>("/api/v1/products?page_size=100");
        if (active) setAllProducts(res.items || []);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          handleAuthError();
          return;
        }
      }

      // 2. Fetch image from session storage
      const storedImg = sessionStorage.getItem("volonce_scanned_img");
      if (!storedImg) {
        if (active) setLoadingAi(false);
        return;
      }

      if (active) setImagePreview(storedImg);

      // 3. Process image through AI Backend
      try {
        const imgRes = await fetch(storedImg);
        const blob = await imgRes.blob();

        const form = new FormData();
        form.append("file", blob, "scan.jpg");

        const token = localStorage.getItem("access_token");
        const apiRes = await fetch("http://localhost:8000/api/v1/ai/scan-bill", {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: form,
        });

        if (apiRes.status === 401) {
          handleAuthError();
          return;
        }

        if (!apiRes.ok) {
          const errData = await apiRes.json().catch(() => ({}));
          console.error("Backend Error Details:", apiRes.status, errData);
          throw new Error(errData.detail || `AI સ્કેન નિષ્ફળ ગયું (Status: ${apiRes.status})`);
        }
        const data = (await apiRes.json()) as ScanBillApiResponse;

        if (active) {
          setItems(data.items || []);
          setOverallConfidence(Number(data.overall_confidence) || 95.0);
          if (data.duplicate_info?.is_duplicate) {
            setIsDuplicate(true);
            setDuplicateReason(data.duplicate_info.reason || "આ બિલ અગાઉ નોંધાઈ ચૂક્યું છે.");
          }
        }
      } catch (err) {
        console.error("AI Scan error:", err);
      } finally {
        if (active) setLoadingAi(false);
      }
    }

    initializeAiReview();

    return () => {
      active = false;
    };
  }, []);

  // Update item quantity
  const updateQty = (index: number, newQty: number) => {
    if (newQty < 1) return;
    setItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;
        const rate = Number(item.rate) || 0;
        const taxPct = Number(item.tax_percent) || 0;
        const base = rate * newQty;
        const tax = (base * taxPct) / 100;
        return {
          ...item,
          quantity: newQty,
          total: Math.round((base + tax) * 100) / 100,
        };
      })
    );
  };

  // Switch product manually
  const switchProduct = (index: number, prodId: string) => {
    const prod = allProducts.find((p) => p.id === prodId);
    if (!prod) return;

    setItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;
        const rate = Number(prod.selling_price) || 0;
        const taxPct = Number(prod.tax_percent) || 0;
        const base = rate * item.quantity;
        const tax = (base * taxPct) / 100;
        return {
          ...item,
          matched_product_id: prod.id,
          matched_product_name: prod.name,
          rate,
          tax_percent: taxPct,
          confidence: 100.0,
          total: Math.round((base + tax) * 100) / 100,
        };
      })
    );
  };

  // Remove item
  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  // Calculations
  const calculations = useMemo(() => {
    let subtotal = 0;
    let taxTotal = 0;

    items.forEach((item) => {
      const rate = Number(item.rate) || 0;
      const taxPct = Number(item.tax_percent) || 0;
      const base = rate * item.quantity;
      const tax = (base * taxPct) / 100;
      subtotal += base;
      taxTotal += tax;
    });

    const grandTotal = Math.round((subtotal + taxTotal) * 100) / 100;
    return {
      subtotal: Math.round(subtotal * 100) / 100,
      taxTotal: Math.round(taxTotal * 100) / 100,
      grandTotal,
    };
  }, [items]);

  // Final One-Click Bill Confirmation
  const handleConfirmBill = async () => {
    if (items.length === 0) {
      setError("બિલમાં ઓછામાં ઓછી ૧ પ્રોડક્ટ હોવી જરૂરી છે.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const payload = {
        customer_id: null,
        items: items.map((i) => ({
          product_id: i.matched_product_id || allProducts[0]?.id,
          quantity: i.quantity,
          discount_percent: 0,
        })),
        payments: [
          {
            method: paymentMethod,
            amount: calculations.grandTotal,
          },
        ],
      };

      const idempotencyKey = "ai-" + crypto.randomUUID();
      const res = await authPost<{ id: string }>("/api/v1/invoices", payload, {
        "Idempotency-Key": idempotencyKey,
      });

      sessionStorage.removeItem("volonce_scanned_img");
      router.push(`/invoices/${res.id}`);
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 401) {
        handleAuthError();
        return;
      }
      const e = err as { message?: string };
      setError(e.message || "બિલ બનાવવામાં સમસ્યા આવી");
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 p-4 md:p-8">
      {/* Top Header */}
      <div className="mx-auto max-w-7xl mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-black text-slate-900">
              🤖 AI Review Screen (ડ્રાફ્ટ બિલ ચકાસણી)
            </h1>
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">
              AI Confidence: {overallConfidence}%
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Gemini Vision દ્વારા ઓળખાયેલ પ્રોડક્ટ્સ અને ડેટાબેઝ ભાવ
          </p>
        </div>

        <Link
          href="/billing/new"
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition"
        >
          ← રદ કરો / પાછા જાઓ
        </Link>
      </div>

      {error && (
        <div className="mx-auto max-w-7xl mb-6 rounded-xl bg-red-50 p-4 border border-red-200 text-sm font-medium text-red-700">
          ⚠️ {error}
        </div>
      )}

      {/* Duplicate Alert Banner */}
      {isDuplicate && (
        <div className="mx-auto max-w-7xl mb-6 rounded-xl bg-amber-50 p-4 border border-amber-300 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">⚠️</span>
            <div>
              <p className="text-sm font-bold text-amber-900">ડુપ્લિકેટ બિલ ચેતવણી!</p>
              <p className="text-xs text-amber-700">{duplicateReason}</p>
            </div>
          </div>
          <button
            onClick={() => setIsDuplicate(false)}
            className="text-xs font-bold text-amber-800 underline"
          >
            તેમ છતાં આગળ વધો
          </button>
        </div>
      )}

      {/* Main Grid */}
      <div className="mx-auto max-w-7xl grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Column: Scanned Image */}
        <div className="lg:col-span-5 rounded-2xl bg-white p-5 shadow-sm border border-slate-200">
          <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center justify-between">
            <span>📸 સ્કેન કરેલ અસલ ફોટો</span>
            <span className="text-xs text-slate-400 font-normal">Original Scan</span>
          </h3>

          <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-slate-900 flex items-center justify-center">
            {imagePreview ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={imagePreview}
                alt="Scanned item preview"
                className="h-full w-full object-contain"
              />
            ) : (
              <div className="text-center p-6 text-slate-400 text-xs">
                કોઈ ફોટો ઉપલબ્ધ નથી
              </div>
            )}
          </div>

          <div className="mt-4 rounded-xl bg-slate-50 p-3 border border-slate-100">
            <p className="text-xs text-slate-600 font-medium leading-relaxed">
              💡 <b>Gemini Vision:</b> ફોટામાં રહેલી પ્રોડક્ટ્સને ઓળખીને કેટલોગમાંથી સાચા ભાવ લાવી દેવામાં આવ્યા છે.
            </p>
          </div>
        </div>

        {/* Right Column: AI Draft Bill */}
        <div className="lg:col-span-7 flex flex-col justify-between rounded-2xl bg-white p-6 shadow-sm border border-slate-200">
          <div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h3 className="text-base font-bold text-slate-900">
                📝 AI તૈયાર કરેલ ડ્રાફ્ટ બિલ (Draft Bill)
              </h3>
              <span className="text-xs font-semibold text-slate-500">
                {items.length} પ્રોડક્ટ્સ ઓળખાઈ
              </span>
            </div>

            {loadingAi ? (
              <div className="py-12 text-center text-slate-500 text-sm animate-pulse">
                🤖 AI ફોટામાંથી પ્રોડક્ટ્સ ઓળખી રહ્યું છે... કૃપા કરીને થોડીવાર રાહ જુઓ.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase">
                      <th className="py-2.5">પ્રોડક્ટ</th>
                      <th className="py-2.5">Confidence</th>
                      <th className="py-2.5">જથ્થો (Qty)</th>
                      <th className="py-2.5">ભાવ (Rate)</th>
                      <th className="py-2.5 text-right">રકમ</th>
                      <th className="py-2.5"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {items.map((item, idx) => {
                      const isHigh = item.confidence >= 90;
                      const isMedium = item.confidence >= 70 && item.confidence < 90;

                      return (
                        <tr key={idx} className="hover:bg-slate-50/70 transition">
                          <td className="py-3">
                            <span className="font-bold text-slate-900 block text-xs mb-1">
                              {item.raw_name}
                            </span>
                            <select
                              value={item.matched_product_id || ""}
                              onChange={(e) => switchProduct(idx, e.target.value)}
                              className="w-44 text-xs text-slate-700 bg-slate-100 border border-slate-200 rounded-lg p-1"
                            >
                              <option value="">(કેટલોગ સાથે મેચ કરો)</option>
                              {allProducts.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name} (₹{Number(p.selling_price || 0).toFixed(2)})
                                </option>
                              ))}
                            </select>
                          </td>

                          <td className="py-3">
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold ${
                                isHigh
                                  ? "bg-emerald-100 text-emerald-800"
                                  : isMedium
                                  ? "bg-amber-100 text-amber-800"
                                  : "bg-red-100 text-red-800"
                              }`}
                            >
                              {Number(item.confidence || 0).toFixed(1)}%
                            </span>
                          </td>

                          <td className="py-3">
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => updateQty(idx, item.quantity - 1)}
                                className="h-6 w-6 rounded bg-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-300"
                              >
                                -
                              </button>
                              <span className="w-6 text-center font-bold text-slate-800">
                                {item.quantity}
                              </span>
                              <button
                                type="button"
                                onClick={() => updateQty(idx, item.quantity + 1)}
                                className="h-6 w-6 rounded bg-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-300"
                              >
                                +
                              </button>
                            </div>
                          </td>

                          <td className="py-3 font-medium text-slate-700">
                            ₹{Number(item.rate || 0).toFixed(2)}
                          </td>

                          <td className="py-3 text-right font-bold text-slate-900">
                            ₹{Number(item.total || 0).toFixed(2)}
                          </td>

                          <td className="py-3 text-right">
                            <button
                              type="button"
                              onClick={() => removeItem(idx)}
                              className="text-slate-400 hover:text-red-500 text-sm font-bold"
                            >
                              ✕
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Payment Method Option */}
            <div className="mt-6 border-t border-slate-100 pt-4 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-600">
                ચુકવણી પદ્ધતિ (Payment Mode):
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentMethod("cash")}
                  className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                    paymentMethod === "cash"
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  💵 રોકડ (Cash)
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod("upi")}
                  className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                    paymentMethod === "upi"
                      ? "bg-blue-600 text-white shadow-sm"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  📱 UPI
                </button>
              </div>
            </div>
          </div>

          {/* Bottom Summary & One-Click Confirm Action */}
          <div className="mt-8 border-t border-slate-100 pt-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <span className="text-xs text-slate-500">ટેક્સ સહિત કુલ રકમ</span>
                <p className="text-2xl font-black text-slate-900">
                  ₹{Number(calculations.grandTotal || 0).toFixed(2)}
                </p>
                <p className="text-xs text-slate-400">
                  (GST: ₹{Number(calculations.taxTotal || 0).toFixed(2)})
                </p>
              </div>

              <button
                type="button"
                onClick={handleConfirmBill}
                disabled={submitting || items.length === 0}
                className="flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-3.5 text-sm font-bold text-white shadow-lg hover:bg-emerald-500 disabled:opacity-50 transition"
              >
                {submitting ? "બિલ બની રહ્યું છે..." : "✓ Confirm & Create Final Bill"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}