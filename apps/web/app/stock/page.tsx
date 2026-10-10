"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ApiError, authGet, authPost, clearTokens } from "@/lib/api";

type Row = {
  product_id: string;
  name: string;
  sku: string | null;
  unit: string;
  min_stock: string;
  purchase_price: string;
  current_stock: string;
  stock_value: string;
  status: "in" | "low" | "out";
};

type Report = {
  summary: {
    total_products: number;
    low_stock: number;
    out_of_stock: number;
    stock_value: string;
  };
  items: Row[];
  total: number;
  page: number;
  page_size: number;
};

const PAGE_SIZE = 20;

const BADGE: Record<Row["status"], string> = {
  in: "bg-emerald-100 text-emerald-800",
  low: "bg-amber-100 text-amber-800",
  out: "bg-red-100 text-red-800",
};
const BADGE_TEXT: Record<Row["status"], string> = {
  in: "In stock",
  low: "Low",
  out: "Out",
};

const MOVEMENT_TYPES = [
  ["opening", "Opening stock"],
  ["adjustment", "Adjustment (+ ke -)"],
  ["damage", "Damage"],
  ["expired", "Expired"],
];

const input =
  "mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500";

function Card({ title, value, tone }: { title: string; value: string | number; tone?: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p className="text-sm text-gray-500">{title}</p>
      <p className={`mt-1 text-2xl font-bold ${tone ?? "text-gray-900"}`}>{value}</p>
    </div>
  );
}

