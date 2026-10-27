"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ApiError, authGet, clearTokens } from "@/lib/api";
import LanguageSwitcher from "@/app/components/LanguageSwitcher";
import { useLanguage } from "@/lib/i18n/LanguageContext";

type Invoice = {
  id: string;
  invoice_number: string;
  invoice_date: string;
  customer_id: string | null;
  grand_total: string;
  paid_amount: string;
};
type Customer = { id: string; name: string };

export default function InvoicesPage() {
  const router = useRouter();
  const { t } = useLanguage();

  const [rows, setRows] = useState<Invoice[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const onAuthError = useCallback(() => {
    clearTokens();
    router.replace("/login");
  }, [router]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [inv, cus] = await Promise.all([
          authGet<Invoice[]>("/api/v1/invoices?limit=100"),
          authGet<{ items: Customer[] }>("/api/v1/customers?page_size=100&include_inactive=true"),
        ]);
        if (cancelled) return;
        setRows(inv);
        setNames(Object.fromEntries(cus.items.map((c) => [c.id, c.name])));
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) return onAuthError();
        if (err instanceof ApiError && err.status === 403) return router.replace("/setup");
        setError(err instanceof Error ? err.message : "Could not load invoices");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [onAuthError, router]);

  return (
    <main className="min-h-screen bg-emerald-50/50 p-4 md:p-6">
      <div className="mx-auto max-w-5xl rounded-2xl bg-white p-6 shadow-md border border-emerald-100">
        {/* Header with Title and Language Switcher */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 pb-4">
          <h1 className="text-2xl font-black text-emerald-950">{t("invoices_title")}</h1>
          
          <div className="flex flex-wrap items-center gap-2.5">
            {/* 🌐 ભાષા સ્વિચર */}
            <LanguageSwitcher />

            <Link
              href="/dashboard"
              className="rounded-xl border border-emerald-700 bg-white px-3.5 py-2 text-xs font-bold text-emerald-800 shadow-sm hover:bg-emerald-50 transition"
            >
              {t("back_to_dashboard")}
            </Link>

            <Link
              href="/billing/new"
              className="rounded-xl bg-emerald-700 px-4 py-2 text-xs font-bold text-white shadow hover:bg-emerald-800 transition"
            >
              {t("new_bill")}
            </Link>
          </div>
        </div>

        {error && <p className="mt-4 rounded-xl bg-red-50 p-3.5 text-xs font-bold text-red-700 border border-red-200">{error}</p>}

        {/* Invoices Table */}
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-emerald-800 text-white font-extrabold uppercase tracking-wider">
                <th className="p-3 rounded-l-lg">{t("invoice_number")}</th>
                <th className="p-3">{t("date")}</th>
                <th className="p-3">{t("customer_name")}</th>
                <th className="p-3 text-right">{t("total")}</th>
                <th className="p-3 text-right">{t("paid")}</th>
                <th className="p-3 text-right rounded-r-lg">{t("due")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-emerald-100 font-medium">
              {loading && (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-gray-500 font-semibold">{t("loading")}</td>
                </tr>
              )}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-gray-400 font-semibold">{t("no_invoices")}</td>
                </tr>
              )}
              {rows.map((r) => {
                const due = Number(r.grand_total) - Number(r.paid_amount);
                return (
                  <tr key={r.id} className="hover:bg-emerald-50/40 transition">
                    <td className="p-3 font-bold">
                      <Link href={`/invoices/${r.id}`} className="text-emerald-700 hover:underline">
                        {r.invoice_number}
                      </Link>
                    </td>
                    <td className="p-3 text-gray-600">{r.invoice_date}</td>
                    <td className="p-3 text-gray-900 font-bold">
                      {r.customer_id ? names[r.customer_id] ?? "-" : t("walk_in_customer")}
                    </td>
                    <td className="p-3 text-right font-mono font-bold text-slate-900">₹{r.grand_total}</td>
                    <td className="p-3 text-right font-mono font-bold text-emerald-700">₹{r.paid_amount}</td>
                    <td className={`p-3 text-right font-mono font-bold ${due > 0 ? "text-red-600 font-black" : "text-gray-400"}`}>
                      ₹{due.toFixed(2)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}