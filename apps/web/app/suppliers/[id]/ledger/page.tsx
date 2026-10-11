"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { ApiError, authGet, authPost, clearTokens } from "@/lib/api";

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

const input =
  "mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500";

function LedgerView() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<Ledger | null>(null);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [paying, setPaying] = useState(false);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  // One key per payment attempt: a double click sends the same key
  const keyRef = useRef("");

  const onAuthError = useCallback(() => {
    clearTokens();
    router.replace("/login");
  }, [router]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await authGet<Ledger>(`/api/v1/suppliers/${id}/ledger`);
        if (!cancelled) {
          setData(res);
          setError("");
        }
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) return onAuthError();
        setError(err instanceof Error ? err.message : "Could not load ledger");
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
    setFormError("");
    setSaving(true);
    try {
      await authPost(
        `/api/v1/suppliers/${id}/payments`,
        { amount, payment_method: method, note: note || null },
        { "Idempotency-Key": keyRef.current }
      );
      setPaying(false);
      setReload((n) => n + 1);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return onAuthError();
      setFormError(err instanceof Error ? err.message : "Payment failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-emerald-50 p-6">
      <div className="mx-auto max-w-4xl rounded-2xl bg-white p-6 shadow">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-emerald-800">Supplier Ledger</h1>
          <div className="flex items-center gap-4">
            <Link href="/suppliers" className="text-sm text-gray-600 hover:underline">
              ← Suppliers
            </Link>
            <button
              onClick={openPay}
              className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
            >
              Pay
            </button>
          </div>
        </div>

        {error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

        {data && (
          <>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-gray-200 p-4">
                <p className="text-sm text-gray-500">Opening balance</p>
                <p className="text-xl font-bold">₹{data.opening_balance}</p>
              </div>
              <div className="rounded-xl border border-gray-200 p-4">
                <p className="text-sm text-gray-500">Aapva baaki</p>
                <p className="text-xl font-bold text-emerald-800">₹{data.outstanding}</p>
              </div>
            </div>

            <table className="mt-4 w-full text-sm">
              <thead>
                <tr className="bg-emerald-700 text-left text-white">
                  <th className="p-2">Date</th>
                  <th className="p-2">Type</th>
                  <th className="p-2">Note</th>
                  <th className="p-2 text-right">Debit</th>
                  <th className="p-2 text-right">Credit</th>
                  <th className="p-2 text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((r) => (
                  <tr key={r.id} className="border-b border-gray-200 text-gray-800">
                    <td className="p-2">{new Date(r.created_at).toLocaleDateString("en-IN")}</td>
                    <td className="p-2">{r.entry_type}</td>
                    <td className="p-2">{r.note ?? "-"}</td>
                    <td className="p-2 text-right">{Number(r.debit) > 0 ? r.debit : ""}</td>
                    <td className="p-2 text-right">{Number(r.credit) > 0 ? r.credit : ""}</td>
                    <td className="p-2 text-right font-medium">{r.balance}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>

      {paying && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/40 p-4">
          <form onSubmit={pay} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-bold text-emerald-800">Payment</h2>
            {formError && (
              <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{formError}</p>
            )}
            <label className="mt-4 block text-sm font-medium text-gray-700">Amount ₹</label>
            <input required type="number" step="0.01" min="0.01" className={input}
              value={amount} onChange={(e) => setAmount(e.target.value)} />
            <label className="mt-4 block text-sm font-medium text-gray-700">Method</label>
            <select className={input} value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="cash">Cash</option>
              <option value="upi">UPI</option>
              <option value="card">Card</option>
              <option value="bank_transfer">Bank transfer</option>
            </select>
            <label className="mt-4 block text-sm font-medium text-gray-700">Note</label>
            <input className={input} value={note} onChange={(e) => setNote(e.target.value)} />
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setPaying(false)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700">
                Cancel
              </button>
              <button type="submit" disabled={saving}
                className="rounded-lg bg-emerald-700 px-5 py-2 text-sm font-medium text-white disabled:opacity-60">
                {saving ? "Saving..." : "Pay"}
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}

export default function LedgerPage() {
  return (
    <Suspense fallback={<p className="p-6 text-gray-600">Loading...</p>}>
      <LedgerView />
    </Suspense>
  );
}