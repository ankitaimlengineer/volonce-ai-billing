"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ApiError, authGet, clearTokens } from "@/lib/api";
import NotificationBell from "@/app/components/NotificationBell";
import LanguageSwitcher from "@/app/components/LanguageSwitcher";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { translations } from "@/lib/i18n/translations";
import DashboardCharts from "./DashboardCharts";

type DailyTrendPoint = {
  date: string;
  sales: number | string;
  collections: number | string;
  expenses: number | string;
  profit: number | string;
};

type PaymentMethodPoint = {
  method: string;
  amount: number | string;
};

type Summary = {
  date_from: string;
  date_to: string;
  sales: string;
  bills: number;
  collections: string;
  purchases: string;
  cogs: string;
  gross_profit: string;
  margin_percent: string;
  expenses: string;
  net_profit: string;
  receivable: string;
  payable: string;
  stock_value: string;
  low_stock: number;
  out_of_stock: number;
  daily_trend?: DailyTrendPoint[];
  payment_breakdown?: PaymentMethodPoint[];
};

type Range = { from: string; to: string } | null; // null = today (server default)
type Preset = "today" | "yesterday" | "week" | "month" | "year" | "custom";

const iso = (d: Date) => {
  const l = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return l.toISOString().slice(0, 10);
};

function rangeFor(p: Preset): Range {
  const now = new Date();
  if (p === "today") return null;
  if (p === "yesterday") {
    const y = new Date(now);
    y.setDate(now.getDate() - 1);
    return { from: iso(y), to: iso(y) };
  }
  if (p === "week") {
    const s = new Date(now);
    const day = (now.getDay() + 6) % 7; // Monday start
    s.setDate(now.getDate() - day);
    return { from: iso(s), to: iso(now) };
  }
  if (p === "month") {
    return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: iso(now) };
  }
  return { from: iso(new Date(now.getFullYear(), 0, 1)), to: iso(now) };
}

const PRESETS: [Preset, keyof typeof translations["gu"]][] = [
  ["today", "today"],
  ["yesterday", "yesterday"],
  ["week", "this_week"],
  ["month", "this_month"],
  ["year", "this_year"],
  ["custom", "custom"],
];

