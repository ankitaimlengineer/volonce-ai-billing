"use client";

import { useEffect, useState } from "react";
import { authGet, authPost } from "@/lib/api";

interface PlatformStats {
  total_organizations: number;
  active_subscriptions: number;
  trial_subscriptions: number;
  expired_subscriptions: number;
  total_revenue: string;
  total_invoices_created: number;
  total_ai_scans: number;
  total_whatsapp_messages: number;
}

interface AdminBusiness {
  id: string;
  name: string;
  owner_name: string | null;
  email: string | null;
  mobile: string | null;
  city: string | null;
  created_at: string;
  setup_completed: boolean;
  plan_name: string;
  plan_slug: string;
  subscription_status: string;
  expires_at: string | null;
  days_left: number;
  total_invoices: number;
}

interface AdminData {
  stats: PlatformStats;
  businesses: AdminBusiness[];
}

export default function AdminDashboardPage() {
  const [data, setData] = useState<AdminData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [reload, setReload] = useState(0);

  // મેન્યુઅલ સબસ્ક્રિપ્શન મોડલ સ્ટેટ્સ
  const [selectedOrg, setSelectedOrg] = useState<AdminBusiness | null>(null);
  const [extendPlan, setExtendPlan] = useState("yearly");
  const [extendDays, setExtendDays] = useState(30);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadAdminData() {
      try {
        const res = await authGet<AdminData>("/api/v1/admin/overview");
        if (!cancelled) {
          setData(res);
          setError("");
        }
      } catch (err: unknown) {
        if (!cancelled) {
          const msg =
            err instanceof Error
              ? err.message
              : "સુપર એડમિન ડેટા લોડ કરવામાં સમસ્યા આવી.";
          setError(msg);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadAdminData();

    return () => {
      cancelled = true;
    };
  }, [reload]);

  const handleExtend = async () => {
    if (!selectedOrg) return;
    setSaving(true);
    try {
      await authPost(
        `/api/v1/admin/businesses/${selectedOrg.id}/extend-subscription`,
        {
          plan_slug: extendPlan,
          extend_days: Number(extendDays),
        }
      );
      alert(`✓ ${selectedOrg.name} ની મુદત સફળતાપૂર્વક લંબાવી દેવામાં આવી છે!`);
      setSelectedOrg(null);
      setReload((prev) => prev + 1);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "અજ્ઞાત ભૂલ આવી";
      alert("ભૂલ: " + msg);
    } finally {
      setSaving(false);
    }
  };

  const filtered = (data?.businesses || []).filter(
    (b) =>
      b.name.toLowerCase().includes(search.toLowerCase()) ||
      (b.owner_name &&
        b.owner_name.toLowerCase().includes(search.toLowerCase())) ||
      (b.email && b.email.toLowerCase().includes(search.toLowerCase())) ||
      (b.mobile && b.mobile.includes(search))
  );

  if (loading) {
    return (
      <div className="py-24 text-center text-emerald-800 font-bold text-sm animate-pulse">
        🛡️ સુપર એડમિન મેટ્રિક્સ લોડ થઈ રહ્યા છે...
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl bg-red-50 p-6 border border-red-200 text-center shadow-sm">
        <p className="text-red-700 font-bold mb-3">⚠️ {error}</p>
        <p className="text-xs text-slate-500">
          તમારું એકાઉન્ટ `super_admin` રોલ ધરાવે છે કે નહીં તે ચકાસો.
        </p>
      </div>
    );
  }

  const s = data?.stats;

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      {/* 1. Global Metrics Cards - Matching Main App Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Stores Card */}
        <div className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm border-l-4 border-l-emerald-600">
          <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">
            કુલ દુકાનો (Stores)
          </span>
          <p className="text-3xl font-black text-emerald-950 mt-1 font-mono">
            {s?.total_organizations ?? 0}
          </p>
          <span className="text-[11px] text-emerald-700 font-bold mt-1 inline-block">
            {s?.active_subscriptions ?? 0} પેઇડ • {s?.trial_subscriptions ?? 0} ફ્રી ટ્રાયલ
          </span>
        </div>

        {/* Revenue Card */}
        <div className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm border-l-4 border-l-teal-600">
          <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">
            કુલ આવક (Revenue)
          </span>
          <p className="text-3xl font-black text-emerald-800 mt-1 font-mono">
            ₹{Number(s?.total_revenue || 0).toLocaleString("en-IN")}
          </p>
          <span className="text-[11px] text-slate-500 font-medium mt-1 inline-block">
            સબસ્ક્રિપ્શન ફી પેમેન્ટ્સ
          </span>
        </div>

        {/* Invoices Card */}
        <div className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm border-l-4 border-l-blue-600">
          <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">
            કુલ બિલિંગ (Invoices)
          </span>
          <p className="text-3xl font-black text-blue-900 mt-1 font-mono">
            {s?.total_invoices_created ?? 0}
          </p>
          <span className="text-[11px] text-slate-500 font-medium mt-1 inline-block">
            તમામ દુકાનો દ્વારા જનરેટ
          </span>
        </div>

        {/* AI Scans & WhatsApp */}
        <div className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm border-l-4 border-l-amber-600">
          <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">
            AI Scans & WhatsApp
          </span>
          <p className="text-2xl font-black text-amber-700 mt-1 font-mono">
            📸 {s?.total_ai_scans ?? 0}{" "}
            <span className="text-xs text-slate-400 font-semibold">
              / 💬 {s?.total_whatsapp_messages ?? 0}
            </span>
          </p>
          <span className="text-[11px] text-slate-500 font-medium mt-1 inline-block">
            પ્લેટફોર્મ API વપરાશ
          </span>
        </div>
      </div>

      {/* 2. Businesses List & Management - Clean White Box with Emerald Header */}
      <div className="rounded-2xl border border-emerald-200/80 bg-white p-6 shadow-md">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-5 border-b border-emerald-100 pb-4">
          <div>
            <h2 className="text-xl font-black text-emerald-950">
              દુકાનો અને સબસ્ક્રિપ્શન કન્ટ્રોલ
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              પ્લેટફોર્મ પર જોડાયેલા તમામ વેપારીઓની યાદી અને સક્રિય પ્લાન
            </p>
          </div>
          <input
            type="text"
            placeholder="દુકાન, માલિક, ઈમેલ કે મોબાઈલથી શોધો..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full md:w-80 rounded-xl border border-emerald-200 bg-emerald-50/40 px-3.5 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-emerald-800 text-white font-extrabold uppercase tracking-wider">
                <th className="py-3.5 px-3.5 rounded-l-lg">દુકાનનું નામ</th>
                <th className="py-3.5 px-3">માલિક / સંપર્ક</th>
                <th className="py-3.5 px-3">પ્લાન</th>
                <th className="py-3.5 px-3">મુદત (બાકી દિવસ)</th>
                <th className="py-3.5 px-3 text-center">બિલો</th>
                <th className="py-3.5 px-3.5 text-right rounded-r-lg">ક્રિયા (Action)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-emerald-100 font-medium">
              {filtered.map((b) => (
                <tr key={b.id} className="hover:bg-emerald-50/40 transition">
                  <td className="py-3.5 px-3.5">
                    <p className="font-bold text-emerald-950 text-sm">{b.name}</p>
                    <span className="text-[11px] text-slate-400">
                      {b.city || "શહેર દર્શાવેલ નથી"}
                    </span>
                  </td>

                  <td className="py-3.5 px-3">
                    <p className="text-slate-800 font-bold">{b.owner_name || "-"}</p>
                    <p className="text-slate-500 text-[11px]">
                      {b.mobile ? `+91 ${b.mobile}` : b.email}
                    </p>
                  </td>

                  <td className="py-3.5 px-3">
                    <span
                      className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${
                        b.subscription_status === "active"
                          ? b.plan_slug === "free_trial"
                            ? "bg-amber-100 text-amber-900 border border-amber-300"
                            : "bg-emerald-100 text-emerald-800 border border-emerald-300"
                          : "bg-red-100 text-red-800 border border-red-300"
                      }`}
                    >
                      {b.plan_name}
                    </span>
                  </td>

                  <td className="py-3.5 px-3">
                    <span
                      className={`font-mono font-bold ${
                        b.days_left <= 2 ? "text-red-600 font-black" : "text-emerald-900"
                      }`}
                    >
                      {b.days_left} દિવસ
                    </span>
                    <p className="text-[10px] text-slate-400">
                      {b.expires_at
                        ? new Date(b.expires_at).toLocaleDateString("en-IN")
                        : "-"}
                    </p>
                  </td>

                  <td className="py-3.5 px-3 text-center font-black text-emerald-950 font-mono text-sm">
                    {b.total_invoices}
                  </td>

                  <td className="py-3.5 px-3.5 text-right">
                    <button
                      type="button"
                      onClick={() => setSelectedOrg(b)}
                      className="rounded-xl bg-emerald-700 hover:bg-emerald-800 px-3.5 py-1.5 text-xs font-bold text-white shadow-sm transition"
                    >
                      ⚡ મુદત લંબાવો (Extend)
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 3. Manual Subscription Modal - Emerald Theme */}
      {selectedOrg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border-2 border-emerald-700 bg-white p-6 shadow-2xl">
            <h3 className="text-xl font-black text-emerald-950">
              ⚡ સબસ્ક્રિપ્શન પ્લાન ફાળવો
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              દુકાન:{" "}
              <span className="font-bold text-emerald-800 text-sm">
                {selectedOrg.name}
              </span>
            </p>

            <div className="mt-5 space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  પ્લાન પસંદ કરો:
                </label>
                <select
                  value={extendPlan}
                  onChange={(e) => setExtendPlan(e.target.value)}
                  className="w-full rounded-xl border border-emerald-200 bg-emerald-50/30 p-2.5 text-xs text-slate-900 font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="monthly">🟢 Monthly Plan (30 દિવસ)</option>
                  <option value="quarterly">🔵 Quarterly Plan (90 દિવસ)</option>
                  <option value="half_yearly">
                    🟣 Half-Yearly Plan (180 દિવસ)
                  </option>
                  <option value="yearly">🟡 Yearly Plan (365 દિવસ)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  કેટલા દિવસ વધારવા છે?
                </label>
                <input
                  type="number"
                  min="1"
                  value={extendDays}
                  onChange={(e) => setExtendDays(Number(e.target.value))}
                  className="w-full rounded-xl border border-emerald-200 bg-emerald-50/30 p-2.5 text-xs text-slate-900 font-mono font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3 pt-3 border-t border-emerald-100">
              <button
                type="button"
                onClick={() => setSelectedOrg(null)}
                className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 transition"
              >
                રદ કરો
              </button>
              <button
                type="button"
                onClick={handleExtend}
                disabled={saving}
                className="rounded-xl bg-emerald-700 hover:bg-emerald-800 px-5 py-2 text-xs font-black text-white shadow-md transition disabled:opacity-50"
              >
                {saving ? "સેવ થાય છે..." : "✓ મુદત લંબાવો"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}