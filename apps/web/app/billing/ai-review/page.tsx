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
}

interface Product {
  id: string;
  name: string;
  selling_price: string;
  tax_percent: string;
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

export default function AiReviewPage() {
  const router = useRouter();

  // સેશન અને મલ્ટી-ફોટો સ્ટેટ્સ
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [capturedPhotos, setCapturedPhotos] = useState<string[]>([]);
  const [isCameraOpen, setIsCameraOpen] = useState(false);

  // બિલ આઇટમ્સ અને ડેટાબેઝ લિસ્ટ
  const [items, setItems] = useState<DraftItem[]>([]);
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");

  // પેમેન્ટ મોડ
  const [paymentType, setPaymentType] = useState<"cash" | "upi" | "credit" | "partial">("cash");
  const [paidAmountInput, setPaidAmountInput] = useState<string>("");

  const [analyzing, setAnalyzing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);

  // ૧. ફોટો પ્રોસેસ કરવાનું ફંક્શન પહેલેથી વ્યાખ્યાયિત (Declared first)
  const processPhotoToSession = useCallback(
    async (blob: Blob, dataUrl: string, targetSessionId?: string) => {
      const sId = targetSessionId || sessionId;
      if (!sId) return;

      setAnalyzing(true);
      setError("");
      setDuplicateWarning(null);

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

        if (data.is_duplicate_photo) {
          setDuplicateWarning("⚠️ આ ફોટો અગાઉ આવી ચૂક્યો છે. ડબલ કાઉન્ટિંગ અટકાવવામાં આવ્યું છે.");
        }

        // અપડેટેડ કન્સોલિડેટેડ ડ્રાફ્ટ ફેચ કરો (Strict typing, no any)
        const draftRes = await authGet<DraftBillResponse>(`/api/v1/ai/sessions/${sId}/draft`);
        setItems(
          (draftRes.items || []).map((it) => ({
            product_id: it.product_id,
            name: it.name,
            quantity: Number(it.quantity) || 1,
            rate: Number(it.rate) || 0,
            tax_percent: Number(it.tax_percent) || 0,
            total: Number(it.total) || 0,
            confidence: Number(it.confidence) || 95,
          }))
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "ફોટો પ્રોસેસ કરવામાં સમસ્યા આવી";
        setError(msg);
      } finally {
        setAnalyzing(false);
      }
    },
    [sessionId]
  );

  // ૨. શરૂઆતમાં ડેટા લોડ કરો અને નવું કેમેરા સેશન બનાવો
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
        setAllProducts(prodRes.items || []);
        setCustomers(custRes.items || []);
        setSessionId(sessRes.id);

        // જો અગાઉથી કોઈ ફોટો સેશન સ્ટોરેજમાં હોય તો પ્રોસેસ કરો
        const storedImg = sessionStorage.getItem("volonce_scanned_img");
        if (storedImg) {
          sessionStorage.removeItem("volonce_scanned_img");
          const imgRes = await fetch(storedImg);
          const blob = await imgRes.blob();
          await processPhotoToSession(blob, storedImg, sessRes.id);
        }
      } catch (err) {
        console.error("Initialization error:", err);
      }
    }

    init();

    return () => {
      active = false;
    };
  }, [processPhotoToSession]);

  // ૩. જથ્થો (+ / -) ફેરફાર
  const updateQty = (index: number, newQty: number) => {
    if (newQty < 1) return;
    setItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;
        const base = item.rate * newQty;
        const tax = (base * item.tax_percent) / 100;
        return {
          ...item,
          quantity: newQty,
          total: Math.round((base + tax) * 100) / 100,
        };
      })
    );
  };

  // ૪. પ્રોડક્ટ મેન્યુઅલ સિલેક્ટ કરવી
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
          product_id: prod.id,
          name: prod.name,
          rate,
          tax_percent: taxPct,
          confidence: 100,
          total: Math.round((base + tax) * 100) / 100,
        };
      })
    );
  };

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  // ૫. ટોટલ રકમ અને ઉધારી ગણતરી
  const calculations = useMemo(() => {
    let subtotal = 0;
    let taxTotal = 0;
    items.forEach((it) => {
      const base = it.rate * it.quantity;
      const tax = (base * it.tax_percent) / 100;
      subtotal += base;
      taxTotal += tax;
    });
    const grandTotal = Math.round((subtotal + taxTotal) * 100) / 100;
    return { subtotal, taxTotal, grandTotal };
  }, [items]);

  const { calculatedPaid, calculatedDue } = useMemo(() => {
    const total = calculations.grandTotal;
    if (paymentType === "cash" || paymentType === "upi") return { calculatedPaid: total, calculatedDue: 0 };
    if (paymentType === "credit") return { calculatedPaid: 0, calculatedDue: total };
    const entered = Number(paidAmountInput) || 0;
    const paid = Math.min(total, Math.max(0, entered));
    const due = Math.round((total - paid) * 100) / 100;
    return { calculatedPaid: paid, calculatedDue: due };
  }, [calculations.grandTotal, paymentType, paidAmountInput]);

  // ૬. ડ્રાફ્ટ સેવ કરો (Save Draft)
  const handleSaveDraft = async () => {
    if (!draftId) return;
    try {
      await authPut(`/api/v1/ai/drafts/${draftId}`, {
        customer_id: selectedCustomerId || null,
        items: items.map((it) => ({
          product_id: it.product_id,
          name: it.name,
          quantity: it.quantity,
          rate: it.rate,
          tax_percent: it.tax_percent,
        })),
      });
      alert("✓ ડ્રાફ્ટ બિલ સફળતાપૂર્વક સેવ થઈ ગયું છે!");
    } catch {
      alert("ડ્રાફ્ટ સેવ કરવામાં સમસ્યા આવી.");
    }
  };

  // ૭. ફાઇનલ બિલ કન્ફર્મ કરો (Create Official Invoice)
  const handleConfirmBill = async () => {
    if (items.length === 0) {
      setError("બિલમાં ઓછામાં ઓછી ૧ પ્રોડક્ટ હોવી જરૂરી છે.");
      return;
    }
    if (calculatedDue > 0 && !selectedCustomerId) {
      setError("ઉધાર (બાકી) બિલ બનાવવા માટે ગ્રાહકનું નામ પસંદ કરવું ફરજિયાત છે.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const payments = [];
      if (calculatedPaid > 0) {
        payments.push({
          method: paymentType === "upi" ? "upi" : "cash",
          amount: calculatedPaid,
        });
      }

      const payload = {
        customer_id: selectedCustomerId || null,
        items: items.map((i) => ({
          product_id: i.product_id || allProducts[0]?.id,
          quantity: i.quantity,
          discount_percent: 0,
        })),
        payments,
      };

      const idempotencyKey = "ai-" + crypto.randomUUID();
      const res = await authPost<{ id: string }>("/api/v1/invoices", payload, {
        "Idempotency-Key": idempotencyKey,
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
            📸 Multi-Photo AI Review Screen (ડ્રાફ્ટ બિલ ચકાસણી)
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            એક કરતાં વધુ ફોટા પાડીને તમામ સામાનનું એક જ પાકું બિલ તૈયાર કરો
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setIsCameraOpen(true)}
            className="flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-bold text-white shadow hover:bg-emerald-800 transition"
          >
            📷 બીજો ફોટો ઉમેરો (Add Photo)
          </button>
          <Link
            href="/billing/new"
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 transition"
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

      {duplicateWarning && (
        <div className="mx-auto max-w-7xl mb-6 rounded-xl bg-amber-50 p-4 border border-amber-300 text-sm font-bold text-amber-900">
          {duplicateWarning}
        </div>
      )}

      {/* Main Grid */}
      <div className="mx-auto max-w-7xl grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Column: Photos Gallery in this Session */}
        <div className="lg:col-span-5 flex flex-col justify-between rounded-2xl bg-white p-5 shadow-sm border border-emerald-100">
          <div>
            <div className="flex items-center justify-between border-b border-gray-100 pb-3 mb-3">
              <span className="text-xs font-black uppercase tracking-wider text-emerald-800">
                🖼️ સેશન ફોટા ({capturedPhotos.length})
              </span>
              <button
                type="button"
                onClick={() => setIsCameraOpen(true)}
                className="text-xs font-bold text-emerald-700 hover:underline"
              >
                + ફોટો લો
              </button>
            </div>

            {capturedPhotos.length === 0 ? (
              <div
                onClick={() => setIsCameraOpen(true)}
                className="cursor-pointer rounded-xl border-2 border-dashed border-emerald-300 bg-emerald-50/40 p-10 text-center hover:bg-emerald-50 transition"
              >
                <span className="text-4xl block mb-2">📸</span>
                <p className="text-sm font-bold text-emerald-950">ફોટો પાડવા અહીં ક્લિક કરો</p>
                <p className="text-xs text-gray-500 mt-1">કાઉન્ટર પર સામાન રાખીને ૧ કે વધુ ફોટા લો</p>
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
              🤖 AI ફોટામાંથી પ્રોડક્ટ્સ અને જથ્થો ગણી રહ્યું છે...
            </div>
          )}
        </div>

        {/* Right Column: AI Consolidated Draft Bill & Controls */}
        <div className="lg:col-span-7 flex flex-col justify-between rounded-2xl bg-white p-6 shadow-sm border border-emerald-100">
          <div>
            {/* Customer Selector Section */}
            <div className="mb-5 rounded-xl bg-slate-50 p-4 border border-slate-200">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <label className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                  👤 ગ્રાહક પસંદ કરો (Customer / ખાતું):
                </label>
                <Link
                  href="/customers"
                  target="_blank"
                  className="text-xs font-bold text-emerald-700 hover:underline"
                >
                  + નવો ગ્રાહક ઉમેરો
                </Link>
              </div>

              <select
                value={selectedCustomerId}
                onChange={(e) => setSelectedCustomerId(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white p-2.5 text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="">Walk-in Customer (રોકડ ગ્રાહક - ઉધાર નહીં)</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.mobile ? `(${c.mobile})` : ""} {Number(c.outstanding) > 0 ? `[જૂની બાકી: ₹${c.outstanding}]` : ""}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-between border-b border-gray-100 pb-3 mb-4">
              <h3 className="text-base font-bold text-gray-900">
                📝 AI તૈયાર કરેલ ડ્રાફ્ટ બિલ ({items.length} વસ્તુઓ)
              </h3>
              <button
                type="button"
                onClick={handleSaveDraft}
                className="text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200 hover:bg-emerald-100 transition"
              >
                💾 સેવ ડ્રાફ્ટ (Save Draft)
              </button>
            </div>

            {items.length === 0 ? (
              <p className="py-12 text-center text-xs text-gray-400">કેમેરાથી ફોટો લો એટલે બધી વસ્તુઓ અહીં દેખાશે.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-xs font-bold text-gray-500 uppercase">
                      <th className="py-2.5">પ્રોડક્ટ</th>
                      <th className="py-2.5 text-center">જથ્થો (Qty)</th>
                      <th className="py-2.5 text-right">ભાવ (Rate)</th>
                      <th className="py-2.5 text-right">રકમ</th>
                      <th className="py-2.5"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {items.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/70 transition">
                        <td className="py-3">
                          <span className="font-bold text-gray-900 block text-xs mb-1">
                            {item.name}
                          </span>
                          <select
                            value={item.product_id || ""}
                            onChange={(e) => switchProduct(idx, e.target.value)}
                            className="w-48 text-xs text-gray-700 bg-slate-100 border border-gray-200 rounded-lg p-1"
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
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => updateQty(idx, item.quantity - 1)}
                              className="h-6 w-6 rounded bg-gray-200 text-xs font-bold text-gray-700 hover:bg-gray-300"
                            >
                              -
                            </button>
                            <span className="w-6 text-center font-bold text-gray-800 font-mono">
                              {item.quantity}
                            </span>
                            <button
                              type="button"
                              onClick={() => updateQty(idx, item.quantity + 1)}
                              className="h-6 w-6 rounded bg-emerald-700 text-xs font-bold text-white hover:bg-emerald-800"
                            >
                              +
                            </button>
                          </div>
                        </td>

                        <td className="py-3 text-right font-medium text-gray-700 font-mono">
                          ₹{item.rate.toFixed(2)}
                        </td>

                        <td className="py-3 text-right font-black text-gray-900 font-mono">
                          ₹{item.total.toFixed(2)}
                        </td>

                        <td className="py-3 text-right">
                          <button
                            type="button"
                            onClick={() => removeItem(idx)}
                            className="text-gray-400 hover:text-red-500 text-sm font-bold ml-2"
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

            {/* Payment Method Selector */}
            <div className="mt-6 border-t border-gray-100 pt-4">
              <span className="text-xs font-bold text-gray-700 block mb-2">
                ચુકવણી પદ્ધતિ પસંદ કરો (Payment Mode):
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentType("cash")}
                  className={`rounded-xl py-2 px-3 text-xs font-bold transition border ${
                    paymentType === "cash"
                      ? "bg-emerald-700 text-white border-emerald-800 shadow"
                      : "bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100"
                  }`}
                >
                  💵 રોકડ (Cash)
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentType("upi")}
                  className={`rounded-xl py-2 px-3 text-xs font-bold transition border ${
                    paymentType === "upi"
                      ? "bg-emerald-700 text-white border-emerald-800 shadow"
                      : "bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100"
                  }`}
                >
                  📱 UPI (ઓનલાઇન)
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentType("credit")}
                  className={`rounded-xl py-2 px-3 text-xs font-bold transition border ${
                    paymentType === "credit"
                      ? "bg-amber-600 text-white border-amber-700 shadow"
                      : "bg-amber-50 text-amber-900 border-amber-200 hover:bg-amber-100"
                  }`}
                >
                  📒 પૂરેપૂરું ઉધાર (Credit)
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setPaymentType("partial");
                    if (!paidAmountInput) setPaidAmountInput(String(Math.floor(calculations.grandTotal / 2)));
                  }}
                  className={`rounded-xl py-2 px-3 text-xs font-bold transition border ${
                    paymentType === "partial"
                      ? "bg-indigo-600 text-white border-indigo-700 shadow"
                      : "bg-indigo-50 text-indigo-900 border-indigo-200 hover:bg-indigo-100"
                  }`}
                >
                  🪙 અડધા રોકડા / અડધા ઉધાર
                </button>
              </div>

              {/* Partial Payment Input Field */}
              {paymentType === "partial" && (
                <div className="mt-3 p-3 bg-indigo-50/60 rounded-xl border border-indigo-200 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <label className="text-xs font-bold text-indigo-950 block">
                      રોકડા મળેલ રકમ લખો (Paid Amount ₹):
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max={calculations.grandTotal}
                      value={paidAmountInput}
                      onChange={(e) => setPaidAmountInput(e.target.value)}
                      placeholder="દા.ત. 200"
                      className="mt-1 w-36 rounded-lg border border-indigo-300 bg-white p-2 text-sm font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                    />
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-indigo-900 block font-medium">ખાતામાં બાકી રહેશે (Udhar Due):</span>
                    <span className="text-base font-black text-red-600 font-mono">
                      ₹{calculatedDue.toFixed(2)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Bottom Summary & One-Click Confirm Action */}
          <div className="mt-8 border-t border-gray-100 pt-4">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
              <div>
                <span className="text-xs text-gray-500 block">કુલ બિલ રકમ:</span>
                <p className="text-2xl font-black text-emerald-900 font-mono">
                  ₹{calculations.grandTotal.toFixed(2)}
                </p>
                <div className="flex gap-3 text-xs font-semibold mt-0.5">
                  <span className="text-emerald-700">રોકડા: ₹{calculatedPaid.toFixed(2)}</span>
                  {calculatedDue > 0 && (
                    <span className="text-red-600 font-bold">ઉધાર બાકી: ₹{calculatedDue.toFixed(2)}</span>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={handleConfirmBill}
                disabled={submitting || items.length === 0}
                className="flex items-center gap-2 rounded-xl bg-emerald-700 px-6 py-3.5 text-sm font-bold text-white shadow-lg hover:bg-emerald-800 disabled:opacity-50 transition"
              >
                {submitting ? "બિલ બની રહ્યું છે..." : "✓ બિલ કન્ફર્મ કરો (Create Bill)"}
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