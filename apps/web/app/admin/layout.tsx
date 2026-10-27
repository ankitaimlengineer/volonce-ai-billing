import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Super Admin Portal | VOLONCE AI BILLING",
  description: "Platform Administration and Monitoring",
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-emerald-50/50 text-slate-900 flex flex-col">
      {/* Top Admin Header - Signature Emerald & White */}
      <header className="border-b border-emerald-200/80 bg-white px-6 py-4 flex items-center justify-between shadow-sm sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-800 text-xl font-black text-white shadow-sm">
            🛡️
          </span>
          <div>
            <h1 className="text-base md:text-lg font-black tracking-tight text-emerald-950">
              VOLONCE SUPER ADMIN
            </h1>
            <p className="text-[10px] text-emerald-700 font-extrabold uppercase tracking-wider">
              Platform Master Console • સર્વોચ્ચ વહીવટી પેનલ
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="rounded-xl border-2 border-emerald-700 bg-white px-4 py-2 text-xs font-bold text-emerald-800 shadow-sm hover:bg-emerald-50 transition"
          >
            ← Store Dashboard (દુકાન ડેશબોર્ડ)
          </Link>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 p-4 md:p-8">{children}</main>
    </div>
  );
}