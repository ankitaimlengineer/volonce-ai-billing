"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ApiError, authDownload, authGet, clearTokens } from "@/lib/api";

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
        setError(err instanceof Error ? err.message : "Could not load report");
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
      setError("From ane To banne tarikh select karo");
      return;
    }
    if (to < from) {
      setError("To tarikh From thi pehla na hoi shake");
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
      setError(err instanceof Error ? err.message : "Export failed");
    }
  }

  const t = (a: boolean) =>
    `rounded-lg px-4 py-1.5 text-sm font-medium ${
      a ? "bg-emerald-700 text-white" : "border border-gray-300 text-gray-700"
    }`;
  const th = "bg-emerald-700 p-2 text-left text-white";

  return (
    <main className="min-h-screen bg-emerald-50 p-6">
      <div className="mx-auto max-w-5xl rounded-2xl bg-white p-6 shadow">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-emerald-800">Reports</h1>
          <div className="flex items-center gap-4">
            <Link
              href="/reports/cashflow"
              className="text-sm font-medium text-emerald-700 hover:underline"
            >
              Cash Flow
            </Link>
            <Link href="/dashboard" className="text-sm text-gray-600 hover:underline">
              ← Dashboard
            </Link>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button className={t(tab === "sales")} onClick={() => setTab("sales")}>
            Sales
          </button>
          <button className={t(tab === "pl")} onClick={() => setTab("pl")}>
            Profit &amp; Loss
          </button>
          <span className="mx-2 text-gray-300">|</span>
          <button className={t(false)} onClick={() => quick("today")}>
            Today
          </button>
          <button className={t(false)} onClick={() => quick("month")}>
            This Month
          </button>
          <button className={t(false)} onClick={() => quick("year")}>
            This Year
          </button>
          <button
            onClick={exportCsv}
            className="ml-auto rounded-lg border border-emerald-700 px-4 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-50"
          >
            Export CSV
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="text-sm text-gray-700">
            From
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="mt-1 block rounded-lg border border-gray-300 px-2 py-1.5 text-gray-900"
            />
          </label>
          <label className="text-sm text-gray-700">
            To
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="mt-1 block rounded-lg border border-gray-300 px-2 py-1.5 text-gray-900"
            />
          </label>
          <button
            onClick={showCustom}
            className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white"
          >
            Show
          </button>
        </div>

        {error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {loading && <p className="mt-4 text-sm text-gray-500">Loading...</p>}

        {!loading && tab === "sales" && sales && (
          <div className="mt-4 space-y-6 text-sm text-gray-800">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl border p-3">
                Sales<p className="text-xl font-bold">₹{sales.total_sales}</p>
              </div>
              <div className="rounded-xl border p-3">
                Return<p className="text-xl font-bold text-amber-700">₹{sales.sales_return}</p>
              </div>
              <div className="rounded-xl border p-3">
                Net Sales<p className="text-xl font-bold text-emerald-800">₹{sales.net_sales}</p>
              </div>
            </div>

            <table className="w-full">
              <thead>
                <tr>
                  <th className={th}>Date</th>
                  <th className={th}>Bills</th>
                  <th className={th}>Sales</th>
                  <th className={th}>Discount</th>
                  <th className={th}>Tax</th>
                  <th className={th}>Collected</th>
                </tr>
              </thead>
              <tbody>
                {sales.daily.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-3 text-center text-gray-500">
                      Koi sales nathi.
                    </td>
                  </tr>
                )}
                {sales.daily.map((d) => (
                  <tr key={d.date} className="border-b">
                    <td className="p-2">{d.date}</td>
                    <td className="p-2">{d.bills}</td>
                    <td className="p-2">₹{d.sales}</td>
                    <td className="p-2">₹{d.discount}</td>
                    <td className="p-2">₹{d.tax}</td>
                    <td className="p-2">₹{d.collected}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="grid gap-6 sm:grid-cols-2">
              <div>
                <p className="mb-1 font-semibold">Product-wise</p>
                {sales.products.map((p) => (
                  <p key={p.name} className="flex justify-between border-b py-1">
                    <span>
                      {p.name} ({p.quantity})
                    </span>
                    <span>₹{p.amount}</span>
                  </p>
                ))}
              </div>
              <div>
                <p className="mb-1 font-semibold">Customer-wise</p>
                {sales.customers.map((c) => (
                  <p key={c.name} className="flex justify-between border-b py-1">
                    <span>
                      {c.name} ({c.bills})
                    </span>
                    <span>₹{c.amount}</span>
                  </p>
                ))}
                <p className="mb-1 mt-4 font-semibold">Payment-wise</p>
                {sales.payments.map((p) => (
                  <p key={p.method} className="flex justify-between border-b py-1">
                    <span>{p.method}</span>
                    <span>₹{p.amount}</span>
                  </p>
                ))}
              </div>
            </div>
          </div>
        )}

        {!loading && tab === "pl" && pl && (
          <div className="mt-4 max-w-md space-y-1 text-sm text-gray-800">
            <p className="flex justify-between border-b py-1">
              <span>Total Sales</span>
              <span>₹{pl.sales}</span>
            </p>
            <p className="flex justify-between border-b py-1">
              <span>Cost of Goods Sold</span>
              <span>₹{pl.cogs}</span>
            </p>
            <p className="flex justify-between border-b py-1 font-semibold">
              <span>Gross Profit</span>
              <span>₹{pl.gross_profit}</span>
            </p>
            <p className="flex justify-between border-b py-1 text-gray-500">
              <span>Margin</span>
              <span>{pl.margin_percent}%</span>
            </p>
            {pl.expense_categories.map((e) => (
              <p key={e.category} className="flex justify-between border-b py-1 pl-4">
                <span>{e.category}</span>
                <span>₹{e.amount}</span>
              </p>
            ))}
            <p className="flex justify-between border-b py-1">
              <span>Total Expenses</span>
              <span>₹{pl.expenses}</span>
            </p>
            <p
              className={`flex justify-between py-2 text-lg font-bold ${
                Number(pl.net_profit) < 0 ? "text-red-700" : "text-emerald-800"
              }`}
            >
              <span>Net Profit</span>
              <span>₹{pl.net_profit}</span>
            </p>
          </div>
        )}
      </div>
    </main>
  );
}