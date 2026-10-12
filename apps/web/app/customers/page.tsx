"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ApiError, authGet, authPost, clearTokens } from "@/lib/api";

type Customer = {
  id: string;
  name: string;
  mobile: string | null;
  customer_type: string;
  outstanding: string;
};
type List = { items: Customer[]; total: number };

const input =
  "mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500";
const TYPES = ["retail", "farmer", "business", "dealer", "distributor", "other"];
const EMPTY = { name: "", mobile: "", customer_type: "retail", opening_balance: "0", credit_limit: "" };

export default function CustomersPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [reload, setReload] = useState(0);
  const [data, setData] = useState<List | null>(null);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const onAuthError = useCallback(() => {
    clearTokens();
    router.replace("/login");
  }, [router]);

  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const p = new URLSearchParams({ page_size: "100" });
        if (query) p.set("q", query);
        const res = await authGet<List>(`/api/v1/customers?${p}`);
        if (!cancelled) {
          setData(res);
          setError("");
        }
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) return onAuthError();
        if (err instanceof ApiError && err.status === 403) return router.replace("/setup");
        setError(err instanceof Error ? err.message : "Could not load customers");
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [query, reload, onAuthError, router]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setFormError("");
    setSaving(true);
    try {
      await authPost("/api/v1/customers", {
        name: form.name,
        mobile: form.mobile || null,
        customer_type: form.customer_type,
        opening_balance: form.opening_balance || "0",
        credit_limit: form.credit_limit || null,
      });
      setAdding(false);
      setForm(EMPTY);
      setReload((n) => n + 1);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return onAuthError();
      setFormError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-emerald-50 p-6">
      <div className="mx-auto max-w-4xl rounded-2xl bg-white p-6 shadow">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-emerald-800">Customers</h1>
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="text-sm text-gray-600 hover:underline">
              ← Dashboard
            </Link>
            <button
              onClick={() => setAdding(true)}
              className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
            >
              + Add Customer
            </button>
          </div>
        </div>

        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Naam ke mobile thi shodho..."
          className={input + " mt-4"}
        />
        {error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

        <table className="mt-4 w-full text-sm">
          <thead>
            <tr className="bg-emerald-700 text-left text-white">
              <th className="p-2">Name</th>
              <th className="p-2">Mobile</th>
              <th className="p-2">Type</th>
              <th className="p-2 text-right">Levana baaki</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {data?.items.length === 0 && (
              <tr>
                <td colSpan={5} className="p-4 text-center text-gray-500">
                  Koi customer nathi.
                </td>
              </tr>
            )}
            {data?.items.map((c) => (
              <tr key={c.id} className="border-b border-gray-200 text-gray-800">
                <td className="p-2 font-medium">{c.name}</td>
                <td className="p-2">{c.mobile ?? "-"}</td>
                <td className="p-2">{c.customer_type}</td>
                <td className="p-2 text-right">₹{c.outstanding}</td>
                <td className="p-2 text-right">
                  <Link
                    href={`/customers/${c.id}/ledger`}
                    className="text-emerald-700 hover:underline"
                  >
                    Ledger
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {adding && (
        <div className="fixed inset-0 z-10 flex items-center justify-center overflow-y-auto bg-black/40 p-4">
          <form onSubmit={save} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-bold text-emerald-800">Navo Customer</h2>
            {formError && (
              <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{formError}</p>
            )}
            <label className="mt-4 block text-sm font-medium text-gray-700">Name *</label>
            <input required className={input} value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <label className="mt-4 block text-sm font-medium text-gray-700">Mobile</label>
            <input className={input} value={form.mobile}
              onChange={(e) => setForm({ ...form, mobile: e.target.value })} />
            <label className="mt-4 block text-sm font-medium text-gray-700">Type</label>
            <select className={input} value={form.customer_type}
              onChange={(e) => setForm({ ...form, customer_type: e.target.value })}>
              {TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <label className="mt-4 block text-sm font-medium text-gray-700">
              Opening balance (levana baaki)
            </label>
            <input type="number" step="0.01" min="0" className={input}
              value={form.opening_balance}
              onChange={(e) => setForm({ ...form, opening_balance: e.target.value })} />
            <label className="mt-4 block text-sm font-medium text-gray-700">
              Credit limit (optional)
            </label>
            <input type="number" step="0.01" min="0" className={input}
              value={form.credit_limit}
              onChange={(e) => setForm({ ...form, credit_limit: e.target.value })} />
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