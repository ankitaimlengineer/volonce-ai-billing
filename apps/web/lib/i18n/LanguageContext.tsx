"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { Language, translations } from "./translations";

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: keyof typeof translations["gu"]) => string;
}

const LanguageContext = createContext<LanguageContextType>({
  language: "gu",
  setLanguage: () => {},
  t: (key) => translations.gu[key] || (key as string),
});

export const LanguageProvider = ({ children }: { children: React.ReactNode }) => {
  const [language, setLanguageState] = useState<Language>("gu");

  useEffect(() => {
    // React 19 માં cascading render ટાળવા માટે ટાઈમર દ્વારા સેવ થયેલી ભાષા લોડ કરવી
    const timer = setTimeout(() => {
      if (typeof window !== "undefined") {
        const saved = localStorage.getItem("volonce_lang") as Language;
        if (saved && (saved === "gu" || saved === "hi" || saved === "en")) {
          setLanguageState(saved);
        }
      }
    }, 0);

    return () => clearTimeout(timer);
  }, []);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    if (typeof window !== "undefined") {
      localStorage.setItem("volonce_lang", lang);
    }
  };

  const t = useCallback(
    (key: keyof typeof translations["gu"]): string => {
      const currentDict = translations[language] || translations.gu;
      return currentDict[key] || translations.gu[key] || (key as string);
    },
    [language]
  );

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => useContext(LanguageContext);