"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ApiError, authGet, clearTokens } from "@/lib/api";

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
    <main className="min-h-screen bg-emerald-50 p-6">
      <div className="mx-auto max-w-4xl rounded-2xl bg-white p-6 shadow">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-emerald-800">Invoices</h1>
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="text-sm text-gray-600 hover:underline">
              ← Dashboard
            </Link>
            <Link
              href="/billing/new"
              className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
            >
              + New Bill
            </Link>
          </div>
        </div>

        {error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

        <table className="mt-4 w-full text-sm">
          <thead>
            <tr className="bg-emerald-700 text-left text-white">
              <th className="p-2">Invoice</th>
              <th className="p-2">Date</th>
              <th className="p-2">Customer</th>
              <th className="p-2 text-right">Total</th>
              <th className="p-2 text-right">Paid</th>
              <th className="p-2 text-right">Baaki</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={6} className="p-4 text-center text-gray-500">Loading...</td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={6} className="p-4 text-center text-gray-500">Haju koi bill nathi.</td></tr>
            )}
            {rows.map((r) => {
              const due = Number(r.grand_total) - Number(r.paid_amount);
              return (
                <tr key={r.id} className="border-b border-gray-200 text-gray-800">
                  <td className="p-2 font-medium">
                    <Link href={`/invoices/${r.id}`} className="text-emerald-700 hover:underline">
                      {r.invoice_number}
                    </Link>
                  </td>
                  <td className="p-2">{r.invoice_date}</td>
                  <td className="p-2">{r.customer_id ? names[r.customer_id] ?? "-" : "Walk-in"}</td>
                  <td className="p-2 text-right">₹{r.grand_total}</td>
                  <td className="p-2 text-right">₹{r.paid_amount}</td>
                  <td className={`p-2 text-right ${due > 0 ? "font-medium text-amber-700" : ""}`}>
                    ₹{due.toFixed(2)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}