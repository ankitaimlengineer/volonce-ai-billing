"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { ApiError, authDownload, authGet, authPost, clearTokens } from "@/lib/api";

type Row = {
  id: string;
  created_at: string;
  entry_type: string;
  debit: string;
  credit: string;
  balance: string;
  note: string | null;
};

type Ledger = { opening_balance: string; outstanding: string; items: Row[] };

type CustomerInfo = {
  id: string;
  name: string;
  mobile: string | null;
  address: string | null;
};

const input =
  "mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500";

function LedgerView() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [data, setData] = useState<Ledger | null>(null);
  const [customer, setCustomer] = useState<CustomerInfo | null>(null);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);

  // પેમેન્ટ મોડલ સ્ટેટ્સ
  const [paying, setPaying] = useState(false);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const keyRef = useRef("");

  // WhatsApp એક્શન સ્ટેટ્સ
  const [sendingStatement, setSendingStatement] = useState(false);
  const [sendingReminder, setSendingReminder] = useState(false);

  const onAuthError = useCallback(() => {
    clearTokens();
    router.replace("/login");
  }, [router]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [ledgerRes, custRes] = await Promise.all([
          authGet<Ledger>(`/api/v1/customers/${id}/ledger`),
          authGet<CustomerInfo>(`/api/v1/customers/${id}`),
        ]);
        if (!cancelled) {
          setData(ledgerRes);
          setCustomer(custRes);
          setError("");
        }
      } catch (err: unknown) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) return onAuthError();
        const msg = err instanceof Error ? err.message : "ખાતાવહી લોડ થઈ શકી નથી.";
        setError(msg);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [id, reload, onAuthError]);

  function openPay() {
    keyRef.current = crypto.randomUUID();
    setAmount("");
    setNote("");
    setFormError("");
    setPaying(true);
  }

  async function pay(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setFormError("");
    setSaving(true);
    try {
      await authPost(
        `/api/v1/customers/${id}/payments`,
        { amount, payment_method: method, note: note || null },
        { "Idempotency-Key": keyRef.current }
      );
      setPaying(false);
      setReload((n) => n + 1);
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 401) return onAuthError();
      const msg = err instanceof Error ? err.message : "પેમેન્ટ નોંધવામાં સમસ્યા આવી.";
      setFormError(msg);
    } finally {
      setSaving(false);
    }
  }

  // ૧. ખાતાવહી સ્ટેટમેન્ટ PDF ડાઉનલોડ
  const handleDownloadPdf = async () => {
    try {
      const fileName = `Statement-${(customer?.name || "Customer").replace(/\s+/g, "_")}.pdf`;
      await authDownload(`/api/v1/whatsapp/customers/${id}/download-ledger-pdf`, fileName);
    } catch {
      alert("PDF ડાઉનલોડ કરવામાં સમસ્યા આવી.");
    }
  };

  // ૨. ખાતાવહી સ્ટેટમેન્ટ WhatsApp પર મોકલો
  const handleSendStatementWhatsApp = async () => {
    setSendingStatement(true);
    try {
      const res = await authPost<{ success: boolean; message: string; fallback_url?: string }>(
        `/api/v1/whatsapp/customers/${id}/send-statement`
      );
      if (res.fallback_url) {
        window.open(res.fallback_url, "_blank");
      } else {
        alert("✓ " + res.message);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "સ્ટેટમેન્ટ મોકલી શકાયું નથી.";
      alert("ભૂલ: " + msg);
    } finally {
      setSendingStatement(false);
    }
  };

  // ૩. ઉધારી પેમેન્ટ રીમાઇન્ડર મોકલો
  const handleSendReminder = async () => {
    if (!customer) return;
    if (
      !confirm(
        `${customer.name} ને બાકી રકમ (₹${data?.outstanding}) ચૂકવવા માટે WhatsApp રીમાઇન્ડર મોકલવું છે?`
      )
    )
      return;

    setSendingReminder(true);
    try {
      const res = await authPost<{ success: boolean; message: string; fallback_url?: string }>(
        `/api/v1/whatsapp/customers/${id}/send-reminder`
      );
      if (res.fallback_url) {
        window.open(res.fallback_url, "_blank");
      } else {
        alert("✓ " + res.message);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "રીમાઇન્ડર મોકલી શકાયું નથી.";
      alert("ભૂલ: " + msg);
    } finally {
      setSendingReminder(false);
    }
  };

  const dueVal = Number(data?.outstanding || 0);

  return (
    <main className="min-h-screen bg-emerald-50/50 p-4 md:p-8">
      <div className="mx-auto max-w-4xl rounded-2xl bg-white p-6 shadow-md border border-emerald-100">
        {/* Top Header Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-emerald-100 pb-5">
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-emerald-800 bg-emerald-100 px-2.5 py-0.5 rounded-full">
              Customer Khata • ગ્રાહક ખાતાવહી
            </span>
            <h1 className="text-2xl font-black text-emerald-950 mt-1">
              {customer?.name || "ગ્રાહક ખાતાવહી"}
            </h1>
            {customer?.mobile && (
              <p className="text-xs text-slate-500 font-semibold mt-0.5">
                📞 +91 {customer.mobile}
              </p>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/customers"
              className="rounded-xl border border-gray-300 bg-white px-3.5 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50 transition"
            >
              ← ગ્રાહકો
            </Link>

            {/* ૧. PDF ડાઉનલોડ બટન */}
            <button
              type="button"
              onClick={handleDownloadPdf}
              className="rounded-xl border-2 border-emerald-700 bg-white px-3.5 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-50 shadow-sm transition"
            >
              📥 સ્ટેટમેન્ટ PDF
            </button>

            {/* ૨. WhatsApp સ્ટેટમેન્ટ બટન */}
            <button
              type="button"
              onClick={handleSendStatementWhatsApp}
              disabled={sendingStatement}
              className="rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-700 shadow transition disabled:opacity-50"
            >
              {sendingStatement ? "મોકલાય છે..." : "💬 WhatsApp સ્ટેટમેન્ટ"}
            </button>

            {/* ૩. પેમેન્ટ રીમાઇન્ડર બટન (જો ઉધારી બાકી હોય તો જ) */}
            {dueVal > 0 && (
              <button
                type="button"
                onClick={handleSendReminder}
                disabled={sendingReminder}
                className="rounded-xl bg-amber-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-amber-700 shadow transition disabled:opacity-50"
              >
                {sendingReminder ? "મોકલાય છે..." : "🔔 રીમાઇન્ડર મોકલો"}
              </button>
            )}

            {/* ૪. જમા પેમેન્ટ બટન */}
            <button
              type="button"
              onClick={openPay}
              className="rounded-xl bg-emerald-800 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-900 shadow transition"
            >
              + જમા પેમેન્ટ (Receive)
            </button>
          </div>
        </div>

        {error && (
          <p className="mt-4 rounded-xl bg-red-50 p-3.5 text-sm font-bold text-red-700 border border-red-200">
            ⚠️ {error}
          </p>
        )}

        {data && (
          <>
            {/* Balance Summary Cards */}
            <div className="mt-5 grid grid-cols-2 gap-4">
              <div className="rounded-2xl border border-emerald-100 bg-slate-50/70 p-4">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  શરૂઆતનું બેલેન્સ (Opening)
                </p>
                <p className="text-xl font-bold font-mono mt-1 text-slate-800">
                  ₹{Number(data.opening_balance || 0).toFixed(2)}
                </p>
              </div>

              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
                <p className="text-xs font-bold text-emerald-800 uppercase tracking-wider">
                  કુલ લેવાના બાકી (Outstanding Due)
                </p>
                <p
                  className={`text-2xl font-black font-mono mt-1 ${
                    dueVal > 0 ? "text-red-600" : "text-emerald-800"
                  }`}
                >
                  ₹{Number(data.outstanding || 0).toFixed(2)}
                </p>
              </div>
            </div>

            {/* Statement Transactions Table */}
            <div className="mt-6 overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-emerald-800 text-white font-extrabold uppercase tracking-wider">
                    <th className="p-3.5 rounded-l-lg">તારીખ</th>
                    <th className="p-3.5">પ્રકાર (Entry Type)</th>
                    <th className="p-3.5">નોંધ (Note)</th>
                    <th className="p-3.5 text-right">ઉધાર (+) Debit</th>
                    <th className="p-3.5 text-right">જમા (-) Credit</th>
                    <th className="p-3.5 text-right rounded-r-lg">બાકી રકમ (Balance)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-emerald-100 font-medium">
                  {data.items.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-slate-400 font-semibold">
                        હજુ સુધી કોઈ લેવડ-દેવડ નોંધાયેલ નથી.
                      </td>
                    </tr>
                  ) : (
                    data.items.map((r) => (
                      <tr key={r.id} className="hover:bg-emerald-50/40 transition">
                        <td className="p-3.5 font-mono text-slate-700">
                          {new Date(r.created_at).toLocaleDateString("en-IN")}
                        </td>
                        <td className="p-3.5 font-bold text-slate-900">
                          {r.entry_type === "sale"
                            ? "🛍️ વેચાણ બિલ (Sale)"
                            : r.entry_type === "payment"
                            ? "💵 જમા પેમેન્ટ (Payment)"
                            : r.entry_type === "sales_return"
                            ? "🔄 માલ પરત (Return)"
                            : "⚙️ એડજસ્ટમેન્ટ"}
                        </td>
                        <td className="p-3.5 text-slate-500">{r.note ?? "-"}</td>
                        <td className="p-3.5 text-right font-mono font-bold text-red-600">
                          {Number(r.debit) > 0 ? `+ ₹${Number(r.debit).toFixed(2)}` : "-"}
                        </td>
                        <td className="p-3.5 text-right font-mono font-bold text-emerald-700">
                          {Number(r.credit) > 0 ? `- ₹${Number(r.credit).toFixed(2)}` : "-"}
                        </td>
                        <td className="p-3.5 text-right font-mono font-black text-slate-900">
                          ₹{Number(r.balance).toFixed(2)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* પેમેન્ટ સ્વીકારવાનું મોડલ (Receive Payment Modal) */}
      {paying && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <form
            onSubmit={pay}
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border-2 border-emerald-700"
          >
            <h2 className="text-xl font-black text-emerald-950">💵 ગ્રાહક પાસેથી પેમેન્ટ લો</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              ગ્રાહક: <span className="font-bold text-emerald-800">{customer?.name}</span>
            </p>

            {formError && (
              <p className="mt-3 rounded-lg bg-red-50 p-3 text-xs font-bold text-red-700 border border-red-200">
                {formError}
              </p>
            )}

            <label className="mt-4 block text-xs font-bold text-gray-700">રકમ (Amount ₹) *</label>
            <input
              required
              type="number"
              step="0.01"
              min="0.01"
              className={input}
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />

            <label className="mt-4 block text-xs font-bold text-gray-700">ચુકવણી પદ્ધતિ (Method)</label>
            <select
              className={input}
              value={method}
              onChange={(e) => setMethod(e.target.value)}
            >
              <option value="cash">💵 રોકડ (Cash)</option>
              <option value="upi">📱 UPI</option>
              <option value="card">💳 Card</option>
              <option value="bank_transfer">🏦 Bank Transfer</option>
            </select>

            <label className="mt-4 block text-xs font-bold text-gray-700">નોંધ (Note - Optional)</label>
            <input
              className={input}
              placeholder="દા.ત. જૂની બાકી રકમ પેટે"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />

            <div className="mt-6 flex justify-end gap-3 pt-3 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setPaying(false)}
                className="rounded-xl border border-gray-300 px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-50 transition"
              >
                રદ કરો
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-emerald-700 px-5 py-2 text-xs font-black text-white hover:bg-emerald-800 disabled:opacity-60 shadow-md transition"
              >
                {saving ? "જમા થાય છે..." : "✓ જમા કરો"}
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}

export default function CustomerLedgerPage() {
  return (
    <Suspense fallback={<p className="p-6 text-emerald-800 font-semibold">ખાતાવહી લોડ થઈ રહી છે...</p>}>
      <LedgerView />
    </Suspense>
  );
}