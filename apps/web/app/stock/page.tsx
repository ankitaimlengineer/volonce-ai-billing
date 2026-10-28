"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ApiError, authGet, authPost, clearTokens } from "@/lib/api";
import LanguageSwitcher from "@/app/components/LanguageSwitcher";
import ShopSwitcher from "@/app/components/ShopSwitcher";
import { useLanguage } from "@/lib/i18n/LanguageContext";

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
  in: "bg-emerald-100 text-emerald-800 border border-emerald-300",
  low: "bg-amber-100 text-amber-800 border border-amber-300",
  out: "bg-red-100 text-red-800 border border-red-300",
};

const BADGE_TEXT: Record<Row["status"], string> = {
  in: "✓ હાજર સ્ટોક (In)",
  low: "⚠️ ઓછો સ્ટોક (Low)",
  out: "✕ ખલાસ (Out)",
};

const MOVEMENT_TYPES = [
  ["opening", "ઓપનિંગ સ્ટોક (Opening stock)"],
  ["adjustment", "એડજસ્ટમેન્ટ (Adjustment + ke -)"],
  ["damage", "નુકસાન / ડેમેજ (Damage)"],
  ["expired", "એક્સપાયર થયેલ (Expired)"],
];

const input =
  "mt-1 w-full rounded-xl border border-gray-300 px-3.5 py-2 text-xs md:text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium";

