"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, authGet, authPost, clearTokens } from "@/lib/api";

type Supplier = { id: string; name: string };
type Product = { id: string; name: string; purchase_price: string; tax_percent: string };
type Line = {
  product_id: string;
  quantity: string;
  rate: string;
  tax_percent: string;
  batch_no: string;
  expiry_date: string;
};

const input =
  "mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500";
const emptyLine: Line = {
  product_id: "",
  quantity: "1",
  rate: "0",
  tax_percent: "0",
  batch_no: "",
  expiry_date: "",
};

export default function NewPurchasePage() {
  const router = useRouter();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [lines, setLines] = useState<Line[]>([{ ...emptyLine }]);
  const [paid, setPaid] = useState("0");
  const [method, setMethod] = useState("cash");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // One key for this form: a double click sends the same key (no duplicate purchase)
  const keyRef = useRef("");
  // Date input is uncontrolled; today's date is set once in the browser
  const dateRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    keyRef.current = crypto.randomUUID();
  }, []);

  const onAuthError = useCallback(() => {
    clearTokens();
    router.replace("/login");
  }, [router]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [s, p] = await Promise.all([
          authGet<{ items: Supplier[] }>("/api/v1/suppliers?page_size=100"),
          authGet<{ items: Product[] }>("/api/v1/products?page_size=100"),
        ]);
        if (cancelled) return;
        setSuppliers(s.items);
        setProducts(p.items);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) return onAuthError();
        if (err instanceof ApiError && err.status === 403) return router.replace("/setup");
        setError(err instanceof Error ? err.message : "Could not load data");
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [onAuthError, router]);

  function setLine(i: number, patch: Partial<Line>) {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  function pickProduct(i: number, id: string) {
    const p = products.find((x) => x.id === id);
    setLine(i, {
      product_id: id,
      rate: p ? p.purchase_price : "0",
      tax_percent: p ? p.tax_percent : "0",
    });
  }

  // Preview only. The server calculates the real total.
  const total = lines.reduce((sum, l) => {
    const base = (Number(l.quantity) || 0) * (Number(l.rate) || 0);
    return sum + base + (base * (Number(l.tax_percent) || 0)) / 100;
  }, 0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return; // ignore a second click while saving
    setError("");
    if (!supplierId) return setError("Supplier select karo");
    if (lines.some((l) => !l.product_id)) return setError("Darek line ma product select karo");
    setSaving(true);
    try {
      await authPost(
        "/api/v1/purchases",
        {
          supplier_id: supplierId,
          invoice_number: invoiceNo,
          purchase_date: dateRef.current?.value ?? "",
          items: lines.map((l) => ({
            product_id: l.product_id,
            quantity: l.quantity,
            rate: l.rate,
            tax_percent: l.tax_percent || "0",
            batch_no: l.batch_no || null,
            expiry_date: l.expiry_date || null,
          })),
          paid_amount: paid || "0",
          payment_method: Number(paid) > 0 ? method : null,
        },
        { "Idempotency-Key": keyRef.current }
      );
      router.push("/purchases");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return onAuthError();
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-emerald-50 p-6">
      <form onSubmit={submit} className="mx-auto max-w-5xl rounded-2xl bg-white p-6 shadow">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-emerald-800">New Purchase</h1>
          <Link href="/purchases" className="text-sm text-gray-600 hover:underline">
            ← Purchases
          </Link>
        </div>

        {error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className="text-sm font-medium text-gray-700">Supplier *</label>
            <select
              className={input}
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
            >
              <option value="">Select</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Invoice No *</label>
            <input
              required
              className={input}
              value={invoiceNo}
              onChange={(e) => setInvoiceNo(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Date *</label>
            <input
              required
              type="date"
              className={input}
              ref={(el) => {
                dateRef.current = el;
                // set today's date once, in the browser (local time)
                if (el && !el.value) {
                  const d = new Date();
                  el.value = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
                    .toISOString()
                    .slice(0, 10);
                }
              }}
            />
          </div>
        </div>

        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-emerald-700 text-left text-white">
                <th className="p-2">Product</th>
                <th className="p-2">Qty</th>
                <th className="p-2">Rate ₹</th>
                <th className="p-2">Tax %</th>
                <th className="p-2">Batch</th>
                <th className="p-2">Expiry</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i} className="border-b border-gray-200 align-top">
                  <td className="p-1">
                    <select
                      className={input}
                      value={l.product_id}
                      onChange={(e) => pickProduct(i, e.target.value)}
                    >
                      <option value="">Select</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="p-1">
                    <input
                      required
                      type="number"
                      step="0.001"
                      min="0.001"
                      className={input}
                      value={l.quantity}
                      onChange={(e) => setLine(i, { quantity: e.target.value })}
                    />
                  </td>
                  <td className="p-1">
                    <input
                      required
                      type="number"
                      step="0.01"
                      min="0"
                      className={input}
                      value={l.rate}
                      onChange={(e) => setLine(i, { rate: e.target.value })}
                    />
                  </td>
                  <td className="p-1">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      className={input}
                      value={l.tax_percent}
                      onChange={(e) => setLine(i, { tax_percent: e.target.value })}
                    />
                  </td>
                  <td className="p-1">
                    <input
                      className={input}
                      value={l.batch_no}
                      onChange={(e) => setLine(i, { batch_no: e.target.value })}
                    />
                  </td>
                  <td className="p-1">
                    <input
                      type="date"
                      className={input}
                      value={l.expiry_date}
                      onChange={(e) => setLine(i, { expiry_date: e.target.value })}
                    />
                  </td>
                  <td className="p-1">
                    {lines.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))}
                        className="px-2 py-1 text-red-600"
                      >
                        ✕
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button
            type="button"
            onClick={() => setLines((ls) => [...ls, { ...emptyLine }])}
            className="mt-2 text-sm font-medium text-emerald-700 hover:underline"
          >
            + Add line
          </button>
        </div>

        <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
          <div className="flex gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700">Paid ₹</label>
              <input
                type="number"
                step="0.01"
                min="0"
                className={input + " w-32"}
                value={paid}
                onChange={(e) => setPaid(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Method</label>
              <select
                className={input}
                value={method}
                onChange={(e) => setMethod(e.target.value)}
              >
                <option value="cash">Cash</option>
                <option value="upi">UPI</option>
                <option value="card">Card</option>
                <option value="bank_transfer">Bank transfer</option>
              </select>
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-500">Total (andaaz)</p>
            <p className="text-2xl font-bold text-emerald-800">₹{total.toFixed(2)}</p>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-emerald-700 px-6 py-2.5 font-medium text-white hover:bg-emerald-800 disabled:opacity-60"
          >
            {saving ? "Saving..." : "Confirm Purchase"}
          </button>
        </div>
      </form>
    </main>
  );
}