export default function StockPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"" | "low" | "out">("");
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [data, setData] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // adjust popup
  const [target, setTarget] = useState<Row | null>(null);
  const [type, setType] = useState("opening");
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const [batch, setBatch] = useState("");
  const [expiry, setExpiry] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const onAuthError = useCallback(() => {
    clearTokens();
    router.replace("/login");
  }, [router]);

  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const params = new URLSearchParams({
          page: String(page),
          page_size: String(PAGE_SIZE),
        });
        if (query) params.set("q", query);
        if (filter) params.set("status", filter);
        const res = await authGet<Report>(`/api/v1/inventory/stock?${params}`);
        if (cancelled) return;
        setData(res);
        setError("");
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) return onAuthError();
        if (err instanceof ApiError && err.status === 403) {
          router.replace("/setup");
          return;
        }
        setError(err instanceof Error ? err.message : "Could not load stock");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [query, filter, page, reload, onAuthError, router]);

  function openAdjust(row: Row) {
    setTarget(row);
    setType("opening");
    setQty("");
    setNote("");
    setBatch("");
    setExpiry("");
    setFormError("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!target) return;
    setFormError("");
    setSaving(true);
    try {
      await authPost("/api/v1/inventory/movements", {
        product_id: target.product_id,
        movement_type: type,
        quantity: qty,
        note: note || null,
        batch_no: batch || null,
        expiry_date: expiry || null,
      });
      setTarget(null);
      setReload((n) => n + 1);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return onAuthError();
      setFormError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const tab = (active: boolean) =>
    `rounded-lg px-3 py-1.5 text-sm font-medium ${
      active ? "bg-emerald-700 text-white" : "border border-gray-300 text-gray-700"
    }`;

  return (
    <main className="min-h-screen bg-emerald-50 p-6">
      <div className="mx-auto max-w-5xl">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-emerald-800">Stock</h1>
          <div className="flex items-center gap-4">
            <Link
              href="/stock/expiry"
              className="text-sm font-medium text-emerald-700 hover:underline"
            >
              Expiry
            </Link>
            <Link href="/dashboard" className="text-sm text-gray-600 hover:underline">
              ← Dashboard
            </Link>
          </div>
        </div>

        {data && (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Card title="Total products" value={data.summary.total_products} />
            <Card title="Low stock" value={data.summary.low_stock} tone="text-amber-700" />
            <Card title="Out of stock" value={data.summary.out_of_stock} tone="text-red-700" />
            <Card title="Stock value" value={`₹${data.summary.stock_value}`} tone="text-emerald-800" />
          </div>
        )}

        <div className="mt-4 rounded-2xl bg-white p-6 shadow">
          <div className="flex flex-wrap items-center gap-2">
            <button className={tab(filter === "")} onClick={() => { setFilter(""); setPage(1); }}>
              All
            </button>
            <button className={tab(filter === "low")} onClick={() => { setFilter("low"); setPage(1); }}>
              Low
            </button>
            <button className={tab(filter === "out")} onClick={() => { setFilter("out"); setPage(1); }}>
              Out
            </button>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Naam ke SKU thi shodho..."
              className="ml-auto w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 sm:w-64"
            />
          </div>

          {error && (
            <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>
          )}

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-emerald-700 text-left text-white">
                  <th className="p-2">Name</th>
                  <th className="p-2">SKU</th>
                  <th className="p-2 text-right">Stock</th>
                  <th className="p-2 text-right">Min</th>
                  <th className="p-2 text-right">Value</th>
                  <th className="p-2">Status</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={7} className="p-4 text-center text-gray-500">Loading...</td>
                  </tr>
                )}
                {!loading && data?.items.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-4 text-center text-gray-500">
                      Koi product nathi.
                    </td>
                  </tr>
                )}
                {data?.items.map((r) => (
                  <tr key={r.product_id} className="border-b border-gray-200 text-gray-800">
                    <td className="p-2 font-medium">{r.name}</td>
                    <td className="p-2">{r.sku ?? "-"}</td>
                    <td className="p-2 text-right">{r.current_stock} {r.unit}</td>
                    <td className="p-2 text-right">{r.min_stock}</td>
                    <td className="p-2 text-right">₹{r.stock_value}</td>
                    <td className="p-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${BADGE[r.status]}`}>
                        {BADGE_TEXT[r.status]}
                      </span>
                    </td>
                    <td className="p-2 text-right">
                      <button
                        onClick={() => openAdjust(r)}
                        className="rounded-lg border border-emerald-700 px-3 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
                      >
                        Adjust
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex items-center justify-between text-sm text-gray-600">
            <span>Total: {data?.total ?? 0}</span>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="rounded-lg border border-gray-300 px-3 py-1.5 disabled:opacity-40"
              >
                Previous
              </button>
              <span>Page {page} / {totalPages}</span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="rounded-lg border border-gray-300 px-3 py-1.5 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </div>

      {target && (
        <div className="fixed inset-0 z-10 flex items-center justify-center overflow-y-auto bg-black/40 p-4">
          <form onSubmit={submit} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-bold text-emerald-800">Stock adjust: {target.name}</h2>
            <p className="text-sm text-gray-500">
              Current: {target.current_stock} {target.unit}
            </p>

            {formError && (
              <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{formError}</p>
            )}

            <label className="mt-4 block text-sm font-medium text-gray-700">Type</label>
            <select className={input} value={type} onChange={(e) => setType(e.target.value)}>
              {MOVEMENT_TYPES.map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>

            <label className="mt-4 block text-sm font-medium text-gray-700">
              Quantity {type === "adjustment" ? "(ghatadva mate - lakho, jem ke -5)" : ""}
            </label>
            <input
              required
              type="number"
              step="0.001"
              className={input}
              value={qty}
              onChange={(e) => setQty(e.target.value)}
            />

            <label className="mt-4 block text-sm font-medium text-gray-700">
              Note {type === "adjustment" ? "(jaruri)" : "(optional)"}
            </label>
            <input
              required={type === "adjustment"}
              className={input}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mt-4 block text-sm font-medium text-gray-700">
                  Batch (optional)
                </label>
                <input
                  className={input}
                  value={batch}
                  onChange={(e) => setBatch(e.target.value)}
                />
              </div>
              <div>
                <label className="mt-4 block text-sm font-medium text-gray-700">
                  Expiry (optional)
                </label>
                <input
                  type="date"
                  className={input}
                  value={expiry}
                  onChange={(e) => setExpiry(e.target.value)}
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setTarget(null)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-emerald-700 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-60"
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}