function Card({
  title,
  value,
  tone,
  sub,
}: {
  title: string;
  value: string;
  tone?: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-emerald-100 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold text-gray-500">{title}</p>
      <p className={`mt-1 text-2xl font-black font-mono ${tone ?? "text-gray-900"}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

const money = (v: string) => `₹${v}`;

export default function DashboardPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const [preset, setPreset] = useState<Preset>("today");
  const [range, setRange] = useState<Range>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState("");

  const onAuthError = useCallback(() => {
    clearTokens();
    router.replace("/login");
  }, [router]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const p = new URLSearchParams();
        if (range) {
          p.set("date_from", range.from);
          p.set("date_to", range.to);
        }
        const res = await authGet<Summary>(`/api/v1/reports/summary?${p}`);
        if (!cancelled) {
          setData(res);
          setError("");
        }
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) return onAuthError();
        if (err instanceof ApiError && err.status === 403) {
          setError(err.message);
          return;
        }
        setError(err instanceof Error ? err.message : "Could not load dashboard");
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [range, onAuthError]);

  function choose(p: Preset) {
    setPreset(p);
    if (p !== "custom") setRange(rangeFor(p));
  }

  function applyCustom() {
    if (from && to) setRange({ from, to });
  }

  const nav =
    "rounded-lg border border-emerald-700 bg-white px-4 py-2 text-sm font-bold text-emerald-800 shadow-sm hover:bg-emerald-50 transition";
  const tab = (a: boolean) =>
    `rounded-lg px-3 py-1.5 text-xs md:text-sm font-bold transition ${
      a ? "bg-emerald-800 text-white shadow" : "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
    }`;
  const profitTone = (v: string) => (Number(v) < 0 ? "text-red-600" : "text-emerald-800");

  return (
    <main className="min-h-screen bg-emerald-50/50 p-4 md:p-6">
      <div className="mx-auto max-w-5xl">
        {/* Top Header with Language Switcher, Notification Bell, AI Counter & New Bill Buttons */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-emerald-200/80 pb-4">
          <div>
            <h1 className="text-2xl font-black text-emerald-950">{t("dashboard")}</h1>
            <p className="text-xs text-gray-500 mt-0.5">{t("store_daily_records")}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* 🌐 ૧-ક્લિક ભાષા સ્વિચર */}
            <LanguageSwitcher />

            {/* 🔔 Live Notification Bell */}
            <NotificationBell />

            {/* સ્માર્ટ AI કાઉન્ટર બટન */}
            <Link
              href="/billing/ai-counter"
              className="flex items-center gap-2 rounded-xl bg-emerald-800 px-5 py-2.5 text-sm font-black text-white shadow-lg hover:bg-emerald-900 transition"
            >
              {t("smart_ai_counter")}
            </Link>

            <Link
              href="/billing/new"
              className="rounded-xl border-2 border-emerald-700 bg-white px-4 py-2.5 text-sm font-bold text-emerald-800 hover:bg-emerald-50 shadow-sm transition"
            >
              {t("new_bill")}
            </Link>
          </div>
        </div>

        {/* Date Filter Tabs */}
        <div className="mt-5 flex flex-wrap items-center gap-2">
          {PRESETS.map(([k, transKey]) => (
            <button key={k} className={tab(preset === k)} onClick={() => choose(k)}>
              {t(transKey)}
            </button>
          ))}
        </div>

        {preset === "custom" && (
          <div className="mt-3 flex flex-wrap items-end gap-3 rounded-xl bg-white p-3 border border-emerald-100 shadow-sm">
            <label className="text-xs font-bold text-gray-700">
              {t("from")}
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="mt-1 block rounded-lg border border-gray-300 px-2 py-1.5 text-xs text-gray-900"
              />
            </label>
            <label className="text-xs font-bold text-gray-700">
              {t("to")}
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="mt-1 block rounded-lg border border-gray-300 px-2 py-1.5 text-xs text-gray-900"
              />
            </label>
            <button
              onClick={applyCustom}
              className="rounded-lg bg-emerald-700 px-4 py-2 text-xs font-bold text-white shadow hover:bg-emerald-800"
            >
              {t("show")}
            </button>
          </div>
        )}

        {error && (
          <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm font-bold text-red-700 border border-red-200">
            {error}
          </p>
        )}

        {data && (
          <>
            <p className="mt-4 text-xs font-semibold text-gray-500">
              {t("period")}: {data.date_from === data.date_to ? data.date_from : `${data.date_from} થી ${data.date_to}`}
            </p>

            {/* Overview Metrics Cards */}
            <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Card
                title={t("today_sales")}
                value={money(data.sales)}
                tone="text-emerald-800"
                sub={`${data.bills} ${t("bills_created")}`}
              />
              <Card title={t("total_bills")} value={String(data.bills)} />
              <Card
                title={t("cash_collections")}
                value={money(data.collections)}
                tone="text-emerald-700"
              />
              <Card title={t("purchases")} value={money(data.purchases)} />
              <Card
                title={t("gross_profit")}
                value={money(data.gross_profit)}
                tone={profitTone(data.gross_profit)}
                sub={`${t("margin")}: ${data.margin_percent}%`}
              />
              <Card
                title={t("expenses")}
                value={money(data.expenses)}
                tone="text-amber-700"
              />
              <Card
                title={t("net_profit")}
                value={money(data.net_profit)}
                tone={profitTone(data.net_profit)}
              />
              <Card title={t("cogs")} value={money(data.cogs)} />
            </div>

            {/* 📈 Recharts Graphical Charts Section */}
            <div className="mt-7">
              <DashboardCharts
                trendData={data.daily_trend || []}
                paymentData={data.payment_breakdown || []}
              />
            </div>

            {/* Outstanding & Inventory Stock Status */}
            <h2 className="mt-7 text-xs font-extrabold uppercase tracking-wider text-gray-500">
              {t("current_status")}
            </h2>
            <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Link href="/customers" className="block">
                <Card
                  title={t("receivable")}
                  value={money(data.receivable)}
                  tone="text-emerald-800"
                  sub={t("receivable_sub")}
                />
              </Link>
              <Link href="/suppliers" className="block">
                <Card
                  title={t("payable")}
                  value={money(data.payable)}
                  tone="text-amber-800"
                  sub={t("payable_sub")}
                />
              </Link>
              <Link href="/stock" className="block">
                <Card
                  title={t("stock_value")}
                  value={money(data.stock_value)}
                  tone="text-slate-900"
                  sub={t("total_stock_value")}
                />
              </Link>
              <Link href="/stock" className="block">
                <Card
                  title={t("stock_alert")}
                  value={`${data.low_stock} / ${data.out_of_stock}`}
                  tone={data.out_of_stock > 0 ? "text-red-600" : "text-gray-900"}
                  sub={t("attention_needed")}
                />
              </Link>
            </div>
          </>
        )}

        {/* Quick Module Navigation Links */}
        <div className="mt-8 flex flex-wrap gap-2.5 border-t border-emerald-200/60 pt-6">
          <Link href="/invoices" className={nav}>{t("nav_invoices")}</Link>
          <Link href="/products" className={nav}>{t("nav_products")}</Link>
          <Link href="/stock" className={nav}>{t("nav_stock")}</Link>
          <Link href="/customers" className={nav}>{t("nav_customers")}</Link>
          <Link href="/suppliers" className={nav}>{t("nav_suppliers")}</Link>
          <Link href="/purchases" className={nav}>{t("nav_purchases")}</Link>
          <Link href="/expenses" className={nav}>{t("nav_expenses")}</Link>
          <Link href="/reports" className={nav}>{t("nav_reports")}</Link>
          <Link href="/subscription" className={nav}>{t("nav_subscription")}</Link>
        </div>
      </div>
    </main>
  );
}