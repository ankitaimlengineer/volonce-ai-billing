"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ApiError, authGet, clearTokens } from "@/lib/api";

type Row = {
  product_id: string;
  name: string;
  sku: string | null;
  unit: string;
  batch_no: string | null;
  expiry_date: string;
  quantity: string;
  days_left: number;
  status: "expired" | "soon" | "ok";
};

type Report = {
  expired: number;
  soon: number;
  items: Row[];
  total: number;
};

const BADGE: Record<Row["status"], string> = {
  expired: "bg-red-100 text-red-800",
  soon: "bg-amber-100 text-amber-800",
  ok: "bg-emerald-100 text-emerald-800",
};

export default function ExpiryPage() {
  const router = useRouter();
  const [filter, setFilter] = useState<"" | "expired" | "soon" | "ok">("");
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Report | null>(null);
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
        const params = new URLSearchParams({ days: String(days), page_size: "100" });
        if (filter) params.set("status", filter);
        const res = await authGet<Report>(`/api/v1/inventory/expiry?${params}`);
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
        setError(err instanceof Error ? err.message : "Could not load expiry report");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [filter, days, onAuthError, router]);

  const tab = (active: boolean) =>
    `rounded-lg px-3 py-1.5 text-sm font-medium ${
      active ? "bg-emerald-700 text-white" : "border border-gray-300 text-gray-700"
    }`;

  return (
    <main className="min-h-screen bg-emerald-50 p-6">
      <div className="mx-auto max-w-5xl">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-emerald-800">Expiry</h1>
          <Link href="/stock" className="text-sm text-gray-600 hover:underline">
            ← Stock
          </Link>
        </div>

        {data && (
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <p className="text-sm text-gray-500">Expired batches</p>
              <p className="mt-1 text-2xl font-bold text-red-700">{data.expired}</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <p className="text-sm text-gray-500">Expiring in {days} days</p>
              <p className="mt-1 text-2xl font-bold text-amber-700">{data.soon}</p>
            </div>
          </div>
        )}

        <div className="mt-4 rounded-2xl bg-white p-6 shadow">
          <div className="flex flex-wrap items-center gap-2">
            <button className={tab(filter === "")} onClick={() => setFilter("")}>All</button>
            <button className={tab(filter === "expired")} onClick={() => setFilter("expired")}>
              Expired
            </button>
            <button className={tab(filter === "soon")} onClick={() => setFilter("soon")}>
              Expiring soon
            </button>
            <button className={tab(filter === "ok")} onClick={() => setFilter("ok")}>OK</button>
            <label className="ml-auto flex items-center gap-2 text-sm text-gray-600">
              Divas
              <input
                type="number"
                min={1}
                max={365}
                value={days}
                onChange={(e) =>
                  setDays(Math.min(365, Math.max(1, parseInt(e.target.value, 10) || 30)))
                }
                className="w-20 rounded-lg border border-gray-300 px-2 py-1 text-gray-900"
              />
            </label>
          </div>

          {error && (
            <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>
          )}

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-emerald-700 text-left text-white">
                  <th className="p-2">Product</th>
                  <th className="p-2">Batch</th>
                  <th className="p-2">Expiry</th>
                  <th className="p-2 text-right">Qty</th>
                  <th className="p-2 text-right">Days left</th>
                  <th className="p-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={6} className="p-4 text-center text-gray-500">Loading...</td>
                  </tr>
                )}
                {!loading && data?.items.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-4 text-center text-gray-500">
                      Koi batch nathi.
                    </td>
                  </tr>
                )}
                {data?.items.map((r, i) => (
                  <tr key={`${r.product_id}-${r.batch_no}-${r.expiry_date}-${i}`}
                    className="border-b border-gray-200 text-gray-800">
                    <td className="p-2 font-medium">{r.name}</td>
                    <td className="p-2">{r.batch_no ?? "-"}</td>
                    <td className="p-2">{r.expiry_date}</td>
                    <td className="p-2 text-right">{r.quantity} {r.unit}</td>
                    <td className="p-2 text-right">{r.days_left}</td>
                    <td className="p-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${BADGE[r.status]}`}>
                        {r.status === "soon" ? "Soon" : r.status === "ok" ? "OK" : "Expired"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}