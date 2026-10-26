"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { authGet, authPost } from "@/lib/api";

interface Plan {
  id: string;
  name: string;
  slug: string;
  price: string;
  duration_days: number;
  description: string;
}

interface SubscriptionStatus {
  is_active: boolean;
  is_trial: boolean;
  plan_name: string;
  plan_slug: string;
  starts_at: string;
  expires_at: string;
  days_left: number;
  status: string;
}

export default function SubscriptionPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subStatus, setSubStatus] = useState<SubscriptionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [activating, setActivating] = useState<string | null>(null);

  // Next.js 16 & React 19 Safe Async Data Loader
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [plansRes, statusRes] = await Promise.all([
          authGet<Plan[]>("/api/v1/subscription/plans"),
          authGet<SubscriptionStatus>("/api/v1/subscription/status"),
        ]);
        if (!cancelled) {
          setPlans(plansRes.filter((p) => p.slug !== "free_trial"));
          setSubStatus(statusRes);
        }
      } catch (error) {
        console.error("Subscription load error:", error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [reload]);

  const handleSubscribe = async (planSlug: string) => {
    setActivating(planSlug);
    try {
      const res = await authPost<{ success: boolean; message: string }>(
        `/api/v1/subscription/activate-plan/${planSlug}`
      );
      alert(res.message);
      setReload((n) => n + 1); // Auto reload subscription data
    } catch {
      alert("પ્લાન ખરીદવામાં સમસ્યા આવી. ફરી પ્રયાસ કરો.");
    } finally {
      setActivating(null);
    }
  };

  return (
    <main className="min-h-screen bg-emerald-50/50 p-4 md:p-8">
      <div className="mx-auto max-w-6xl">
        {/* Top Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-emerald-200 pb-5 mb-8">
          <div>
            <h1 className="text-2xl md:text-3xl font-black text-emerald-950">
              💎 સબસ્ક્રિપ્શન અને પ્લાન્સ (Pricing Plans)
            </h1>
            <p className="text-xs md:text-sm text-gray-500 mt-1">
              VOLONCE AI BILLING ની તમામ સુવિધાઓ અનલિમિટેડ વાપરો
            </p>
          </div>
          <Link
            href="/dashboard"
            className="rounded-xl border border-emerald-700 bg-white px-5 py-2.5 text-xs md:text-sm font-bold text-emerald-800 shadow-sm hover:bg-emerald-50 transition"
          >
            ← Dashboard પર પાછા જાઓ
          </Link>
        </div>

        {/* Loading Spinner */}
        {loading ? (
          <div className="py-20 text-center text-emerald-800 font-bold animate-pulse text-base">
            💎 સબસ્ક્રિપ્શન પ્લાન લોડ થઈ રહ્યા છે... કૃપા કરીને થોડીવાર રાહ જુઓ.
          </div>
        ) : (
          <>
            {/* Current Active Plan Status Banner */}
            {subStatus && (
              <div
                className={`mb-10 rounded-2xl p-6 shadow-md border-2 ${
                  subStatus.is_active
                    ? "bg-gradient-to-r from-emerald-800 to-teal-900 text-white border-emerald-700"
                    : "bg-red-50 text-red-900 border-red-300"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <span className="text-xs font-black uppercase tracking-wider text-emerald-200 bg-white/20 px-3 py-1 rounded-full">
                      {subStatus.is_trial ? "Free Trial સક્રિય છે" : "Active Subscription"}
                    </span>
                    <h2 className="text-2xl font-black mt-2">{subStatus.plan_name}</h2>
                    <p className="text-xs text-emerald-100 mt-0.5">
                      મુદત: {new Date(subStatus.expires_at).toLocaleDateString("en-IN")} સુધી માન્ય
                    </p>
                  </div>

                  <div className="text-right">
                    <span className="text-xs uppercase font-bold text-emerald-200 block">બાકી સમય:</span>
                    <p className="text-3xl font-black font-mono">
                      {subStatus.days_left} <span className="text-base font-medium">દિવસ બાકી</span>
                    </p>
                    {subStatus.days_left <= 2 && (
                      <span className="text-[11px] font-bold text-amber-300 block mt-1">
                        ⚠️ વહેલી તકે પ્લાન રીન્યુ કરો
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Feature Highlights */}
            <div className="mb-8 rounded-xl bg-white p-5 border border-emerald-200 shadow-sm text-center">
              <p className="text-xs md:text-sm font-extrabold text-emerald-900">
                ✨ દરેક પ્લાનમાં તમામ સુવિધાઓ ઉપલબ્ધ: AI કેમેરા સ્કેનર • ગ્રાહક Face Recognition • GST બિલિંગ • WhatsApp શેરિંગ • સ્ટોક મેનેજમેન્ટ
              </p>
            </div>

            {/* Pricing Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {plans.map((p) => {
                const isYearly = p.slug === "yearly";
                const isCurrent = subStatus?.plan_slug === p.slug && subStatus?.is_active;

                return (
                  <div
                    key={p.id}
                    className={`flex flex-col justify-between rounded-2xl bg-white p-6 shadow-lg border-2 transition relative ${
                      isYearly
                        ? "border-emerald-600 ring-2 ring-emerald-500/30 scale-105"
                        : "border-gray-200 hover:border-emerald-400"
                    }`}
                  >
                    {isYearly && (
                      <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-amber-500 to-amber-600 px-3 py-0.5 text-[10px] font-black uppercase tracking-wider text-white shadow">
                        🔥 સૌથી વધુ બચત (Best Value)
                      </span>
                    )}

                    <div>
                      <h3 className="text-lg font-black text-gray-900">{p.name}</h3>
                      <p className="text-xs text-gray-500 mt-1 min-h-[32px]">{p.description}</p>

                      <div className="my-5 border-y border-gray-100 py-4">
                        <span className="text-3xl font-black text-emerald-900 font-mono">
                          ₹{Number(p.price).toFixed(0)}
                        </span>
                        <span className="text-xs text-gray-500 font-bold ml-1">
                          / {p.duration_days} દિવસ
                        </span>
                      </div>

                      <ul className="space-y-2.5 text-xs text-gray-700 font-medium">
                        <li className="flex items-center gap-2">✓ અનલિમિટેડ બિલો</li>
                        <li className="flex items-center gap-2">✓ સ્માર્ટ AI કાઉન્ટર POS</li>
                        <li className="flex items-center gap-2">✓ ગ્રાહક ચહેરો સ્કેનર</li>
                        <li className="flex items-center gap-2">✓ લાઈવ UPI QR અને WhatsApp</li>
                        <li className="flex items-center gap-2">✓ સ્ટોક અને ઉધાર ખાતાવહી</li>
                      </ul>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleSubscribe(p.slug)}
                      disabled={activating === p.slug}
                      className={`mt-6 w-full rounded-xl py-3 text-xs md:text-sm font-extrabold shadow-md transition ${
                        isCurrent
                          ? "bg-gray-100 text-gray-400 cursor-not-allowed border"
                          : isYearly
                          ? "bg-emerald-700 text-white hover:bg-emerald-800"
                          : "bg-slate-900 text-white hover:bg-slate-800"
                      }`}
                    >
                      {isCurrent
                        ? "✓ તમારો વર્તમાન પ્લાન"
                        : activating === p.slug
                        ? "ચાલુ થઈ રહ્યું છે..."
                        : `પસંદ કરો (₹${Number(p.price).toFixed(0)})`}
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </main>
  );
}