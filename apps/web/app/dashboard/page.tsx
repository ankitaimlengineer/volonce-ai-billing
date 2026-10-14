"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ApiError, authGet, clearTokens } from "@/lib/api";

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

const PRESETS: [Preset, string][] = [
  ["today", "Today"],
  ["yesterday", "Yesterday"],
  ["week", "This Week"],
  ["month", "This Month"],
  ["year", "This Year"],
  ["custom", "Custom"],
];

function Card({ title, value, tone, sub }: { title: string; value: string; tone?: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p className="text-sm text-gray-500">{title}</p>
      <p className={`mt-1 text-2xl font-bold ${tone ?? "text-gray-900"}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400">{sub}</p>}
    </div>
  );
}

const money = (v: string) => `₹${v}`;

export default function DashboardPage() {
  const router = useRouter();
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
          // setup not complete, or role cannot see reports
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
    "rounded-lg border border-emerald-700 px-4 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50";
  const tab = (a: boolean) =>
    `rounded-lg px-3 py-1.5 text-sm font-medium ${
      a ? "bg-emerald-700 text-white" : "border border-gray-300 text-gray-700"
    }`;
  const profitTone = (v: string) => (Number(v) < 0 ? "text-red-700" : "text-emerald-800");

  return (
    <main className="min-h-screen bg-emerald-50 p-6">
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-emerald-800">Dashboard</h1>
          <Link
            href="/billing/new"
            className="rounded-lg bg-emerald-700 px-6 py-3 text-lg font-semibold text-white hover:bg-emerald-800"
          >
            + New Bill
          </Link>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {PRESETS.map(([k, l]) => (
            <button key={k} className={tab(preset === k)} onClick={() => choose(k)}>
              {l}
            </button>
          ))}
        </div>

        {preset === "custom" && (
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="text-sm text-gray-700">
              From
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
                className="mt-1 block rounded-lg border border-gray-300 px-2 py-1.5 text-gray-900" />
            </label>
            <label className="text-sm text-gray-700">
              To
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
                className="mt-1 block rounded-lg border border-gray-300 px-2 py-1.5 text-gray-900" />
            </label>
            <button onClick={applyCustom}
              className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white">
              Show
            </button>
          </div>
        )}

        {error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

        {data && (
          <>
            <p className="mt-4 text-xs text-gray-500">
              {data.date_from === data.date_to
                ? data.date_from
                : `${data.date_from} thi ${data.date_to}`}
            </p>

            <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Card title="Total Sales" value={money(data.sales)} tone="text-emerald-800" />
              <Card title="Bills" value={String(data.bills)} />
              <Card title="Collections" value={money(data.collections)} />
              <Card title="Purchases" value={money(data.purchases)} />
              <Card title="Gross Profit" value={money(data.gross_profit)}
                tone={profitTone(data.gross_profit)} sub={`Margin ${data.margin_percent}%`} />
              <Card title="Expenses" value={money(data.expenses)} tone="text-amber-700" />
              <Card title="Net Profit" value={money(data.net_profit)} tone={profitTone(data.net_profit)} />
              <Card title="Cost of goods" value={money(data.cogs)} />
            </div>

            <h2 className="mt-6 text-sm font-semibold text-gray-600">Aaj sudhi nu (period ni asar nahi)</h2>
            <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Card title="Levana (Receivable)" value={money(data.receivable)} tone="text-emerald-800" />
              <Card title="Aapva (Payable)" value={money(data.payable)} tone="text-amber-700" />
              <Card title="Stock Value" value={money(data.stock_value)} />
              <Card title="Low / Out of stock" value={`${data.low_stock} / ${data.out_of_stock}`}
                tone={data.out_of_stock > 0 ? "text-red-700" : "text-gray-900"} />
            </div>
          </>
        )}

        <div className="mt-8 flex flex-wrap gap-2">
          <Link href="/invoices" className={nav}>Invoices</Link>
          <Link href="/products" className={nav}>Products</Link>
          <Link href="/stock" className={nav}>Stock</Link>
          <Link href="/customers" className={nav}>Customers</Link>
          <Link href="/suppliers" className={nav}>Suppliers</Link>
          <Link href="/purchases" className={nav}>Purchases</Link>
          <Link href="/expenses" className={nav}>Expenses</Link>
          <Link href="/reports" className={nav}>Reports</Link>
        </div>
      </div>
    </main>
  );
}