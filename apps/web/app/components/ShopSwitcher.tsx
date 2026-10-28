"use client";

import React, { useEffect, useState } from "react";
import { authGet, authPost } from "@/lib/api";
import { useAuth } from "@/lib/auth";

interface Shop {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  is_default: boolean;
}

export default function ShopSwitcher() {
  const { hasRole } = useAuth();
  const isOwnerOrManager = hasRole("owner", "manager");

  const [shops, setShops] = useState<Shop[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  // નવી શાખા મોડલ સ્ટેટ્સ
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadShops = async () => {
    try {
      const res = await authGet<Shop[]>("/api/v1/business/shops");
      setShops(res || []);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      if (active) loadShops();
    }, 0);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, []);

  const handleSwitchShop = async (shop: Shop) => {
    if (shop.is_default) {
      setOpen(false);
      return;
    }
    setLoading(true);
    try {
      await authPost(`/api/v1/business/shops/${shop.id}/set-default`);
      setOpen(false);
      // પેજ રીલોડ કરો જેથી તમામ સ્ટોક અને બિલિંગ નવી બ્રાન્ચ સાથે સિંક થાય
      window.location.reload();
    } catch {
      alert("શાખા સ્વિચ કરવામાં સમસ્યા આવી.");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateShop = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await authPost("/api/v1/business/shops", {
        name: name.trim(),
        city: city.trim() || null,
        address: address.trim() || null,
        is_default: isDefault,
      });
      setModalOpen(false);
      setName("");
      setCity("");
      setAddress("");
      setIsDefault(false);
      await loadShops();
      if (isDefault) {
        window.location.reload();
      }
    } catch {
      alert("નવી શાખા ઉમેરવામાં ભૂલ આવી.");
    } finally {
      setSaving(false);
    }
  };

  const activeShop = shops.find((s) => s.is_default) || shops[0];

  return (
    <div className="relative">
      {/* Active Shop Dropdown Button */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        disabled={loading}
        className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-white px-3.5 py-2 text-xs font-bold text-emerald-950 shadow-sm hover:bg-emerald-50 transition"
      >
        <span className="text-sm">🏪</span>
        <div className="text-left">
          <p className="font-black leading-none">{activeShop?.name || "મુખ્ય દુકાન"}</p>
          <span className="text-[10px] text-emerald-700 font-semibold">
            {activeShop?.city ? `(${activeShop.city})` : "શાખા સ્વિચ કરો"}
          </span>
        </div>
        <span className="text-[10px] text-emerald-700 ml-1">▼</span>
      </button>

      {/* Dropdown Menu */}
      {open && (
        <div className="absolute left-0 mt-2 w-64 overflow-hidden rounded-2xl border border-emerald-200 bg-white p-2 shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-100">
          <div className="px-3 py-2 border-b border-gray-100">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
              તમારી શાખાઓ અને ગોડાઉન ({shops.length})
            </span>
          </div>

          <div className="max-h-60 overflow-y-auto py-1 space-y-1">
            {shops.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => handleSwitchShop(s)}
                className={`w-full flex items-center justify-between rounded-xl px-3 py-2 text-left text-xs transition ${
                  s.is_default
                    ? "bg-emerald-800 text-white font-black"
                    : "text-slate-800 hover:bg-emerald-50 font-bold"
                }`}
              >
                <div>
                  <p>{s.name}</p>
                  {s.city && (
                    <span className={`text-[10px] ${s.is_default ? "text-emerald-200" : "text-slate-400"}`}>
                      📍 {s.city}
                    </span>
                  )}
                </div>
                {s.is_default && <span className="text-sm font-black">✓</span>}
              </button>
            ))}
          </div>

          {/* Add Branch Button (Only for Owner / Manager) */}
          {isOwnerOrManager && (
            <div className="pt-2 border-t border-gray-100 mt-1">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setModalOpen(true);
                }}
                className="w-full rounded-xl bg-emerald-50 p-2 text-center text-xs font-black text-emerald-800 hover:bg-emerald-100 transition"
              >
                + નવી બ્રાન્ચ / ગોડાઉન ઉમેરો
              </button>
            </div>
          )}
        </div>
      )}

      {/* Add Shop Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <form
            onSubmit={handleCreateShop}
            className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl border-2 border-emerald-700"
          >
            <h3 className="text-lg font-black text-emerald-950">🏪 નવી શાખા કે ગોડાઉન ઉમેરો</h3>
            <p className="text-xs text-slate-500 mt-0.5">બીજી દુકાન, શાખા કે ગોડાઉનની વિગત દાખલ કરો</p>

            <label className="mt-4 block text-xs font-bold text-gray-700 uppercase tracking-wider">
              શાખાનું નામ *
            </label>
            <input
              required
              placeholder="દા.ત. ગોડાઉન નં. ૧, બ્રાન્ચ ૨"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-xl border border-gray-300 p-2.5 text-xs font-bold text-gray-900 focus:ring-2 focus:ring-emerald-500"
            />

            <label className="mt-3 block text-xs font-bold text-gray-700 uppercase tracking-wider">
              શહેર (City)
            </label>
            <input
              placeholder="દા.ત. સુરત, અમદાવાદ, રાજકોટ"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="mt-1 w-full rounded-xl border border-gray-300 p-2.5 text-xs text-gray-900 focus:ring-2 focus:ring-emerald-500"
            />

            <label className="mt-3 block text-xs font-bold text-gray-700 uppercase tracking-wider">
              સરનામું (Address - Optional)
            </label>
            <input
              placeholder="વિસ્તાર અથવા માર્કેટનું નામ"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="mt-1 w-full rounded-xl border border-gray-300 p-2.5 text-xs text-gray-900 focus:ring-2 focus:ring-emerald-500"
            />

            <div className="mt-4 flex items-center gap-2">
              <input
                type="checkbox"
                id="defaultCheck"
                checked={isDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
                className="h-4 w-4 rounded text-emerald-600 focus:ring-emerald-500"
              />
              <label htmlFor="defaultCheck" className="text-xs font-bold text-gray-700 cursor-pointer">
                આ શાખાને અત્યારે જ ડિફોલ્ટ (સક્રિય) બનાવો
              </label>
            </div>

            <div className="mt-6 flex justify-end gap-2.5 pt-3 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-xl border border-gray-300 px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-50 transition"
              >
                રદ કરો
              </button>
              <button
                type="submit"
                disabled={saving || !name.trim()}
                className="rounded-xl bg-emerald-700 px-5 py-2 text-xs font-black text-white hover:bg-emerald-800 disabled:opacity-50 shadow transition"
              >
                {saving ? "સેવ થાય છે..." : "સેવ કરો ✓"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}