"use client";

import Link from "next/link";
import Script from "next/script";
import { useEffect, useState } from "react";
import { authGet, authPost } from "@/lib/api";
import RoleGuard from "@/app/components/RoleGuard";
import LanguageSwitcher from "@/app/components/LanguageSwitcher";

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

interface RazorpayOrderResponse {
  order_id: string;
  amount: number;
  currency: string;
  key_id: string;
  plan_slug: string;
  plan_name: string;
}

interface RazorpayPaymentSuccessResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

interface RazorpayOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  handler: (response: RazorpayPaymentSuccessResponse) => Promise<void> | void;
  prefill?: {
    name?: string;
    email?: string;
    contact?: string;
  };
  theme?: {
    color?: string;
  };
}

interface RazorpayInstance {
  open: () => void;
}

type RazorpayConstructor = new (options: RazorpayOptions) => RazorpayInstance;

declare global {
  interface Window {
    Razorpay?: RazorpayConstructor;
  }
}

export default function SubscriptionPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subStatus, setSubStatus] = useState<SubscriptionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [activating, setActivating] = useState<string | null>(null);

  // કૂપન / વાઉચર કોડ સ્ટેટ્સ
  const [promoCode, setPromoCode] = useState("");
  const [redeeming, setRedeeming] = useState(false);
  const [promoResult, setPromoResult] = useState<{ text: string; success: boolean } | null>(null);

  // સબસ્ક્રિપ્શન પ્લાન અને સ્ટેટસ લોડ કરો
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

  // Razorpay પેમેન્ટ સિસ્ટમ
  const handleSubscribeWithRazorpay = async (plan: Plan) => {
    setActivating(plan.slug);
    try {
      // 1. Backend માંથી Razorpay Order બનાવો
      const order = await authPost<RazorpayOrderResponse>(
        `/api/v1/subscription/create-order/${plan.slug}`
      );

      // 2. Razorpay પોપ-અપ ઓપ્શન્સ સેટ કરો
      const options: RazorpayOptions = {
        key: order.key_id,
        amount: order.amount,
        currency: order.currency,
        name: "VOLONCE AI BILLING",
        description: `${plan.name} (${plan.duration_days} દિવસનું સબસ્ક્રિપ્શન)`,
        order_id: order.order_id,
        handler: async function (response: RazorpayPaymentSuccessResponse) {
          try {
            // 3. પેમેન્ટ સક્સેસ થાય એટલે Backend માં વેરિફાય કરાવો
            const res = await authPost<{ success: boolean; message: string }>(
              "/api/v1/subscription/verify-payment",
              {
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                plan_slug: plan.slug,
              }
            );
            alert(res.message);
            setReload((n) => n + 1);
          } catch {
            alert("પેમેન્ટ વેરિફિકેશન નિષ્ફળ ગયું.");
          }
        },
        theme: {
          color: "#047857",
        },
      };

      if (window.Razorpay) {
        const rzp = new window.Razorpay(options);
        rzp.open();
      } else {
        alert("Razorpay SDK લોડ થઈ શક્યું નથી. પેજ રિફ્રેશ કરો.");
      }
    } catch {
      alert("ઓર્ડર બનાવવામાં સમસ્યા આવી. ફરી પ્રયાસ કરો.");
    } finally {
      setActivating(null);
    }
  };

  // વાઉચર / કૂપન કોડ રિડીમ કરો
  const handleRedeemCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!promoCode.trim()) return;
    setRedeeming(true);
    setPromoResult(null);
    try {
      const res = await authPost<{ success: boolean; message: string }>(
        "/api/v1/subscription/redeem-code",
        { code: promoCode.trim() }
      );
      setPromoResult({ text: res.message, success: true });
      setPromoCode("");
      setReload((n) => n + 1);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "અમાન્ય કૂપન કોડ";
      setPromoResult({ text: msg, success: false });
    } finally {
      setRedeeming(false);
    }
  };

  return (
    // 🛡️ ફક્ત Owner અને Super Admin માટે જ સબસ્ક્રિપ્શન પેજ ઉપલબ્ધ રહેશે
    <RoleGuard allowedRoles={["owner"]}>
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload" />

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
            <div className="flex items-center gap-3">
              <LanguageSwitcher />
              <Link
                href="/dashboard"
                className="rounded-xl border border-emerald-700 bg-white px-5 py-2.5 text-xs md:text-sm font-bold text-emerald-800 shadow-sm hover:bg-emerald-50 transition"
              >
                ← Dashboard
              </Link>
            </div>
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
                  className={`mb-8 rounded-2xl p-6 shadow-md border-2 ${
                    subStatus.is_active && subStatus.days_left > 0
                      ? "bg-gradient-to-r from-emerald-800 to-teal-900 text-white border-emerald-700"
                      : "bg-red-50 text-red-950 border-red-500 shadow-red-100"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <span
                        className={`text-xs font-black uppercase tracking-wider px-3.5 py-1.5 rounded-full inline-block shadow-sm ${
                          subStatus.is_active && subStatus.days_left > 0
                            ? "text-emerald-100 bg-white/20"
                            : "bg-red-600 text-white font-bold"
                        }`}
                      >
                        {subStatus.is_active && subStatus.days_left > 0
                          ? subStatus.is_trial
                            ? "✓ Free Trial સક્રિય છે"
                            : "✓ સક્રિય સબસ્ક્રિપ્શન (ACTIVE)"
                          : "⚠️ પ્લાન સમાપ્ત થયેલ છે (EXPIRED)"}
                      </span>
                      <h2
                        className={`text-2xl font-black mt-2.5 ${
                          subStatus.is_active && subStatus.days_left > 0
                            ? "text-white"
                            : "text-red-900"
                        }`}
                      >
                        {subStatus.plan_name}
                      </h2>
                      <p
                        className={`text-xs mt-1 font-semibold ${
                          subStatus.is_active && subStatus.days_left > 0
                            ? "text-emerald-100"
                            : "text-red-700"
                        }`}
                      >
                        મુદત: {new Date(subStatus.expires_at).toLocaleDateString("en-IN")} સુધી માન્ય
                      </p>
                    </div>

                    <div className="text-right">
                      <span
                        className={`text-xs uppercase font-extrabold block ${
                          subStatus.is_active && subStatus.days_left > 0
                            ? "text-emerald-200"
                            : "text-red-600"
                        }`}
                      >
                        બાકી સમય:
                      </span>
                      <p
                        className={`text-3xl font-black font-mono ${
                          subStatus.is_active && subStatus.days_left > 0
                            ? "text-white"
                            : "text-red-700"
                        }`}
                      >
                        {subStatus.days_left} <span className="text-base font-bold">દિવસ બાકી</span>
                      </p>
                      {subStatus.days_left <= 2 && (
                        <span className="text-xs font-black text-red-700 bg-red-100 border border-red-300 px-2.5 py-1 rounded-md block mt-1.5 shadow-sm">
                          ⚠️ વહેલી તકે નવો પ્લાન ખરીદો / રીન્યુ કરો
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* 🏷️ વાઉચર / કૂપન કોડ રિડીમ બોક્સ (Redeem Promo Code Box) */}
              <div className="mb-8 rounded-2xl bg-white p-5 border border-emerald-200 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h3 className="text-sm font-black text-emerald-950">
                      🏷️ વાઉચર અથવા લાઈસન્સ કોડ છે? (Redeem Coupon)
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      જો તમે volonis.in પરથી વાઉચર લીધું હોય તો અહીં કોડ નાખીને પ્લાન ચાલુ કરો
                    </p>
                  </div>

                  <form onSubmit={handleRedeemCode} className="flex gap-2 w-full md:w-auto">
                    <input
                      type="text"
                      placeholder="દા.ત. YEARLY2026, VOLONIS-365"
                      value={promoCode}
                      onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                      className="rounded-xl border border-emerald-300 bg-emerald-50/30 px-3.5 py-2 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <button
                      type="submit"
                      disabled={redeeming || !promoCode.trim()}
                      className="rounded-xl bg-emerald-800 px-5 py-2 text-xs font-black text-white hover:bg-emerald-900 disabled:opacity-50 shadow transition"
                    >
                      {redeeming ? "ચકાસાય છે..." : "રિડીમ કરો ✓"}
                    </button>
                  </form>
                </div>

                {promoResult && (
                  <p
                    className={`mt-3 text-xs font-bold p-2.5 rounded-lg border ${
                      promoResult.success
                        ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                        : "bg-red-50 text-red-700 border-red-200"
                    }`}
                  >
                    {promoResult.text}
                  </p>
                )}
              </div>

              {/* Feature Highlights */}
              <div className="mb-8 rounded-xl bg-white p-4 border border-emerald-100 shadow-sm text-center">
                <p className="text-xs md:text-sm font-extrabold text-emerald-900">
                  ✨ સુરક્ષિત Razorpay UPI, GPay, PhonePe, Paytm, ડેબિટ/ક્રેડિટ કાર્ડ દ્વારા ત્વરિત સક્રિયકરણ
                </p>
              </div>

              {/* Pricing Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {plans.map((p) => {
                  const isYearly = p.slug === "yearly";
                  const isCurrent =
                    subStatus?.plan_slug === p.slug &&
                    subStatus?.is_active &&
                    (subStatus?.days_left ?? 0) > 0;

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
                        onClick={() => handleSubscribeWithRazorpay(p)}
                        disabled={activating === p.slug}
                        className={`mt-6 w-full rounded-xl py-3 text-xs md:text-sm font-extrabold shadow-md transition flex items-center justify-center gap-2 ${
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
                          ? "Razorpay ખુલી રહ્યું છે..."
                          : `💳 પસંદ કરો (₹${Number(p.price).toFixed(0)})`}
                      </button>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </main>
    </RoleGuard>
  );
}