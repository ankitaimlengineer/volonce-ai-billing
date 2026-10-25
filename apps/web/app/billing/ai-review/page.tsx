"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { authGet, authPost } from "@/lib/api";

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

interface Customer {
  id: string;
  name: string;
  mobile: string | null;
  outstanding: string;
}

export default function AiReviewPage() {
  const router = useRouter();

  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [items, setItems] = useState<ScannedItem[]>([]);
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");

  // Payment Mode: "cash" | "upi" | "credit" (ઉધાર) | "partial" (અડધા રોકડા / અડધા ઉધાર)
  const [paymentType, setPaymentType] = useState<"cash" | "upi" | "credit" | "partial">("cash");
  const [paidAmountInput, setPaidAmountInput] = useState<string>("");

  const [isDuplicate, setIsDuplicate] = useState(false);
  const [duplicateReason, setDuplicateReason] = useState<string | null>(null);
  const [overallConfidence, setOverallConfidence] = useState(95.0);
  const [loadingAi, setLoadingAi] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function initializeAiReview() {
      // 1. Fetch catalog products and customer list
      try {
        const [prodRes, custRes] = await Promise.all([
  authGet<{ items: Product[] }>("/api/v1/products?page_size=100"),
  authGet<{ items: Customer[] }>("/api/v1/customers?page_size=100"),
]);
        if (active) {
          setAllProducts(prodRes.items || []);
          setCustomers(custRes.items || []);
        }
      } catch (e) {
        console.error("Loading error", e);
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

        const formData = new FormData();
        formData.append("file", blob, "scan.jpg");

        const token = localStorage.getItem("access_token");
        const apiRes = await fetch("http://localhost:8000/api/v1/ai/scan-bill", {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: formData,
        });

        if (!apiRes.ok) throw new Error("AI સ્કેન નિષ્ફળ ગયું");
        const data = await apiRes.json();

        if (active) {
          setItems(data.items || []);
          setOverallConfidence(Number(data.overall_confidence) || 95.0);
          if (data.duplicate_info?.is_duplicate) {
            setIsDuplicate(true);
            setDuplicateReason(data.duplicate_info.reason || "આ બિલ અગાઉ નોંધાઈ ચૂક્યું છે.");
          }
        }
      } catch (err) {
        console.error("AI Scan error, using local fallback:", err);
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

  // Determine Paid and Due Amounts based on Payment Type
  const { calculatedPaid, calculatedDue } = useMemo(() => {
    const total = calculations.grandTotal;
    if (paymentType === "cash" || paymentType === "upi") {
      return { calculatedPaid: total, calculatedDue: 0 };
    }
    if (paymentType === "credit") {
      return { calculatedPaid: 0, calculatedDue: total };
    }
    // Partial payment
    const entered = Number(paidAmountInput) || 0;
    const paid = Math.min(total, Math.max(0, entered));
    const due = Math.round((total - paid) * 100) / 100;
    return { calculatedPaid: paid, calculatedDue: due };
  }, [calculations.grandTotal, paymentType, paidAmountInput]);

  // Final Bill Confirmation
  const handleConfirmBill = async () => {
    if (items.length === 0) {
      setError("બિલમાં ઓછામાં ઓછી ૧ પ્રોડક્ટ હોવી જરૂરી છે.");
      return;
    }

    // Validation: Udhar requires a registered customer
    if (calculatedDue > 0 && !selectedCustomerId) {
      setError("ઉધાર (બાકી) બિલ બનાવવા માટે ગ્રાહકનું નામ પસંદ કરવું ફરજિયાત છે.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      // Build payments array
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
          product_id: i.matched_product_id || allProducts[0]?.id,
          quantity: i.quantity,
          discount_percent: 0,
        })),
        payments,
      };

      const idempotencyKey = "ai-" + crypto.randomUUID();
      const res = await authPost<{ id: string }>("/api/v1/invoices", payload, {
        "Idempotency-Key": idempotencyKey,
      });

      sessionStorage.removeItem("volonce_scanned_img");
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
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-black text-emerald-950">
              🤖 AI Review Screen (ડ્રાફ્ટ બિલ ચકાસણી)
            </h1>
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800 border border-emerald-300">
              AI Confidence: {overallConfidence}%
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            કેમેરાથી સ્કેન કરેલ પ્રોડક્ટ્સ, ગ્રાહકની વિગત અને રોકડ/ઉધાર ચૂકવણી
          </p>
        </div>

        <Link
          href="/billing/new"
          className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 transition"
        >
          ← રદ કરો / પાછા જાઓ
        </Link>
      </div>

      {error && (
        <div className="mx-auto max-w-7xl mb-6 rounded-xl bg-red-50 p-4 border border-red-200 text-sm font-bold text-red-700">
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
        <div className="lg:col-span-5 rounded-2xl bg-white p-5 shadow-sm border border-emerald-100">
          <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center justify-between">
            <span>📸 સ્કેન કરેલ અસલ ફોટો</span>
            <span className="text-xs text-gray-400 font-normal">Original Scan</span>
          </h3>

          <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-black flex items-center justify-center">
            {imagePreview ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={imagePreview}
                alt="Scanned item preview"
                className="h-full w-full object-contain"
              />
            ) : (
              <div className="text-center p-6 text-gray-400 text-xs">
                કોઈ ફોટો ઉપલબ્ધ નથી
              </div>
            )}
          </div>

          <div className="mt-4 rounded-xl bg-emerald-50 p-3 border border-emerald-200/80">
            <p className="text-xs text-emerald-900 font-medium leading-relaxed">
              💡 <b>Gemini Vision:</b> ફોટામાં રહેલી પ્રોડક્ટ્સ ઓળખીને કેટલોગમાંથી ભાવ લાવી દેવામાં આવ્યા છે. તમે જથ્થો કે ભાવ મેન્યુઅલી બદલી શકો છો.
            </p>
          </div>
        </div>

        {/* Right Column: AI Draft Bill & Customer / Payment Settings */}
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
                📝 AI તૈયાર કરેલ ડ્રાફ્ટ બિલ
              </h3>
              <span className="text-xs font-semibold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                {items.length} પ્રોડક્ટ્સ ઓળખાઈ
              </span>
            </div>

            {loadingAi ? (
              <div className="py-12 text-center text-emerald-800 text-sm font-semibold animate-pulse">
                🤖 AI ફોટામાંથી પ્રોડક્ટ્સ ઓળખી રહ્યું છે... કૃપા કરીને થોડીવાર રાહ જુઓ.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-xs font-bold text-gray-500 uppercase">
                      <th className="py-2.5">પ્રોડક્ટ</th>
                      <th className="py-2.5">Confidence</th>
                      <th className="py-2.5 text-center">જથ્થો (Qty)</th>
                      <th className="py-2.5">ભાવ (Rate)</th>
                      <th className="py-2.5 text-right">રકમ</th>
                      <th className="py-2.5"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {items.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/70 transition">
                        <td className="py-3">
                          <span className="font-bold text-gray-900 block text-xs mb-1">
                            {item.raw_name}
                          </span>
                          <select
                            value={item.matched_product_id || ""}
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
                          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                            {Number(item.confidence || 0).toFixed(0)}%
                          </span>
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
                            <span className="w-6 text-center font-bold text-gray-800">
                              {item.quantity}
                            </span>
                            <button
                              type="button"
                              onClick={() => updateQty(idx, item.quantity + 1)}
                              className="h-6 w-6 rounded bg-gray-200 text-xs font-bold text-gray-700 hover:bg-gray-300"
                            >
                              +
                            </button>
                          </div>
                        </td>

                        <td className="py-3 font-medium text-gray-700 font-mono">
                          ₹{Number(item.rate || 0).toFixed(2)}
                        </td>

                        <td className="py-3 text-right font-black text-gray-900 font-mono">
                          ₹{Number(item.total || 0).toFixed(2)}
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

            {/* Payment Method Selector (રોકડ / UPI / ઉધાર / આંશિક) */}
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
    </main>
  );
}