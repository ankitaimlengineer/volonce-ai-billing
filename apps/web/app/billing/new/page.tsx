"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError, authGet, authPost, clearTokens } from "@/lib/api";
import WebcamCaptureModal from "@/app/components/WebcamCaptureModal";

type Customer = { id: string; name: string; mobile: string | null };
type Product = {
  id: string;
  name: string;
  sku: string | null;
  unit: string;
  selling_price: string;
  tax_percent: string;
};
type Line = { product: Product; quantity: string; discount: string };
type Pay = { method: string; amount: string };
type Invoice = { id: string };

const input =
  "mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500";

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export default function NewBillPage() {
  const router = useRouter();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Product[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [pays, setPays] = useState<Pay[]>([{ method: "cash", amount: "" }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Webcam states
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);

  // One key per bill: a double click sends the same key (no duplicate bill)
  const keyRef = useRef("");

  useEffect(() => {
    keyRef.current = crypto.randomUUID();
  }, []);

  const onAuthError = useCallback(() => {
    clearTokens();
    router.replace("/login");
  }, [router]);

  useEffect(() => {
    let cancelled = false;
    authGet<{ items: Customer[] }>("/api/v1/customers?page_size=100")
      .then((res) => {
        if (!cancelled) setCustomers(res.items);
      })
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) onAuthError();
      });
    return () => {
      cancelled = true;
    };
  }, [onAuthError]);

  // Product search (debounced)
  useEffect(() => {
    const q = search.trim();
    let cancelled = false;
    const t = setTimeout(async () => {
      if (!q) {
        setResults([]);
        return;
      }
      try {
        const res = await authGet<{ items: Product[] }>(
          `/api/v1/products?q=${encodeURIComponent(q)}&page_size=8`
        );
        if (!cancelled) setResults(res.items);
      } catch {
        /* ignore search errors */
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [search]);

  function addProduct(p: Product) {
    setLines((ls) => {
      const i = ls.findIndex((l) => l.product.id === p.id);
      if (i >= 0) {
        return ls.map((l, idx) =>
          idx === i ? { ...l, quantity: String((Number(l.quantity) || 0) + 1) } : l
        );
      }
      return [...ls, { product: p, quantity: "1", discount: "0" }];
    });
    setSearch("");
    setResults([]);
  }

  function setLine(i: number, patch: Partial<Line>) {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  // Handle Photo Capture from Webcam
  const handlePhotoCaptured = (_blob: Blob, dataUrl: string) => {
    setCapturedImage(dataUrl);
    // Note: In Phase 10, this blob will be sent to the AI OCR & Object Detection endpoint
  };

  // Preview only. The server calculates the real total.
  const calc = useMemo(() => {
    let subtotal = 0;
    let discount = 0;
    let tax = 0;
    for (const l of lines) {
      const qty = Number(l.quantity) || 0;
      const rate = Number(l.product.selling_price) || 0;
      const discPct = Number(l.discount) || 0;
      const taxPct = Number(l.product.tax_percent) || 0;

      const base = rate * qty;
      const disc = r2((base * discPct) / 100);
      const taxable = base - disc;
      const t = r2((taxable * taxPct) / 100);

      subtotal += base;
      discount += disc;
      tax += t;
    }
    const total = r2(subtotal - discount + tax);
    return { subtotal, discount, tax, total };
  }, [lines]);

  const paid = useMemo(() => {
    return r2(pays.reduce((acc, p) => acc + (Number(p.amount) || 0), 0));
  }, [pays]);

  const due = Math.max(0, r2(calc.total - paid));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;

    if (lines.length === 0) {
      setError("At least 1 product add karo");
      return;
    }
    if (!customerId && due > 0) {
      setError("Walk-in customer ma udhar na chale. Poori payment nakho.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const payload = {
        customer_id: customerId || null,
        items: lines.map((l) => ({
          product_id: l.product.id,
          quantity: Number(l.quantity) || 1,
          discount_percent: Number(l.discount) || 0,
        })),
        payments: pays
          .filter((p) => Number(p.amount) > 0)
          .map((p) => ({ method: p.method, amount: Number(p.amount) })),
      };

      const inv = await authPost<Invoice>(
        "/api/v1/invoices",
        payload,
        { "Idempotency-Key": keyRef.current }
      );
      router.push(`/invoices/${inv.id}`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onAuthError();
        return;
      }
      setError(err instanceof Error ? err.message : "Bill banavva ma bhul thai");
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-emerald-50 p-6">
      <form onSubmit={submit} className="mx-auto max-w-5xl rounded-2xl bg-white p-6 shadow">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-100 pb-4">
          <div>
            <h1 className="text-2xl font-bold text-emerald-800">New Bill</h1>
            <p className="text-xs text-gray-500">ઝડપી બિલિંગ અને કમ્પ્યુટર સ્કેનર</p>
          </div>

          <div className="flex items-center gap-3">
            {/* Webcam Scanner Button */}
            <button
              type="button"
              onClick={() => setIsCameraOpen(true)}
              className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-emerald-700 transition"
            >
              📷 કેમેરા સ્કેનર (Webcam)
            </button>

            <Link href="/dashboard" className="text-sm font-medium text-gray-600 hover:underline">
              ← Dashboard
            </Link>
          </div>
        </div>

        {error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

        {/* Captured Webcam Image Preview Banner */}
        {capturedImage && (
          <div className="mt-4 flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50/50 p-3">
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={capturedImage}
                alt="Webcam captured"
                className="h-16 w-20 rounded-lg object-cover shadow-sm border border-emerald-300"
              />
              <div>
                <p className="text-sm font-bold text-emerald-900">✓ ફોટો સફળતાપૂર્વક કેપ્ચર થયો!</p>
                <p className="text-xs text-emerald-700">Phase 10 AI મોડ્યુલ માટે તૈયાર છે</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setCapturedImage(null)}
              className="rounded-lg px-3 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 transition"
            >
              હટાવો (Remove)
            </button>
          </div>
        )}

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="text-sm font-medium text-gray-700">Customer</label>
            <select
              className={input}
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
            >
              <option value="">Walk-in (udhar nahi)</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.mobile ? `(${c.mobile})` : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="relative">
            <label className="text-sm font-medium text-gray-700">Product shodho</label>
            <input
              type="text"
              placeholder="Name, SKU athva barcode..."
              className={input}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {results.length > 0 && (
              <div className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                {results.map((p) => (
                  <button
                    type="button"
                    key={p.id}
                    onClick={() => addProduct(p)}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-emerald-50"
                  >
                    <span className="font-medium text-gray-800">{p.name}</span>
                    <span className="text-xs text-gray-500">
                      ₹{p.selling_price} | {p.unit}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Product Table */}
        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs font-semibold uppercase text-gray-500">
                <th className="py-2">Item</th>
                <th className="py-2">Qty</th>
                <th className="py-2">Rate</th>
                <th className="py-2">Disc %</th>
                <th className="py-2">Tax %</th>
                <th className="py-2 text-right">Amount</th>
                <th className="py-2"></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => {
                const qty = Number(l.quantity) || 0;
                const rate = Number(l.product.selling_price) || 0;
                const discPct = Number(l.discount) || 0;
                const taxPct = Number(l.product.tax_percent) || 0;
                const base = rate * qty;
                const disc = (base * discPct) / 100;
                const taxable = base - disc;
                const tax = (taxable * taxPct) / 100;
                const amount = taxable + tax;

                return (
                  <tr key={l.product.id} className="border-b border-gray-100">
                    <td className="py-2 font-medium text-gray-900">{l.product.name}</td>
                    <td className="py-2">
                      <input
                        type="number"
                        min="0.001"
                        step="any"
                        className="w-20 rounded border border-gray-300 px-2 py-1 text-sm"
                        value={l.quantity}
                        onChange={(e) => setLine(i, { quantity: e.target.value })}
                      />
                    </td>
                    <td className="py-2 text-gray-600">₹{rate.toFixed(2)}</td>
                    <td className="py-2">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="any"
                        className="w-16 rounded border border-gray-300 px-2 py-1 text-sm"
                        value={l.discount}
                        onChange={(e) => setLine(i, { discount: e.target.value })}
                      />
                    </td>
                    <td className="py-2 text-gray-600">{taxPct}%</td>
                    <td className="py-2 text-right font-semibold text-gray-900">
                      ₹{amount.toFixed(2)}
                    </td>
                    <td className="py-2 text-right">
                      <button
                        type="button"
                        onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))}
                        className="text-red-500 hover:text-red-700"
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

        {/* Payments & Totals */}
        <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div>
            <p className="text-sm font-medium text-gray-700">Payment</p>
            {pays.map((p, i) => (
              <div key={i} className="mt-2 flex gap-2">
                <select
                  className={input + " w-36"}
                  value={p.method}
                  onChange={(e) =>
                    setPays((ps) =>
                      ps.map((x, idx) => (idx === i ? { ...x, method: e.target.value } : x))
                    )
                  }
                >
                  <option value="cash">Cash</option>
                  <option value="upi">UPI</option>
                  <option value="card">Card</option>
                  <option value="bank_transfer">Bank transfer</option>
                </select>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Amount ₹"
                  className={input}
                  value={p.amount}
                  onChange={(e) =>
                    setPays((ps) =>
                      ps.map((x, idx) => (idx === i ? { ...x, amount: e.target.value } : x))
                    )
                  }
                />
              </div>
            ))}
            <div className="mt-2 flex gap-4 text-sm">
              {pays.length < 4 && (
                <button
                  type="button"
                  onClick={() => setPays((ps) => [...ps, { method: "upi", amount: "" }])}
                  className="font-medium text-emerald-700 hover:underline"
                >
                  + Bijo payment
                </button>
              )}
              <button
                type="button"
                onClick={() =>
                  setPays([{ method: pays[0]?.method ?? "cash", amount: String(calc.total) }])
                }
                className="font-medium text-emerald-700 hover:underline"
              >
                Poori payment
              </button>
            </div>
          </div>

          <div className="space-y-1 text-right text-sm text-gray-700">
            <p>Subtotal: ₹{calc.subtotal.toFixed(2)}</p>
            <p>Discount: -₹{calc.discount.toFixed(2)}</p>
            <p>Tax: ₹{calc.tax.toFixed(2)}</p>
            <p className="text-2xl font-bold text-emerald-800">Total: ₹{calc.total.toFixed(2)}</p>
            <p>Paid: ₹{paid.toFixed(2)}</p>
            <p className={due > 0 ? "font-medium text-amber-700" : "text-gray-500"}>
              Udhar: ₹{due.toFixed(2)}
            </p>
            <p className="text-xs text-gray-400">(Final total server calculate karse)</p>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-emerald-700 px-8 py-3 font-medium text-white hover:bg-emerald-800 disabled:opacity-60"
          >
            {saving ? "Saving..." : "Confirm Bill"}
          </button>
        </div>
      </form>

      {/* Webcam Modal */}
      <WebcamCaptureModal
        isOpen={isCameraOpen}
        onClose={() => setIsCameraOpen(false)}
        onCapture={handlePhotoCaptured}
      />
    </main>
  );
}