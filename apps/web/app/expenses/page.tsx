"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, authGet, authPost, clearTokens } from "@/lib/api";
import RoleGuard from "@/app/components/RoleGuard";
import LanguageSwitcher from "@/app/components/LanguageSwitcher";
import { useLanguage } from "@/lib/i18n/LanguageContext";

type Expense = {
  id: string;
  category: string;
  amount: string;
  expense_date: string;
  payment_method: string;
  notes: string | null;
  status: string;
};

type List = { items: Expense[]; total_amount: string };

const CATEGORIES = [
  { key: "rent", label: "🏠 દુકાન ભાડું (Rent)" },
  { key: "salary", label: "👥 પગાર (Salary)" },
  { key: "electricity", label: "⚡ લાઈટ બિલ (Electricity)" },
  { key: "transport", label: "🚚 ટ્રાન્સપોર્ટ (Transport)" },
  { key: "internet", label: "📶 ઇન્ટરનેટ / ફોન (Internet)" },
  { key: "marketing", label: "📢 માર્કેટિંગ (Marketing)" },
  { key: "maintenance", label: "🔧 રિપેરિંગ (Maintenance)" },
  { key: "other", label: "☕ ચા-નાસ્તો / અન્ય (Other)" },
];

const input =
  "mt-1 w-full rounded-xl border border-gray-300 px-3.5 py-2 text-xs md:text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium";

