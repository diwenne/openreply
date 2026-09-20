"use client";

import { createContext, useContext, useEffect, useMemo } from "react";
import { createI18n, type Locale } from "./index";

// Shared components on the English marketing pages work without a provider.
const I18nContext = createContext(createI18n("en"));

export function I18nProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  const value = useMemo(() => createI18n(locale), [locale]);

  useEffect(() => {
    const previous = document.documentElement.lang;
    document.documentElement.lang = locale;
    return () => {
      document.documentElement.lang = previous;
    };
  }, [locale]);

  return (
    <I18nContext.Provider value={value}>
      <div lang={locale} className="contents">
        {children}
      </div>
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}
