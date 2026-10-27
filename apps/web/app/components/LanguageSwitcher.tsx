"use client";

import React, { useState } from "react";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { Language } from "@/lib/i18n/translations";

const LANGUAGES: { code: Language; label: string; flag: string }[] = [
  { code: "gu", label: "ગુજરાતી", flag: "🇮🇳" },
  { code: "hi", label: "हिन्दी", flag: "🇮🇳" },
  { code: "en", label: "English", flag: "🇬🇧" },
];

export default function LanguageSwitcher() {
  const { language, setLanguage } = useLanguage();
  const [open, setOpen] = useState(false);

  const current = LANGUAGES.find((l) => l.code === language) || LANGUAGES[0];

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs font-bold text-emerald-950 shadow-sm hover:bg-emerald-50 transition"
      >
        <span>{current.flag}</span>
        <span>{current.label}</span>
        <span className="text-[10px] text-emerald-700">▼</span>
      </button>

      {open && (
        <div className="absolute right-0 mt-1.5 w-36 overflow-hidden rounded-xl border border-emerald-200 bg-white shadow-xl z-50 animate-in fade-in zoom-in-95 duration-100">
          {LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              type="button"
              onClick={() => {
                setLanguage(lang.code);
                setOpen(false);
              }}
              className={`flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-xs font-bold transition ${
                language === lang.code
                  ? "bg-emerald-800 text-white"
                  : "text-slate-800 hover:bg-emerald-50"
              }`}
            >
              <span>{lang.flag}</span>
              <span>{lang.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}