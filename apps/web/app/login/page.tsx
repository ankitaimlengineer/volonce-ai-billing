"use client";

import Link from "next/link";
import { useState } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // API connection comes in the next step
    alert(`Login clicked: ${email}`);
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-emerald-50 p-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-2xl bg-white p-8 shadow"
      >
        <h1 className="text-2xl font-bold text-emerald-800">Login</h1>

        <label className="mt-6 block text-sm font-medium text-gray-700">Email</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />

        <label className="mt-4 block text-sm font-medium text-gray-700">Password</label>
        <input
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />

        <button
          type="submit"
          className="mt-6 w-full rounded-lg bg-emerald-700 py-2.5 font-medium text-white hover:bg-emerald-800"
        >
          Login
        </button>

        <p className="mt-4 text-center text-sm text-gray-600">
          Account nathi?{" "}
          <Link href="/register" className="text-emerald-700 font-medium">
            Register karo
          </Link>
        </p>
      </form>
    </main>
  );
}