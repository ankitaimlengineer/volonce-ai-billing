"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ApiError, authGet, clearTokens } from "@/lib/api";

type Purchase = {
  id: string;
  supplier_id: string;
  invoice_number: string;
  purchase_date: string;
  grand_total: string;
  paid_amount: string;
};
type Supplier = { id: string; name: string };

export default function PurchasesPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Purchase[]>([]);
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
        const [p, s] = await Promise.all([
          authGet<Purchase[]>("/api/v1/purchases?limit=100"),
          authGet<{ items: Supplier[] }>("/api/v1/suppliers?page_size=100&include_inactive=true"),
        ]);
        if (cancelled) return;
        setRows(p);
        setNames(Object.fromEntries(s.items.map((x) => [x.id, x.name])));
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) return onAuthError();
        if (err instanceof ApiError && err.status === 403) return router.replace("/setup");
        setError(err instanceof Error ? err.message : "Could not load purchases");
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
          <h1 className="text-2xl font-bold text-emerald-800">Purchases</h1>
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="text-sm text-gray-600 hover:underline">
              ← Dashboard
            </Link>
            <Link
              href="/purchases/new"
              className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
            >
              + New Purchase
            </Link>
          </div>
        </div>

        {error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

        <table className="mt-4 w-full text-sm">
          <thead>
            <tr className="bg-emerald-700 text-left text-white">
              <th className="p-2">Date</th>
              <th className="p-2">Supplier</th>
              <th className="p-2">Invoice</th>
              <th className="p-2 text-right">Total</th>
              <th className="p-2 text-right">Paid</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={5} className="p-4 text-center text-gray-500">Loading...</td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={5} className="p-4 text-center text-gray-500">Haju koi purchase nathi.</td></tr>
            )}
            {rows.map((p) => (
              <tr key={p.id} className="border-b border-gray-200 text-gray-800">
                <td className="p-2">{p.purchase_date}</td>
                <td className="p-2 font-medium">{names[p.supplier_id] ?? "-"}</td>
                <td className="p-2">{p.invoice_number}</td>
                <td className="p-2 text-right">₹{p.grand_total}</td>
                <td className="p-2 text-right">₹{p.paid_amount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}