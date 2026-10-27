"use client";

import React from "react";
import Link from "next/link";
import LanguageSwitcher from "./LanguageSwitcher";
import NotificationBell from "./NotificationBell";
import { useLanguage } from "@/lib/i18n/LanguageContext";

interface Props {
  title?: string;
  subtitle?: string;
  backHref?: string;
}

export default function AppHeader({ title, subtitle, backHref = "/dashboard" }: Props) {
  const { t } = useLanguage();

  return (
    <header className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-emerald-200/80 bg-white p-4 rounded-2xl shadow-sm">
      <div className="flex items-center gap-3">
        {backHref && (
          <Link
            href={backHref}
            className="rounded-xl border border-emerald-700 bg-white px-3.5 py-2 text-xs font-bold text-emerald-800 shadow-sm hover:bg-emerald-50 transition"
          >
            {t("back_to_dashboard")}
          </Link>
        )}
        {title && (
          <div>
            <h1 className="text-xl md:text-2xl font-black text-emerald-950">{title}</h1>
            {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2.5">
        {/* 🌐 ગ્લોબલ ભાષા સ્વિચર */}
        <LanguageSwitcher />

        {/* 🔔 ગ્લોબલ નોટિફિકેશન બેલ */}
        <NotificationBell />
      </div>
    </header>
  );
}