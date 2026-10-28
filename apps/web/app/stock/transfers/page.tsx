"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { authGet } from "@/lib/api";
import AppHeader from "@/app/components/AppHeader";
import RoleGuard from "@/app/components/RoleGuard";

interface TransferItem {
  id: string;
  product_name: string;
  quantity: number | string;
}

interface TransferRow {
  id: string;
  transfer_number: string;
  from_shop_name: string;
  to_shop_name: string;
  transfer_date: string;
  status: string;
  notes: string | null;
  items: TransferItem[];
}

export default function StockTransfersPage() {
  const [transfers, setTransfers] = useState<TransferRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authGet<TransferRow[]>("/api/v1/inventory/transfers")
      .then(setTransfers)
      .catch((err) => console.log("Transfers error:", err))
      .finally(() => setLoading(false));
  }, []);

  return (
    <RoleGuard allowedRoles={["owner", "manager"]}>
      <main className="min-h-screen bg-emerald-50/50 p-4 md:p-6">
        <div className="mx-auto max-w-5xl">
          <AppHeader
            title="🔄 સ્ટોક ટ્રાન્સફર હિસ્ટ્રી (Stock Transfers)"
            subtitle="ગોડાઉન અને શાખાઓ વચ્ચે થયેલ તમામ માલની હેરફેર"
            backHref="/stock"
          />

          <div className="rounded-2xl bg-white p-6 shadow-md border border-emerald-100">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-100 pb-4 mb-4">
              <div>
                <h2 className="text-lg font-black text-emerald-950">ટ્રાન્સફર રેકોર્ડ્સ</h2>
                <p className="text-xs text-slate-500">ગોડાઉનમાંથી દુકાન કે અન્ય શાખામાં મોકલેલ માલ</p>
              </div>
              <Link
                href="/stock/transfers/new"
                className="rounded-xl bg-emerald-700 px-4 py-2 text-xs font-black text-white shadow hover:bg-emerald-800 transition"
              >
                + નવો સ્ટોક ટ્રાન્સફર કરો
              </Link>
            </div>

            {loading ? (
              <p className="py-10 text-center text-xs font-bold text-emerald-800 animate-pulse">
                ટ્રાન્સફર હિસ્ટ્રી લોડ થઈ રહી છે...
              </p>
            ) : transfers.length === 0 ? (
              <div className="py-12 text-center text-xs text-gray-400">
                હજુ સુધી કોઈ સ્ટોક ટ્રાન્સફર થયેલ નથી.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-emerald-800 text-white font-extrabold uppercase">
                      <th className="p-3 rounded-l-lg">ટ્રાન્સફર નં.</th>
                      <th className="p-3">તારીખ</th>
                      <th className="p-3">ક્યાંથી (Source)</th>
                      <th className="p-3">ક્યાં (Destination)</th>
                      <th className="p-3 text-center">વસ્તુઓ</th>
                      <th className="p-3 rounded-r-lg">સ્થિતિ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-emerald-100 font-medium">
                    {transfers.map((t) => (
                      <tr key={t.id} className="hover:bg-emerald-50/40 transition">
                        <td className="p-3 font-mono font-bold text-emerald-950">{t.transfer_number}</td>
                        <td className="p-3 text-gray-600">{t.transfer_date}</td>
                        <td className="p-3 font-bold text-amber-800">🏢 {t.from_shop_name}</td>
                        <td className="p-3 font-bold text-emerald-800">🏪 {t.to_shop_name}</td>
                        <td className="p-3 text-center">
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 font-bold text-slate-700">
                            {t.items.length} પ્રોડક્ટ્સ
                          </span>
                        </td>
                        <td className="p-3">
                          <span className="rounded-full bg-emerald-100 text-emerald-800 px-2.5 py-0.5 font-black text-[10px] uppercase">
                            ✓ પૂર્ણ ({t.status})
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </main>
    </RoleGuard>
  );
}