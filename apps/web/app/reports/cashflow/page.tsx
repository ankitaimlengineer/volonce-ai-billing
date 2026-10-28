"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ApiError, authDownload, authGet, clearTokens } from "@/lib/api";
import RoleGuard from "@/app/components/RoleGuard";
import LanguageSwitcher from "@/app/components/LanguageSwitcher";
import { useLanguage } from "@/lib/i18n/LanguageContext";

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
  const { t } = useLanguage();

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [period, setPeriod] = useState<{ from: string; to: string } | null>(null);
  const [data, setData] = useState<Flow | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

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
        const res = await authGet<Flow>(`/api/v1/reports/cash-flow?${query}`);
        if (!cancelled) {
          setData(res);
          setError("");
        }
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) return onAuthError();
        setError(err instanceof Error ? err.message : "કેશ ફ્લો રિપોર્ટ લોડ થઈ શક્યો નથી.");
      } finally {
        if (!cancelled) setLoading(false);
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
      setError(err instanceof Error ? err.message : "Export નિષ્ફળ ગયું.");
    }
  }

  const th = "p-3 text-left font-extrabold uppercase tracking-wider text-xs";

  return (
    // 🛡️ ફક્ત Owner અને Manager જ કેશ ફ્લો હિસાબ જોઈ શકે
    <RoleGuard allowedRoles={["owner", "manager"]}>
      <main className="min-h-screen bg-emerald-50/50 p-4 md:p-6">
        <div className="mx-auto max-w-4xl rounded-2xl bg-white p-6 shadow-md border border-emerald-100">
          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-100 pb-5">
            <div>
              <h1 className="text-2xl font-black text-emerald-950">💵 {t("cashflow_tab")}</h1>
              <p className="text-xs text-slate-500 mt-0.5">દુકાનમાં આવેલી રોકડ રકમ (Inflow) અને થયેલી ચુકવણી (Outflow)</p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <LanguageSwitcher />

              <Link
                href="/reports"
                className="rounded-xl border border-emerald-700 bg-white px-3.5 py-2 text-xs font-bold text-emerald-800 shadow-sm hover:bg-emerald-50 transition"
              >
                ← {t("reports_title")}
              </Link>

              <Link
                href="/dashboard"
                className="rounded-xl border border-gray-300 bg-white px-3.5 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50 transition"
              >
                {t("back_to_dashboard")}
              </Link>
            </div>
          </div>

          {/* Quick Presets & Export Bar */}
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="rounded-xl border border-gray-300 bg-white px-3.5 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-50 transition"
                onClick={() => quick("today")}
              >
                {t("today")}
              </button>
              <button
                type="button"
                className="rounded-xl border border-gray-300 bg-white px-3.5 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-50 transition"
                onClick={() => quick("month")}
              >
                {t("this_month")}
              </button>
              <button
                type="button"
                className="rounded-xl border border-gray-300 bg-white px-3.5 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-50 transition"
                onClick={() => quick("year")}
              >
                {t("this_year")}
              </button>
            </div>

            <button
              type="button"
              onClick={exportCsv}
              className="rounded-xl bg-emerald-700 px-4 py-1.5 text-xs font-black text-white shadow hover:bg-emerald-800 transition"
            >
              📥 {t("export_csv")}
            </button>
          </div>

          {/* Custom Date Filter */}
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
              onClick={() => from && to && setPeriod({ from, to })}
              className="rounded-xl bg-emerald-800 px-5 py-2 text-xs font-bold text-white shadow hover:bg-emerald-900"
            >
              {t("show")}
            </button>
          </div>

          {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-xs font-bold text-red-700 border border-red-200">⚠️ {error}</p>}
          {loading && <p className="mt-6 text-center text-xs font-bold text-emerald-800 animate-pulse">{t("loading")}</p>}

          {!loading && data && (
            <div className="mt-6 space-y-6 text-xs text-gray-800">
              <p className="text-[11px] font-semibold text-gray-500">
                સમયગાળો: {data.date_from === data.date_to ? data.date_from : `${data.date_from} થી ${data.date_to}`}
              </p>

              {/* 3 Overview Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="rounded-xl border border-emerald-100 bg-white p-4 shadow-sm border-l-4 border-l-emerald-600">
                  <span className="text-[11px] font-bold text-slate-500 uppercase">કુલ આવક (Money In)</span>
                  <p className="text-2xl font-black text-emerald-950 font-mono mt-1">₹{data.total_in}</p>
                  <span className="text-[10px] text-emerald-700 font-medium mt-0.5 block">વેચાણ અને ગ્રાહક પેમેન્ટ્સ</span>
                </div>

                <div className="rounded-xl border border-emerald-100 bg-white p-4 shadow-sm border-l-4 border-l-amber-600">
                  <span className="text-[11px] font-bold text-slate-500 uppercase">કુલ જાવક (Money Out)</span>
                  <p className="text-2xl font-black text-amber-700 font-mono mt-1">₹{data.total_out}</p>
                  <span className="text-[10px] text-amber-700 font-medium mt-0.5 block">ખરીદી, સપ્લાયર્સ અને ખર્ચા</span>
                </div>

                <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 shadow-sm border-l-4 border-l-teal-700">
                  <span className="text-[11px] font-bold text-emerald-800 uppercase">ચોખ્ખો કેશ ફ્લો (Net Cash Flow)</span>
                  <p className={`text-2xl font-black font-mono mt-1 ${Number(data.net) < 0 ? "text-red-700" : "text-emerald-900"}`}>
                    ₹{data.net}
                  </p>
                  <span className="text-[10px] text-slate-500 font-medium mt-0.5 block">હાથ પર રહેલી ચોખ્ખી રકમ</span>
                </div>
              </div>

              {/* Details In & Out Breakdown */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                <div className="rounded-xl border border-emerald-100 p-4 bg-white shadow-sm">
                  <h3 className="font-black text-emerald-950 uppercase tracking-wider text-xs mb-3 border-b border-gray-100 pb-2">
                    📥 આવક વિગત (Money In Sources)
                  </h3>
                  <div className="space-y-2">
                    {data.money_in.length === 0 && <p className="text-gray-400">કોઈ આવક નોંધાયેલ નથી.</p>}
                    {data.money_in.map((r) => (
                      <div key={r.source} className="flex justify-between items-center border-b border-gray-100 py-1.5 font-medium">
                        <span className="text-gray-700">{r.source}</span>
                        <span className="font-mono font-bold text-emerald-900">₹{r.amount}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-emerald-100 p-4 bg-white shadow-sm">
                  <h3 className="font-black text-emerald-950 uppercase tracking-wider text-xs mb-3 border-b border-gray-100 pb-2">
                    📤 જાવક વિગત (Money Out Sources)
                  </h3>
                  <div className="space-y-2">
                    {data.money_out.length === 0 && <p className="text-gray-400">કોઈ જાવક નોંધાયેલ નથી.</p>}
                    {data.money_out.map((r) => (
                      <div key={r.source} className="flex justify-between items-center border-b border-gray-100 py-1.5 font-medium">
                        <span className="text-gray-700">{r.source}</span>
                        <span className="font-mono font-bold text-amber-700">₹{r.amount}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Payment Methods Breakdown Table */}
              <div className="overflow-x-auto rounded-xl border border-emerald-100">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-emerald-800 text-white">
                      <th className={`${th} rounded-tl-xl`}>પદ્ધતિ (Payment Mode)</th>
                      <th className={`${th} text-right`}>આવક (+) In</th>
                      <th className={`${th} text-right`}>જાવક (-) Out</th>
                      <th className={`${th} text-right rounded-tr-xl`}>ચોખ્ખો બેલેન્સ (Net)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-emerald-100 font-medium">
                    {data.by_method.map((m) => (
                      <tr key={m.method} className="hover:bg-emerald-50/40 transition">
                        <td className="p-3 font-bold uppercase text-slate-800">{m.method}</td>
                        <td className="p-3 text-right font-mono font-bold text-emerald-700">₹{m.in}</td>
                        <td className="p-3 text-right font-mono font-bold text-amber-700">₹{m.out}</td>
                        <td className={`p-3 text-right font-mono font-black ${Number(m.net) < 0 ? "text-red-700" : "text-emerald-950"}`}>
                          ₹{m.net}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="text-[11px] text-gray-400 italic">
                * નોંધ: આ રિપોર્ટમાં માત્ર વાસ્તવિક નાણાકીય લેવડ-દેવડ (Cash / UPI / Card / Bank) નો જ સમાવેશ થાય છે. ઉધાર (Credit) નો સમાવેશ કેશ ફ્લોમાં થતો નથી.
              </p>
            </div>
          )}
        </div>
      </main>
    </RoleGuard>
  );
}