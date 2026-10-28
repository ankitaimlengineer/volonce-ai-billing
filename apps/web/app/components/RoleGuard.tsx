"use client";

import React from "react";
import Link from "next/link";
import { useAuth, UserRole } from "@/lib/auth";

interface Props {
  allowedRoles: UserRole[];
  children: React.ReactNode;
}

export default function RoleGuard({ allowedRoles, children }: Props) {
  const { user, loading, hasRole } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-emerald-50/50">
        <p className="text-sm font-bold text-emerald-800 animate-pulse">પરવાનગી ચકાસી રહ્યા છીએ...</p>
      </div>
    );
  }

  if (!user || !hasRole(...allowedRoles)) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-emerald-50/50 p-6">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-xl border border-red-200">
          <span className="text-5xl block mb-3">🔒</span>
          <h2 className="text-xl font-black text-red-900">ઍક્સેસ પ્રતિબંધિત છે (Access Restricted)</h2>
          <p className="text-xs text-slate-600 mt-2 leading-relaxed">
            આ પેજ માત્ર દુકાન માલિક (<b>Owner / Manager</b>) માટે સુરક્ષિત છે. તમારા એકાઉન્ટનો રોલ (<b>{user?.role?.toUpperCase() || "CASHIER"}</b>) છે.
          </p>
          <Link
            href="/dashboard"
            className="mt-6 inline-block rounded-xl bg-emerald-700 px-6 py-2.5 text-xs font-bold text-white shadow-md hover:bg-emerald-800 transition"
          >
            ← ડેશબોર્ડ પર પાછા જાઓ
          </Link>
        </div>
      </main>
    );
  }

  return <>{children}</>;
}