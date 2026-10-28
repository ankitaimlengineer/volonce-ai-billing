"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ApiError, authDownload, authGet, clearTokens } from "@/lib/api";
import RoleGuard from "@/app/components/RoleGuard";
import LanguageSwitcher from "@/app/components/LanguageSwitcher";
import { useLanguage } from "@/lib/i18n/LanguageContext";

type Sales = {
  total_sales: string;
  sales_return: string;
  net_sales: string;
  daily: { date: string; bills: number; sales: string; discount: string; tax: string; collected: string }[];
  products: { name: string; quantity: string; amount: string }[];
  customers: { name: string; bills: number; amount: string }[];
  payments: { method: string; amount: string }[];
};

type PL = {
  sales: string;
  cogs: string;
  gross_profit: string;
  margin_percent: string;
  expense_categories: { category: string; amount: string }[];
  expenses: string;
  net_profit: string;
};

const iso = (d: Date) =>
  new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

export default function ReportsPage() {
  const router = useRouter();
  const { t } = useLanguage();

  const [tab, setTab] = useState<"sales" | "pl">("sales");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [period, setPeriod] = useState<{ from: string; to: string } | null>(null);
  const [sales, setSales] = useState<Sales | null>(null);
  const [pl, setPl] = useState<PL | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const onAuthError = useCallback(() => {
    clearTokens();
    router.replace("/login");
  }, [router]);

  const query = period ? `date_from=${period.from}&date_to=${period.to}` : "";

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const path = tab === "sales" ? "sales" : "profit-loss";
        const res = await authGet<Sales | PL>(`/api/v1/reports/${path}?${query}`);
        if (cancelled) return;
        if (tab === "sales") setSales(res as Sales);
        else setPl(res as PL);
        setError("");
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) return onAuthError();
        setError(err instanceof Error ? err.message : "રિપોર્ટ લોડ થઈ શક્યો નથી.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [tab, query, onAuthError]);

  function quick(kind: "today" | "month" | "year") {
    const now = new Date();
    if (kind === "today") setPeriod(null);
    else if (kind === "month")
      setPeriod({ from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: iso(now) });
    else setPeriod({ from: iso(new Date(now.getFullYear(), 0, 1)), to: iso(now) });
  }

  function showCustom() {
    if (!from || !to) {
      setError("From અને To બંને તારીખ પસંદ કરો.");
      return;
    }
    if (to < from) {
      setError("To તારીખ From તારીખ પહેલાં ન હોઈ શકે.");
      return;
    }
    setError("");
    setPeriod({ from, to });
  }

  async function exportCsv() {
    try {
      const path = tab === "sales" ? "sales" : "profit-loss";
      await authDownload(
        `/api/v1/reports/${path}?format=csv${query ? "&" + query : ""}`,
        `${path}.csv`
      );
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return onAuthError();
      setError(err instanceof Error ? err.message : "Export નિષ્ફળ ગયું.");
    }
  }

  const tabBtn = (a: boolean) =>
    `rounded-xl px-4 py-2 text-xs md:text-sm font-black transition ${
      a ? "bg-emerald-800 text-white shadow-md" : "border border-gray-300 bg-white text-gray-700 hover:bg-emerald-50"
    }`;

  const th = "p-3 text-left font-extrabold uppercase tracking-wider text-xs";

  return (
    // 🛡️ ફક્ત Owner અને Manager જ નાણાકીય રિપોર્ટ્સ જોઈ શકે
    <RoleGuard allowedRoles={["owner", "manager"]}>
      <main className="min-h-screen bg-emerald-50/50 p-4 md:p-6">
        <div className="mx-auto max-w-5xl rounded-2xl bg-white p-6 shadow-md border border-emerald-100">
          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-100 pb-5">
            <div>
              <h1 className="text-2xl font-black text-emerald-950">📊 {t("reports_title")}</h1>
              <p className="text-xs text-slate-500 mt-0.5">વેચાણ, નફો-નુકસાન અને નાણાકીય હિસાબ</p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <LanguageSwitcher />

              <Link
                href="/reports/cashflow"
                className="rounded-xl border border-emerald-700 bg-white px-3.5 py-2 text-xs font-bold text-emerald-800 shadow-sm hover:bg-emerald-50 transition"
              >
                💵 {t("cashflow_tab")}
              </Link>

              <Link
                href="/dashboard"
                className="rounded-xl border border-gray-300 bg-white px-3.5 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50 transition"
              >
                {t("back_to_dashboard")}
              </Link>
            </div>
          </div>

          {/* Report Type & Presets Bar */}
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className={tabBtn(tab === "sales")} onClick={() => setTab("sales")}>
                📈 {t("sales_tab")}
              </button>
              <button type="button" className={tabBtn(tab === "pl")} onClick={() => setTab("pl")}>
                ⚖️ {t("pl_tab")}
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="rounded-xl border border-gray-300 bg-white px-3 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-50"
                onClick={() => quick("today")}
              >
                {t("today")}
              </button>
              <button
                type="button"
                className="rounded-xl border border-gray-300 bg-white px-3 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-50"
                onClick={() => quick("month")}
              >
                {t("this_month")}
              </button>
              <button
                type="button"
                className="rounded-xl border border-gray-300 bg-white px-3 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-50"
                onClick={() => quick("year")}
              >
                {t("this_year")}
              </button>
              <button
                type="button"
                onClick={exportCsv}
                className="rounded-xl bg-emerald-700 px-3.5 py-1.5 text-xs font-black text-white shadow hover:bg-emerald-800 transition"
              >
                📥 {t("export_csv")}
              </button>
            </div>
          </div>

          {/* Custom Date Filters */}
          <div className="mt-4 flex flex-wrap items-end gap-3 rounded-xl bg-emerald-50/50 p-3 border border-emerald-200">
            <label className="text-xs font-bold text-gray-700">
              {t("from")}
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="mt-1 block rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-900 font-mono"
              />
            </label>
            <label className="text-xs font-bold text-gray-700">
              {t("to")}
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="mt-1 block rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-900 font-mono"
              />
            </label>
            <button
              type="button"
              onClick={showCustom}
              className="rounded-xl bg-emerald-800 px-5 py-2 text-xs font-bold text-white shadow hover:bg-emerald-900"
            >
              {t("show")}
            </button>
          </div>

          {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-xs font-bold text-red-700 border border-red-200">⚠️ {error}</p>}
          {loading && <p className="mt-6 text-center text-xs font-bold text-emerald-800 animate-pulse">{t("loading")}</p>}

          {/* TAB 1: SALES REPORT */}
          {!loading && tab === "sales" && sales && (
            <div className="mt-6 space-y-6 text-xs text-gray-800">
              {/* Sales Metrics Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="rounded-xl border border-emerald-100 bg-white p-4 shadow-sm border-l-4 border-l-emerald-600">
                  <span className="text-[11px] font-bold text-slate-500 uppercase">કુલ વેચાણ (Gross Sales)</span>
                  <p className="text-2xl font-black text-emerald-950 font-mono mt-1">₹{sales.total_sales}</p>
                </div>
                <div className="rounded-xl border border-emerald-100 bg-white p-4 shadow-sm border-l-4 border-l-amber-600">
                  <span className="text-[11px] font-bold text-slate-500 uppercase">માલ પરત (Sales Return)</span>
                  <p className="text-2xl font-black text-amber-700 font-mono mt-1">₹{sales.sales_return}</p>
                </div>
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 shadow-sm border-l-4 border-l-teal-700">
                  <span className="text-[11px] font-bold text-emerald-800 uppercase">ચોખ્ખું વેચાણ (Net Sales)</span>
                  <p className="text-2xl font-black text-emerald-900 font-mono mt-1">₹{sales.net_sales}</p>
                </div>
              </div>

              {/* Day-by-Day Table */}
              <div className="overflow-x-auto rounded-xl border border-emerald-100">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-emerald-800 text-white">
                      <th className={`${th} rounded-tl-xl`}>તારીખ (Date)</th>
                      <th className={th}>બિલો (Bills)</th>
                      <th className={`${th} text-right`}>વેચાણ (Sales)</th>
                      <th className={`${th} text-right`}>ડિસ્કાઉન્ટ</th>
                      <th className={`${th} text-right`}>ટેક્સ (GST)</th>
                      <th className={`${th} text-right rounded-tr-xl`}>રોકડ વસૂલાત</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-emerald-100 font-medium">
                    {sales.daily.length === 0 && (
                      <tr>
                        <td colSpan={6} className="p-4 text-center text-gray-400 font-semibold">આ સમયગાળામાં કોઈ વેચાણ નોંધાયેલ નથી.</td>
                      </tr>
                    )}
                    {sales.daily.map((d) => (
                      <tr key={d.date} className="hover:bg-emerald-50/40 transition">
                        <td className="p-3 font-mono text-slate-800">{d.date}</td>
                        <td className="p-3 font-bold text-slate-900">{d.bills}</td>
                        <td className="p-3 text-right font-mono font-bold text-slate-900">₹{d.sales}</td>
                        <td className="p-3 text-right font-mono text-emerald-700">₹{d.discount}</td>
                        <td className="p-3 text-right font-mono text-slate-600">₹{d.tax}</td>
                        <td className="p-3 text-right font-mono font-black text-emerald-800">₹{d.collected}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Breakdown Grid: Products & Customers */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                <div className="rounded-xl border border-emerald-100 p-4 bg-white shadow-sm">
                  <h3 className="font-black text-emerald-950 uppercase tracking-wider text-xs mb-3 border-b border-gray-100 pb-2">
                    🛍️ {t("product_wise_sales")}
                  </h3>
                  <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                    {sales.products.length === 0 && <p className="text-gray-400">કોઈ ડેટા નથી.</p>}
                    {sales.products.map((p) => (
                      <div key={p.name} className="flex justify-between items-center border-b border-gray-100 py-1.5">
                        <div>
                          <span className="font-bold text-gray-800 block">{p.name}</span>
                          <span className="text-[10px] text-gray-400 font-mono">જથ્થો: {p.quantity}</span>
                        </div>
                        <span className="font-mono font-black text-emerald-900">₹{p.amount}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-emerald-100 p-4 bg-white shadow-sm">
                  <h3 className="font-black text-emerald-950 uppercase tracking-wider text-xs mb-3 border-b border-gray-100 pb-2">
                    👤 {t("customer_wise_sales")}
                  </h3>
                  <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                    {sales.customers.length === 0 && <p className="text-gray-400">કોઈ ડેટા નથી.</p>}
                    {sales.customers.map((c) => (
                      <div key={c.name} className="flex justify-between items-center border-b border-gray-100 py-1.5">
                        <div>
                          <span className="font-bold text-gray-800 block">{c.name}</span>
                          <span className="text-[10px] text-gray-400 font-mono">{c.bills} બિલો</span>
                        </div>
                        <span className="font-mono font-black text-emerald-900">₹{c.amount}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: PROFIT & LOSS (P&L) STATEMENT */}
          {!loading && tab === "pl" && pl && (
            <div className="mt-6 max-w-lg mx-auto rounded-2xl bg-white p-6 shadow-md border-2 border-emerald-700/60 space-y-3 text-xs text-gray-800">
              <h3 className="text-sm font-black text-emerald-950 uppercase tracking-wider text-center border-b border-emerald-100 pb-3 mb-4">
                📑 નફો અને નુકસાન હિસાબ (Profit & Loss Statement)
              </h3>

              <div className="flex justify-between items-center border-b border-gray-100 py-1.5">
                <span className="font-bold text-gray-700">કુલ વેચાણ (Total Sales):</span>
                <span className="font-mono font-bold text-emerald-950 text-sm">₹{pl.sales}</span>
              </div>

              <div className="flex justify-between items-center border-b border-gray-100 py-1.5">
                <span className="font-bold text-gray-700">માલની પડતર કિંમત (Cost of Goods Sold - COGS):</span>
                <span className="font-mono font-semibold text-slate-700 text-sm">- ₹{pl.cogs}</span>
              </div>

              <div className="flex justify-between items-center bg-emerald-50/70 p-2.5 rounded-lg border border-emerald-200">
                <div>
                  <span className="font-black text-emerald-900 block">કુલ નફો (Gross Profit):</span>
                  <span className="text-[10px] text-emerald-700 font-bold">માર્જિન: {pl.margin_percent}%</span>
                </div>
                <span className="font-mono font-black text-emerald-900 text-base">₹{pl.gross_profit}</span>
              </div>

              {/* Categorized Expenses */}
              <div className="pt-2">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 block mb-1">
                  દુકાનના ખર્ચાની વિગત (Expenses):
                </span>
                {pl.expense_categories.map((e) => (
                  <div key={e.category} className="flex justify-between items-center border-b border-gray-100 py-1 pl-3 text-gray-600">
                    <span className="capitalize">• {e.category}</span>
                    <span className="font-mono font-semibold text-amber-700">₹{e.amount}</span>
                  </div>
                ))}
              </div>

              <div className="flex justify-between items-center border-b border-gray-200 py-1.5">
                <span className="font-bold text-gray-700">કુલ સક્રિય ખર્ચા (Total Expenses):</span>
                <span className="font-mono font-bold text-amber-700 text-sm">- ₹{pl.expenses}</span>
              </div>

              {/* Net Profit Bar */}
              <div
                className={`flex justify-between items-center p-3.5 rounded-xl border-2 shadow-sm ${
                  Number(pl.net_profit) < 0
                    ? "bg-red-50 border-red-300 text-red-900"
                    : "bg-emerald-800 border-emerald-900 text-white"
                }`}
              >
                <span className="text-sm font-black uppercase tracking-wider">
                  ચોખ્ખો નફો (NET PROFIT):
                </span>
                <span className="text-xl font-black font-mono">₹{pl.net_profit}</span>
              </div>
            </div>
          )}
        </div>
      </main>
    </RoleGuard>
  );
}