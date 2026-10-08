"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiPost, saveTokens, TokenResponse } from "@/lib/api";

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    business_name: "",
    full_name: "",
    email: "",
    mobile: "",
    password: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function update(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const tokens = await apiPost<TokenResponse>("/api/v1/auth/register", {
        ...form,
        mobile: form.mobile || null,
      });
      saveTokens(tokens);
      router.push("/setup");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Register failed");
    } finally {
      setLoading(false);
    }
  }

  const input =
    "mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500";

  return (
    <main className="min-h-screen flex items-center justify-center bg-emerald-50 p-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-2xl bg-white p-8 shadow"
      >
        <h1 className="text-2xl font-bold text-emerald-800">Register</h1>

        {error && (
          <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>
        )}

        <label className="mt-6 block text-sm font-medium text-gray-700">Business Name</label>
        <input required minLength={2} className={input} value={form.business_name}
          onChange={(e) => update("business_name", e.target.value)} />

        <label className="mt-4 block text-sm font-medium text-gray-700">Owner Name</label>
        <input required minLength={2} className={input} value={form.full_name}
          onChange={(e) => update("full_name", e.target.value)} />

        <label className="mt-4 block text-sm font-medium text-gray-700">Email</label>
        <input type="email" required className={input} value={form.email}
          onChange={(e) => update("email", e.target.value)} />

        <label className="mt-4 block text-sm font-medium text-gray-700">Mobile (optional)</label>
        <input className={input} value={form.mobile}
          onChange={(e) => update("mobile", e.target.value)} />

        <label className="mt-4 block text-sm font-medium text-gray-700">Password (min 8)</label>
        <input type="password" required minLength={8} className={input} value={form.password}
          onChange={(e) => update("password", e.target.value)} />

        <button
          type="submit"
          disabled={loading}
          className="mt-6 w-full rounded-lg bg-emerald-700 py-2.5 font-medium text-white hover:bg-emerald-800 disabled:opacity-60"
        >
          {loading ? "Please wait..." : "Register"}
        </button>

        <p className="mt-4 text-center text-sm text-gray-600">
          Account che?{" "}
          <Link href="/login" className="text-emerald-700 font-medium">
            Login karo
          </Link>
        </p>
      </form>
    </main>
  );
}