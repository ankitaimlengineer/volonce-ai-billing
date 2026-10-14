"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ApiError, authDownload, authGet, clearTokens } from "@/lib/api";

type Flow = {
  date_from: string;
  date_to: string;
  money_in: { source: string; amount: string }[];
  total_in: string;
  money_out: { source: string; amount: string }[];
  total_out: string;
  net: string;
  by_method: { method: string; in: string; out: string; net: string }[];
};

const iso = (d: Date) =>
  new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

export default function CashFlowPage() {
  const router = useRouter();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [period, setPeriod] = useState<{ from: string; to: string } | null>(null);
  const [data, setData] = useState<Flow | null>(null);
  const [error, setError] = useState("");

  const onAuthError = useCallback(() => {
    clearTokens();
    router.replace("/login");
  }, [router]);

  const query = period ? `date_from=${period.from}&date_to=${period.to}` : "";

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await authGet<Flow>(`/api/v1/reports/cash-flow?${query}`);
        if (!cancelled) {
          setData(res);
          setError("");
        }
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) return onAuthError();
        setError(err instanceof Error ? err.message : "Could not load report");
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [query, onAuthError]);

  function quick(kind: "today" | "month" | "year") {
    const now = new Date();
    if (kind === "today") setPeriod(null);
    else if (kind === "month")
      setPeriod({ from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: iso(now) });
    else setPeriod({ from: iso(new Date(now.getFullYear(), 0, 1)), to: iso(now) });
  }

  async function exportCsv() {
    try {
      await authDownload(
        `/api/v1/reports/cash-flow?format=csv${query ? "&" + query : ""}`,
        "cash_flow.csv"
      );
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return onAuthError();
      setError(err instanceof Error ? err.message : "Export failed");
    }
  }

  const btn = "rounded-lg border border-gray-300 px-4 py-1.5 text-sm font-medium text-gray-700";
  const th = "bg-emerald-700 p-2 text-left text-white";

  return (
    <main className="min-h-screen bg-emerald-50 p-6">
      <div className="mx-auto max-w-4xl rounded-2xl bg-white p-6 shadow">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-emerald-800">Cash Flow</h1>
          <Link href="/reports" className="text-sm text-gray-600 hover:underline">
            ← Reports
          </Link>
         <Link href="/reports/cashflow" className="text-sm font-medium text-emerald-700 hover:underline">
            Cash Flow
          </Link>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button className={btn} onClick={() => quick("today")}>Today</button>
          <button className={btn} onClick={() => quick("month")}>This Month</button>
          <button className={btn} onClick={() => quick("year")}>This Year</button>
          <button onClick={exportCsv}
            className="ml-auto rounded-lg border border-emerald-700 px-4 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-50">
            Export CSV
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="text-sm text-gray-700">From
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
              className="mt-1 block rounded-lg border border-gray-300 px-2 py-1.5 text-gray-900" />
          </label>
          <label className="text-sm text-gray-700">To
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
              className="mt-1 block rounded-lg border border-gray-300 px-2 py-1.5 text-gray-900" />
          </label>
          <button onClick={() => from && to && setPeriod({ from, to })}
            className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white">
            Show
          </button>
        </div>

        {error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

        {data && (
          <div className="mt-4 space-y-6 text-sm text-gray-800">
            <p className="text-xs text-gray-500">
              {data.date_from === data.date_to ? data.date_from : `${data.date_from} thi ${data.date_to}`}
            </p>

            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl border p-3">Money In
                <p className="text-xl font-bold text-emerald-800">₹{data.total_in}</p></div>
              <div className="rounded-xl border p-3">Money Out
                <p className="text-xl font-bold text-amber-700">₹{data.total_out}</p></div>
              <div className="rounded-xl border p-3">Net Cash Flow
                <p className={`text-xl font-bold ${Number(data.net) < 0 ? "text-red-700" : "text-emerald-800"}`}>
                  ₹{data.net}</p></div>
            </div>

            <div className="grid gap-6 sm:grid-cols-2">
              <div>
                <p className="mb-1 font-semibold">Money In</p>
                {data.money_in.length === 0 && <p className="text-gray-500">Kai nathi.</p>}
                {data.money_in.map((r) => (
                  <p key={r.source} className="flex justify-between border-b py-1">
                    <span>{r.source}</span><span>₹{r.amount}</span>
                  </p>
                ))}
              </div>
              <div>
                <p className="mb-1 font-semibold">Money Out</p>
                {data.money_out.length === 0 && <p className="text-gray-500">Kai nathi.</p>}
                {data.money_out.map((r) => (
                  <p key={r.source} className="flex justify-between border-b py-1">
                    <span>{r.source}</span><span>₹{r.amount}</span>
                  </p>
                ))}
              </div>
            </div>

            <table className="w-full">
              <thead>
                <tr><th className={th}>Method</th><th className={th}>In</th><th className={th}>Out</th><th className={th}>Net</th></tr>
              </thead>
              <tbody>
                {data.by_method.map((m) => (
                  <tr key={m.method} className="border-b">
                    <td className="p-2">{m.method}</td>
                    <td className="p-2">₹{m.in}</td>
                    <td className="p-2">₹{m.out}</td>
                    <td className="p-2">₹{m.net}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-gray-400">
              Fakt asli paisa (cash/UPI/card/bank). Udhar ane returns ahi nathi ganata.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}