"use client";

/**
 * Client-side locale context.
 *
 * The locale and dictionary are resolved server-side (in the root layout) and passed
 * down through this provider. Client components use the `useLocale()` and `useT()`
 * hooks to access the current locale and translation function without fetching.
 */

import * as React from "react";

import type { Dictionary, DictionaryKey } from "@/lib/i18n/dictionaries/ko";
import en from "@/lib/i18n/dictionaries/en";
import ko from "@/lib/i18n/dictionaries/ko";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import type { Locale } from "@/lib/i18n/locales";

export type LocaleContextValue = {
  readonly locale: Locale;
  readonly dictionary: Dictionary;
};

const DICTIONARIES: Record<Locale, Dictionary> = { ko, en };

const LocaleContext = React.createContext<LocaleContextValue>({
  locale: DEFAULT_LOCALE,
  dictionary: DICTIONARIES[DEFAULT_LOCALE],
});

export function LocaleProvider({
  locale,
  children,
}: {
  readonly locale: Locale;
  readonly children: React.ReactNode;
}) {
  const value = React.useMemo<LocaleContextValue>(
    () => ({ locale, dictionary: DICTIONARIES[locale] }),
    [locale],
  );
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

/** Current locale. */
export function useLocale(): Locale {
  return React.useContext(LocaleContext).locale;
}

/** Translation function for client components. */
export function useT(): (key: DictionaryKey) => string {
  const { dictionary } = React.useContext(LocaleContext);
  return React.useCallback((key: DictionaryKey) => dictionary[key], [dictionary]);
}

/** Full context value (locale + dictionary). */
export function useLocaleContext(): LocaleContextValue {
  return React.useContext(LocaleContext);
}
