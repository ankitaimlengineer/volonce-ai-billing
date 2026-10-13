"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, authGet, authPost, clearTokens } from "@/lib/api";

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

const CATEGORIES = ["rent", "salary", "electricity", "transport", "internet", "marketing", "maintenance", "other"];
const input =
  "mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500";

export default function ExpensesPage() {
  const router = useRouter();
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
        setError(err instanceof Error ? err.message : "Could not load expenses");
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
      setFormError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function cancel(id: string) {
    if (!confirm("Aa expense cancel karvo che?")) return;
    try {
      await authPost(`/api/v1/expenses/${id}/cancel`);
      setReload((n) => n + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cancel failed");
    }
  }

  return (
    <main className="min-h-screen bg-emerald-50 p-6">
      <div className="mx-auto max-w-4xl rounded-2xl bg-white p-6 shadow">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-emerald-800">Expenses</h1>
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="text-sm text-gray-600 hover:underline">
              ← Dashboard
            </Link>
            <button onClick={openAdd}
              className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800">
              + Add Expense
            </button>
          </div>
        </div>

        {error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

        {data && (
          <p className="mt-4 text-sm text-gray-600">
            Kul (active): <span className="font-bold text-emerald-800">₹{data.total_amount}</span>
          </p>
        )}

        <table className="mt-2 w-full text-sm">
          <thead>
            <tr className="bg-emerald-700 text-left text-white">
              <th className="p-2">Date</th>
              <th className="p-2">Category</th>
              <th className="p-2">Method</th>
              <th className="p-2">Notes</th>
              <th className="p-2 text-right">Amount</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {data?.items.length === 0 && (
              <tr><td colSpan={6} className="p-4 text-center text-gray-500">Haju koi expense nathi.</td></tr>
            )}
            {data?.items.map((x) => (
              <tr key={x.id}
                className={`border-b border-gray-200 text-gray-800 ${x.status === "cancelled" ? "text-gray-400 line-through" : ""}`}>
                <td className="p-2">{x.expense_date}</td>
                <td className="p-2">{x.category}</td>
                <td className="p-2">{x.payment_method}</td>
                <td className="p-2">{x.notes ?? "-"}</td>
                <td className="p-2 text-right">₹{x.amount}</td>
                <td className="p-2 text-right">
                  {x.status === "active" && (
                    <button onClick={() => cancel(x.id)} className="text-red-600 hover:underline">
                      Cancel
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {adding && (
        <div className="fixed inset-0 z-10 flex items-center justify-center overflow-y-auto bg-black/40 p-4">
          <form onSubmit={save} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-bold text-emerald-800">Navo Expense</h2>
            {formError && (
              <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{formError}</p>
            )}
            <label className="mt-4 block text-sm font-medium text-gray-700">Category</label>
            <select className={input} value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <label className="mt-4 block text-sm font-medium text-gray-700">Amount ₹</label>
            <input required type="number" step="0.01" min="0.01" className={input}
              value={amount} onChange={(e) => setAmount(e.target.value)} />
            <label className="mt-4 block text-sm font-medium text-gray-700">Date</label>
            <input required type="date" className={input}
              ref={(el) => {
                dateRef.current = el;
                if (el && !el.value) {
                  const d = new Date();
                  el.value = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
                    .toISOString()
                    .slice(0, 10);
                }
              }} />
            <label className="mt-4 block text-sm font-medium text-gray-700">Method</label>
            <select className={input} value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="cash">Cash</option>
              <option value="upi">UPI</option>
              <option value="card">Card</option>
              <option value="bank_transfer">Bank transfer</option>
            </select>
            <label className="mt-4 block text-sm font-medium text-gray-700">Notes</label>
            <input className={input} value={notes} onChange={(e) => setNotes(e.target.value)} />
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setAdding(false)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700">
                Cancel
              </button>
              <button type="submit" disabled={saving}
                className="rounded-lg bg-emerald-700 px-5 py-2 text-sm font-medium text-white disabled:opacity-60">
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}