function Card({
  title,
  value,
  tone,
  sub,
}: {
  title: string;
  value: string | number;
  tone?: string;
  sub?: string;
}) {
  return (
    <div className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm border-l-4 border-l-emerald-600">
      <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">{title}</p>
      <p className={`mt-1 text-2xl font-black font-mono ${tone ?? "text-gray-900"}`}>{value}</p>
      {sub && <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

export default function StockPage() {
  const router = useRouter();
  const { t } = useLanguage();

  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"" | "low" | "out">("");
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [data, setData] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Adjust modal states
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
    const timer = setTimeout(() => {
      setQuery(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
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
        setError(err instanceof Error ? err.message : "સ્ટોક ડેટા લોડ થઈ શક્યો નથી.");
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

  async function submitAdjust(e: React.FormEvent) {
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
      setFormError(err instanceof Error ? err.message : "સ્ટોક એડજસ્ટ થઈ શક્યો નથી.");
    } finally {
      setSaving(false);
    }
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const tabBtn = (active: boolean) =>
    `rounded-xl px-4 py-2 text-xs font-bold transition ${
      active
        ? "bg-emerald-800 text-white shadow-sm"
        : "border border-gray-300 bg-white text-gray-700 hover:bg-emerald-50"
    }`;

  return (
    <main className="min-h-screen bg-emerald-50/50 p-4 md:p-6">
      <div className="mx-auto max-w-5xl">
        {/* Header with Multi-Shop, Language Switcher, and Stock Transfer Actions */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-200/80 pb-4 mb-5">
          <div>
            <h1 className="text-2xl font-black text-emerald-950">📦 {t("stock_title")}</h1>
            <p className="text-xs text-gray-500 mt-0.5">દુકાન અને ગોડાઉનનો લાઈવ સ્ટોક હિસાબ</p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* 🏪 ગોડાઉન / શાખા સ્વિચર */}
            <ShopSwitcher />

            {/* 🌐 ૧-ક્લિક ભાષા સ્વિચર */}
            <LanguageSwitcher />

            {/* 🔄 મુખ્ય નવું ફીચર: સ્ટોક ટ્રાન્સફર બટન */}
            <Link
              href="/stock/transfers"
              className="flex items-center gap-1.5 rounded-xl bg-emerald-700 px-3.5 py-2 text-xs font-bold text-white shadow hover:bg-emerald-800 transition"
            >
              🔄 સ્ટોક ટ્રાન્સફર (Transfers)
            </Link>

            {/* ⏳ એક્સપાયરી રિપોર્ટ લિંક */}
            <Link
              href="/stock/expiry"
              className="rounded-xl border border-emerald-700 bg-white px-3.5 py-2 text-xs font-bold text-emerald-800 shadow-sm hover:bg-emerald-50 transition"
            >
              ⏳ {t("expiry_link")}
            </Link>

            <Link
              href="/dashboard"
              className="rounded-xl border border-gray-300 bg-white px-3.5 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50 transition"
            >
              {t("back_to_dashboard")}
            </Link>
          </div>
        </div>

        {/* Overview Metric Cards */}
        {data && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-5">
            <Card title="કુલ પ્રોડક્ટ્સ" value={data.summary.total_products} />
            <Card
              title="ઓછો સ્ટોક (Low)"
              value={data.summary.low_stock}
              tone="text-amber-700"
              sub="રી-ઓર્ડર જરૂર"
            />
            <Card
              title="ખલાસ સ્ટોક (Out)"
              value={data.summary.out_of_stock}
              tone="text-red-700"
              sub="તાત્કાલિક મંગાવો"
            />
            <Card
              title="કુલ સ્ટોક કિંમત"
              value={`₹${Number(data.summary.stock_value).toLocaleString("en-IN")}`}
              tone="text-emerald-800"
              sub="પડતર મૂલ્ય (Cost)"
            />
          </div>
        )}

        {/* Main Content Box */}
        <div className="rounded-2xl bg-white p-6 shadow-md border border-emerald-100">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 pb-4">
            <div className="flex flex-wrap items-center gap-2">
              <button
                className={tabBtn(filter === "")}
                onClick={() => {
                  setFilter("");
                  setPage(1);
                }}
              >
                બધા (All)
              </button>
              <button
                className={tabBtn(filter === "low")}
                onClick={() => {
                  setFilter("low");
                  setPage(1);
                }}
              >
                {t("low_stock_filter")}
              </button>
              <button
                className={tabBtn(filter === "out")}
                onClick={() => {
                  setFilter("out");
                  setPage(1);
                }}
              >
                {t("out_of_stock_filter")}
              </button>
            </div>

            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="પ્રોડક્ટનું નામ અથવા SKU થી શોધો..."
              className="w-full sm:w-72 rounded-xl border border-gray-300 px-3.5 py-1.5 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {error && (
            <p className="mt-4 rounded-xl bg-red-50 p-3 text-xs font-bold text-red-700 border border-red-200">
              ⚠️ {error}
            </p>
          )}

          {/* Stock Table */}
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-emerald-800 text-white font-extrabold uppercase tracking-wider">
                  <th className="p-3 rounded-l-lg">{t("item_col")}</th>
                  <th className="p-3">{t("sku_col")}</th>
                  <th className="p-3 text-right">હાજર સ્ટોક (Current)</th>
                  <th className="p-3 text-right">{t("min_stock_col")}</th>
                  <th className="p-3 text-right">સ્ટોક વેલ્યુ (₹)</th>
                  <th className="p-3 text-center">{t("status")}</th>
                  <th className="p-3 text-right rounded-r-lg">{t("action")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-emerald-100 font-medium">
                {loading && (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-gray-500 font-semibold">
                      {t("loading")}
                    </td>
                  </tr>
                )}
                {!loading && data?.items.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-gray-400 font-semibold">
                      કોઈ સ્ટોક રેકોર્ડ મળ્યો નથી.
                    </td>
                  </tr>
                )}
                {data?.items.map((r) => (
                  <tr key={r.product_id} className="hover:bg-emerald-50/40 transition">
                    <td className="p-3 font-bold text-emerald-950">
                      <Link href={`/products/${r.product_id}`} className="hover:underline">
                        {r.name}
                      </Link>
                    </td>
                    <td className="p-3 text-gray-600 font-mono">{r.sku ?? "-"}</td>
                    <td className="p-3 text-right font-mono font-bold text-slate-900">
                      {r.current_stock} <span className="text-[10px] text-gray-500">{r.unit}</span>
                    </td>
                    <td className="p-3 text-right font-mono text-gray-600">{r.min_stock}</td>
                    <td className="p-3 text-right font-mono font-bold text-emerald-800">
                      ₹{Number(r.stock_value).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="p-3 text-center">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase ${BADGE[r.status]}`}
                      >
                        {BADGE_TEXT[r.status]}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      <button
                        onClick={() => openAdjust(r)}
                        className="rounded-xl border border-emerald-700 bg-white px-3 py-1 text-xs font-bold text-emerald-800 shadow-sm hover:bg-emerald-50 transition"
                      >
                        {t("adjust_stock")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="mt-4 flex items-center justify-between text-xs font-semibold text-gray-600 border-t border-gray-100 pt-3">
            <span>કુલ પ્રોડક્ટ્સ: {data?.total ?? 0}</span>
            <div className="flex items-center gap-2.5">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="rounded-lg border border-gray-300 px-3 py-1.5 disabled:opacity-40 hover:bg-gray-50 transition"
              >
                Previous
              </button>
              <span>
                Page {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="rounded-lg border border-gray-300 px-3 py-1.5 disabled:opacity-40 hover:bg-gray-50 transition"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Manual Stock Adjust Popup Modal */}
      {target && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm">
          <form
            onSubmit={submitAdjust}
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border-2 border-emerald-700"
          >
            <h2 className="text-xl font-black text-emerald-950">
              ⚙️ {t("adjust_stock")}: {target.name}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              વર્તમાન સ્ટોક:{" "}
              <span className="font-bold text-emerald-800">
                {target.current_stock} {target.unit}
              </span>
            </p>

            {formError && (
              <p className="mt-3 rounded-lg bg-red-50 p-2.5 text-xs font-bold text-red-700 border border-red-200">
                ⚠️ {formError}
              </p>
            )}

            <label className="mt-4 block text-xs font-bold text-gray-700 uppercase tracking-wider">
              પ્રકાર (Movement Type) *
            </label>
            <select className={input} value={type} onChange={(e) => setType(e.target.value)}>
              {MOVEMENT_TYPES.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>

            <label className="mt-3 block text-xs font-bold text-gray-700 uppercase tracking-wider">
              જથ્થો (Quantity) *{" "}
              {type === "adjustment" ? "(ઘટાડવા માટે - લખો, જેમ કે -5)" : ""}
            </label>
            <input
              required
              type="number"
              step="0.001"
              className={input + " font-mono font-bold text-base text-emerald-900"}
              value={qty}
              onChange={(e) => setQty(e.target.value)}
            />

            <label className="mt-3 block text-xs font-bold text-gray-700 uppercase tracking-wider">
              નોંધ / કારણ (Note) {type === "adjustment" ? "*(જરૂરી)" : "(વૈકલ્પિક)"}
            </label>
            <input
              required={type === "adjustment"}
              placeholder="દા.ત. શારીરિક ગણતરીમાં ઓછો નીકળ્યો"
              className={input}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />

            <div className="grid grid-cols-2 gap-3 mt-3">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
                  બેચ નં. (Batch No)
                </label>
                <input
                  className={input + " font-mono"}
                  placeholder="B-2026-X"
                  value={batch}
                  onChange={(e) => setBatch(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
                  એક્સપાયરી (Expiry)
                </label>
                <input
                  type="date"
                  className={input + " font-mono"}
                  value={expiry}
                  onChange={(e) => setExpiry(e.target.value)}
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3 pt-3 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setTarget(null)}
                className="rounded-xl border border-gray-300 px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-50 transition"
              >
                {t("cancel")}
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-emerald-700 px-5 py-2 text-xs font-black text-white hover:bg-emerald-800 disabled:opacity-60 shadow-md transition"
              >
                {saving ? t("saving") : t("save")}
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}