export default function ExpensesPage() {
  const router = useRouter();
  const { t } = useLanguage();

  const [data, setData] = useState<List | null>(null);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [adding, setAdding] = useState(false);
  const [category, setCategory] = useState("rent");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const keyRef = useRef("");
  const dateRef = useRef<HTMLInputElement | null>(null);

  const onAuthError = useCallback(() => {
    clearTokens();
    router.replace("/login");
  }, [router]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await authGet<List>("/api/v1/expenses?limit=200");
        if (!cancelled) {
          setData(res);
          setError("");
        }
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) return onAuthError();
        setError(err instanceof Error ? err.message : "ખર્ચા લોડ થઈ શક્યા નથી.");
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [reload, onAuthError]);

  function openAdd() {
    keyRef.current = crypto.randomUUID();
    setAmount("");
    setNotes("");
    setFormError("");
    setAdding(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setFormError("");
    setSaving(true);
    try {
      await authPost(
        "/api/v1/expenses",
        {
          category,
          amount,
          expense_date: dateRef.current?.value ?? "",
          payment_method: method,
          notes: notes || null,
        },
        { "Idempotency-Key": keyRef.current }
      );
      setAdding(false);
      setReload((n) => n + 1);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return onAuthError();
      setFormError(err instanceof Error ? err.message : "ખર્ચ સેવ કરવામાં સમસ્યા આવી.");
    } finally {
      setSaving(false);
    }
  }

  async function cancel(id: string) {
    if (!confirm("આ ખર્ચ રદ (Cancel) કરવો છે?")) return;
    try {
      await authPost(`/api/v1/expenses/${id}/cancel`);
      setReload((n) => n + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "ખર્ચ રદ થઈ શક્યો નથી.");
    }
  }

  return (
    // 🛡️ ફક્ત Owner અને Manager જ દુકાનના ખર્ચા જોઈ કે ઉમેરી શકે
    <RoleGuard allowedRoles={["owner", "manager"]}>
      <main className="min-h-screen bg-emerald-50/50 p-4 md:p-6">
        <div className="mx-auto max-w-5xl rounded-2xl bg-white p-6 shadow-md border border-emerald-100">
          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-100 pb-5">
            <div>
              <h1 className="text-2xl font-black text-emerald-950">📝 {t("expenses_title")}</h1>
              <p className="text-xs text-slate-500 mt-0.5">દુકાનનું ભાડું, પગાર, લાઈટ બિલ અને દૈનિક ખર્ચાનો હિસાબ</p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <LanguageSwitcher />

              <Link
                href="/dashboard"
                className="rounded-xl border border-gray-300 bg-white px-3.5 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50 transition"
              >
                {t("back_to_dashboard")}
              </Link>

              <button
                type="button"
                onClick={openAdd}
                className="rounded-xl bg-emerald-700 px-4 py-2 text-xs font-black text-white shadow hover:bg-emerald-800 transition"
              >
                {t("add_expense_btn")}
              </button>
            </div>
          </div>

          {error && (
            <p className="mt-4 rounded-xl bg-red-50 p-3 text-xs font-bold text-red-700 border border-red-200">
              ⚠️ {error}
            </p>
          )}

          {/* Total Expense Summary Banner */}
          {data && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-amber-50/80 p-4 border border-amber-200">
              <div>
                <span className="text-xs font-bold text-amber-900 uppercase tracking-wider block">
                  {t("total_active_expenses")}
                </span>
                <p className="text-2xl font-black text-amber-950 font-mono mt-0.5">
                  ₹{Number(data.total_amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </p>
              </div>
              <span className="text-[11px] font-semibold text-amber-800">
                ({data.items.filter((x) => x.status === "active").length} સક્રિય ખર્ચા નોંધાયેલા છે)
              </span>
            </div>
          )}

          {/* Expenses Table */}
          <div className="mt-4 overflow-x-auto rounded-xl border border-emerald-100">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-emerald-800 text-white font-extrabold uppercase tracking-wider">
                  <th className="p-3 rounded-tl-xl">{t("date")}</th>
                  <th className="p-3">{t("category_col")}</th>
                  <th className="p-3">{t("method")}</th>
                  <th className="p-3">{t("notes")}</th>
                  <th className="p-3 text-right">{t("amount")}</th>
                  <th className="p-3 text-right rounded-tr-xl">{t("action")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-emerald-100 font-medium">
                {data?.items.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-gray-400 font-semibold">
                      {t("no_expenses")}
                    </td>
                  </tr>
                )}
                {data?.items.map((x) => {
                  const isCancelled = x.status === "cancelled";
                  return (
                    <tr
                      key={x.id}
                      className={`hover:bg-emerald-50/40 transition ${
                        isCancelled ? "bg-gray-50/80 text-gray-400 line-through" : "text-gray-800"
                      }`}
                    >
                      <td className="p-3 font-mono">{x.expense_date}</td>
                      <td className="p-3 font-bold uppercase text-slate-900">
                        {CATEGORIES.find((c) => c.key === x.category)?.label || x.category}
                      </td>
                      <td className="p-3 font-semibold uppercase">{x.payment_method}</td>
                      <td className="p-3 text-slate-500">{x.notes ?? "-"}</td>
                      <td className={`p-3 text-right font-mono font-black ${isCancelled ? "text-gray-400" : "text-amber-700"}`}>
                        ₹{Number(x.amount).toFixed(2)}
                      </td>
                      <td className="p-3 text-right">
                        {x.status === "active" ? (
                          <button
                            type="button"
                            onClick={() => cancel(x.id)}
                            className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-bold text-red-700 hover:bg-red-100 transition"
                          >
                            રદ કરો (Cancel)
                          </button>
                        ) : (
                          <span className="text-[10px] font-bold text-gray-400">Cancelled</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* નવો ખર્ચ ઉમેરવાનું મોડલ (Add Expense Modal) */}
        {adding && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
            <form onSubmit={save} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border-2 border-emerald-700">
              <h2 className="text-xl font-black text-emerald-950">📝 {t("add_expense_btn")}</h2>
              <p className="text-xs text-slate-500 mt-0.5">દુકાનનો નવો ખર્ચ અહીં નોંધો</p>

              {formError && (
                <p className="mt-3 rounded-lg bg-red-50 p-2.5 text-xs font-bold text-red-700 border border-red-200">
                  ⚠️ {formError}
                </p>
              )}

              <label className="mt-4 block text-xs font-bold text-gray-700 uppercase tracking-wider">
                {t("category_col")} *
              </label>
              <select className={input} value={category} onChange={(e) => setCategory(e.target.value)}>
                {CATEGORIES.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>

              <label className="mt-3 block text-xs font-bold text-gray-700 uppercase tracking-wider">
                {t("amount")} *
              </label>
              <input
                required
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0.00"
                className={input + " font-mono font-bold text-base text-amber-700"}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />

              <div className="grid grid-cols-2 gap-3 mt-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
                    {t("date")} *
                  </label>
                  <input
                    required
                    type="date"
                    className={input + " font-mono"}
                    ref={(el) => {
                      dateRef.current = el;
                      if (el && !el.value) {
                        const d = new Date();
                        el.value = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
                          .toISOString()
                          .slice(0, 10);
                      }
                    }}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
                    {t("method")} *
                  </label>
                  <select className={input} value={method} onChange={(e) => setMethod(e.target.value)}>
                    <option value="cash">💵 {t("cash")}</option>
                    <option value="upi">📱 {t("upi")}</option>
                    <option value="card">💳 {t("card")}</option>
                    <option value="bank_transfer">🏦 {t("bank_transfer")}</option>
                  </select>
                </div>
              </div>

              <label className="mt-3 block text-xs font-bold text-gray-700 uppercase tracking-wider">
                {t("notes")} (Optional)
              </label>
              <input
                className={input}
                placeholder="દા.ત. ડિસેમ્બર મહિનાનું ભાડું"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />

              <div className="mt-6 flex justify-end gap-3 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setAdding(false)}
                  className="rounded-xl border border-gray-300 px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-50 transition"
                >
                  {t("cancel")}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl bg-emerald-700 px-5 py-2 text-xs font-black text-white hover:bg-emerald-800 disabled:opacity-60 shadow-md transition"
                >
                  {saving ? t("saving") : t("save")}
                </button>
              </div>
            </form>
          </div>
        )}
      </main>
    </RoleGuard>
  );
}