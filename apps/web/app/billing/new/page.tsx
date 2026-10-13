"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError, authGet, authPost, clearTokens } from "@/lib/api";

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
    async function load() {
      try {
        const c = await authGet<{ items: Customer[] }>("/api/v1/customers?page_size=100");
        if (!cancelled) setCustomers(c.items);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) return onAuthError();
        if (err instanceof ApiError && err.status === 403) return router.replace("/setup");
        setError(err instanceof Error ? err.message : "Could not load customers");
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [onAuthError, router]);

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

  // Preview only. The server calculates the real total.
  const calc = useMemo(() => {
    // 1) per-line numbers (no outside variables are changed)
    const rows = lines.map((l) => {
      const base = r2((Number(l.quantity) || 0) * Number(l.product.selling_price));
      const discount = r2((base * (Number(l.discount) || 0)) / 100);
      const tax = r2(((base - discount) * Number(l.product.tax_percent)) / 100);
      return { base, discount, tax, total: base - discount + tax };
    });
    // 2) totals from the rows
    const subtotal = rows.reduce((s, r) => s + r.base, 0);
    const discount = rows.reduce((s, r) => s + r.discount, 0);
    const tax = rows.reduce((s, r) => s + r.tax, 0);
    return { rows, subtotal, discount, tax, total: r2(subtotal - discount + tax) };
  }, [lines]);

  const paid = pays.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const due = r2(calc.total - paid);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setError("");
    if (lines.length === 0) return setError("Pehla product umero");
    setSaving(true);
    try {
      const inv = await authPost<Invoice>(
        "/api/v1/invoices",
        {
          customer_id: customerId || null,
          items: lines.map((l) => ({
            product_id: l.product.id,
            quantity: l.quantity,
            discount_percent: l.discount || "0",
          })),
          payments: pays
            .filter((p) => Number(p.amount) > 0)
            .map((p) => ({ method: p.method, amount: p.amount })),
        },
        { "Idempotency-Key": keyRef.current }
      );
      router.push(`/invoices/${inv.id}`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return onAuthError();
      setError(err instanceof Error ? err.message : "Bill save thayu nathi");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-emerald-50 p-6">
      <form onSubmit={submit} className="mx-auto max-w-5xl rounded-2xl bg-white p-6 shadow">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-emerald-800">New Bill</h1>
          <Link href="/dashboard" className="text-sm text-gray-600 hover:underline">
            ← Dashboard
          </Link>
        </div>

        {error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

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
              className={input}
              placeholder="Naam, SKU ke barcode..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {results.length > 0 && (
              <ul className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                {results.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => addProduct(p)}
                      className="flex w-full justify-between px-3 py-2 text-left text-sm text-gray-800 hover:bg-emerald-50"
                    >
                      <span>{p.name}</span>
                      <span className="text-gray-500">₹{p.selling_price}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-emerald-700 text-left text-white">
                <th className="p-2">Product</th>
                <th className="p-2">Qty</th>
                <th className="p-2 text-right">Rate</th>
                <th className="p-2">Disc %</th>
                <th className="p-2 text-right">Tax %</th>
                <th className="p-2 text-right">Total</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-4 text-center text-gray-500">
                    Upar thi product shodhi ne umero.
                  </td>
                </tr>
              )}
              {lines.map((l, i) => (
                <tr
                  key={l.product.id}
                  className="border-b border-gray-200 align-middle text-gray-800"
                >
                  <td className="p-1 font-medium">{l.product.name}</td>
                  <td className="p-1">
                    <input
                      required
                      type="number"
                      step="0.001"
                      min="0.001"
                      className={input + " w-24"}
                      value={l.quantity}
                      onChange={(e) => setLine(i, { quantity: e.target.value })}
                    />
                  </td>
                  <td className="p-1 text-right">₹{l.product.selling_price}</td>
                  <td className="p-1">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      className={input + " w-20"}
                      value={l.discount}
                      onChange={(e) => setLine(i, { discount: e.target.value })}
                    />
                  </td>
                  <td className="p-1 text-right">{l.product.tax_percent}</td>
                  <td className="p-1 text-right font-medium">
                    ₹{r2(calc.rows[i].total).toFixed(2)}
                  </td>
                  <td className="p-1">
                    <button
                      type="button"
                      onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))}
                      className="px-2 py-1 text-red-600"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

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
    </main>
  );
}