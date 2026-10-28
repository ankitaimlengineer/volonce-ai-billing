"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authGet, authPost } from "@/lib/api";
import AppHeader from "@/app/components/AppHeader";
import RoleGuard from "@/app/components/RoleGuard";

interface Shop {
  id: string;
  name: string;
  city: string | null;
  is_default: boolean;
}

interface Product {
  id: string;
  name: string;
  unit: string;
}

interface LineItem {
  product_id: string;
  quantity: string;
  available_stock?: number;
}

export default function NewStockTransferPage() {
  const router = useRouter();
  const [shops, setShops] = useState<Shop[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  const [fromShopId, setFromShopId] = useState("");
  const [toShopId, setToShopId] = useState("");
  const [transferDate, setTransferDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");

  const [lines, setLines] = useState<LineItem[]>([{ product_id: "", quantity: "1" }]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      authGet<Shop[]>("/api/v1/business/shops"),
      authGet<{ items: Product[] }>("/api/v1/products?page_size=150"),
    ]).then(([sRes, pRes]) => {
      setShops(sRes || []);
      setProducts(pRes.items || []);
      if (sRes.length >= 2) {
        setFromShopId(sRes[0].id);
        setToShopId(sRes[1].id);
      }
    });
  }, []);

  // સોર્સ ગોડાઉનમાં રહેલો સ્ટોક લાઈવ ચેક કરવો
  const checkStock = async (pId: string, index: number, sourceId: string) => {
    if (!pId || !sourceId) return;
    try {
      const res = await authGet<{ available_stock: number }>(
        `/api/v1/inventory/transfers/shop-stock/${sourceId}/${pId}`
      );
      setLines((prev) =>
        prev.map((l, i) => (i === index ? { ...l, available_stock: res.available_stock } : l))
      );
    } catch {
      // ignore
    }
  };

  const handleProductChange = (index: number, pId: string) => {
    setLines((prev) =>
      prev.map((l, i) => (i === index ? { ...l, product_id: pId } : l))
    );
    checkStock(pId, index, fromShopId);
  };

  const handleSourceShopChange = (sId: string) => {
    setFromShopId(sId);
    // તમામ લાઈન્સનો સ્ટોક નવા ગોડાઉન મુજબ રી-ચેક કરો
    lines.forEach((l, idx) => {
      if (l.product_id) checkStock(l.product_id, idx, sId);
    });
  };

  const addLine = () => {
    setLines((prev) => [...prev, { product_id: "", quantity: "1" }]);
  };

  const removeLine = (index: number) => {
    setLines((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (fromShopId === toShopId) {
      setError("સોર્સ અને ડેસ્ટિનેશન ગોડાઉન અલગ અલગ હોવા જોઈએ.");
      return;
    }
    if (lines.some((l) => !l.product_id || Number(l.quantity) <= 0)) {
      setError("તમામ લાઈનમાં પ્રોડક્ટ અને માન્ય જથ્થો લખો.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      await authPost(
        "/api/v1/inventory/transfers",
        {
          from_shop_id: fromShopId,
          to_shop_id: toShopId,
          transfer_date: transferDate,
          notes: notes.trim() || null,
          items: lines.map((l) => ({
            product_id: l.product_id,
            quantity: Number(l.quantity),
          })),
        },
        { "Idempotency-Key": `trf-${Date.now()}-${Math.random().toString(36).substring(2, 7)}` }
      );

      alert("✓ સ્ટોક સફળતાપૂર્વક ટ્રાન્સફર થઈ ગયો!");
      router.push("/stock/transfers");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "ટ્રાન્સફર કરવામાં સમસ્યા આવી.";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <RoleGuard allowedRoles={["owner", "manager"]}>
      <main className="min-h-screen bg-emerald-50/50 p-4 md:p-6">
        <div className="mx-auto max-w-4xl">
          <AppHeader
            title="🔄 નવો સ્ટોક ટ્રાન્સફર (Godown to Shop)"
            subtitle="એક ગોડાઉન/શાખામાંથી બીજી શાખામાં માલ મોકલો"
            backHref="/stock/transfers"
          />

          <form onSubmit={handleSubmit} className="rounded-2xl bg-white p-6 shadow-md border border-emerald-100">
            {error && (
              <div className="mb-4 rounded-xl bg-red-50 p-3.5 text-xs font-bold text-red-700 border border-red-200">
                ⚠️ {error}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-b border-gray-100 pb-5">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase">
                  ૧. કયા ગોડાઉન/શાખામાંથી મોકલવો છે? (Source) *
                </label>
                <select
                  required
                  value={fromShopId}
                  onChange={(e) => handleSourceShopChange(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-300 p-2.5 text-xs font-bold text-gray-900 focus:ring-2 focus:ring-emerald-500"
                >
                  {shops.map((s) => (
                    <option key={s.id} value={s.id}>
                      🏢 {s.name} {s.city ? `(${s.city})` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase">
                  ૨. કયા ગોડાઉન/દુકાનમાં પહોંચાડવો છે? (Destination) *
                </label>
                <select
                  required
                  value={toShopId}
                  onChange={(e) => setToShopId(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-300 p-2.5 text-xs font-bold text-gray-900 focus:ring-2 focus:ring-emerald-500"
                >
                  {shops.map((s) => (
                    <option key={s.id} value={s.id}>
                      🏪 {s.name} {s.city ? `(${s.city})` : ""}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4 border-b border-gray-100">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase">
                  ટ્રાન્સફર તારીખ (Date) *
                </label>
                <input
                  type="date"
                  required
                  value={transferDate}
                  onChange={(e) => setTransferDate(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-300 p-2 text-xs font-mono font-bold text-gray-900"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase">
                  નોંધ (Vehicle No. / Driver / Notes)
                </label>
                <input
                  type="text"
                  placeholder="દા.ત. છોટા હાથી નં. GJ-01-XX-0000"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-300 p-2 text-xs text-gray-900"
                />
              </div>
            </div>

            {/* Items Table */}
            <div className="mt-5">
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-black uppercase text-emerald-950">
                  મોકલવાનો સામાન (Items to Transfer)
                </label>
                <button
                  type="button"
                  onClick={addLine}
                  className="rounded-lg bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800 border border-emerald-300 hover:bg-emerald-100"
                >
                  + બીજી પ્રોડક્ટ ઉમેરો
                </button>
              </div>

              <div className="space-y-3">
                {lines.map((line, idx) => (
                  <div key={idx} className="flex flex-wrap items-center gap-3 rounded-xl bg-slate-50 p-3 border border-slate-200">
                    <div className="flex-1 min-w-[200px]">
                      <select
                        required
                        value={line.product_id}
                        onChange={(e) => handleProductChange(idx, e.target.value)}
                        className="w-full rounded-lg border border-gray-300 p-2 text-xs font-bold text-gray-900"
                      >
                        <option value="">-- પ્રોડક્ટ પસંદ કરો --</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({p.unit})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="w-32">
                      <input
                        type="number"
                        step="0.001"
                        min="0.001"
                        required
                        placeholder="જથ્થો (Qty)"
                        value={line.quantity}
                        onChange={(e) =>
                          setLines((prev) =>
                            prev.map((l, i) => (i === idx ? { ...l, quantity: e.target.value } : l))
                          )
                        }
                        className="w-full rounded-lg border border-gray-300 p-2 text-xs font-mono font-bold text-gray-900 text-center"
                      />
                    </div>

                    <div className="w-36 text-right text-[11px] font-bold">
                      {line.available_stock !== undefined ? (
                        <span className={line.available_stock <= 0 ? "text-red-600" : "text-emerald-700"}>
                          સોર્સ સ્ટોક: {line.available_stock}
                        </span>
                      ) : (
                        <span className="text-gray-400">સ્ટોક ચકાસાય છે...</span>
                      )}
                    </div>

                    {lines.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeLine(idx)}
                        className="text-red-500 font-bold p-1 hover:text-red-700"
                        title="કાઢી નાખો"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-8 flex justify-end gap-3 pt-4 border-t border-gray-100">
              <Link
                href="/stock/transfers"
                className="rounded-xl border border-gray-300 px-5 py-2.5 text-xs font-bold text-gray-600 hover:bg-gray-50"
              >
                રદ કરો
              </Link>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-xl bg-emerald-700 px-7 py-2.5 text-xs font-black text-white hover:bg-emerald-800 shadow-md transition disabled:opacity-50"
              >
                {submitting ? "ટ્રાન્સફર થાય છે..." : "✓ ટ્રાન્સફર કન્ફર્મ કરો"}
              </button>
            </div>
          </form>
        </div>
      </main>
    </RoleGuard>
  );
}