"use client";

/**
 * Client-side locale context.
 *
 * The locale is resolved once, on the server, in `(dashboard)/layout.tsx` from
 * the cookie `setLocaleAction` writes, and handed down through this provider —
 * the same shape `SessionProvider` uses for the session. `setLocale` updates
 * local state immediately so a toggle feels instant; it does not itself persist
 * anything, callers pair it with `setLocaleAction`.
 */

import * as React from "react";

import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/messages";

export type LocaleContextValue = {
  readonly locale: Locale;
  readonly setLocale: (locale: Locale) => void;
};

const LocaleContext = React.createContext<LocaleContextValue>({
  locale: DEFAULT_LOCALE,
  setLocale: () => {},
});

export function LocaleProvider({
  initialLocale,
  children,
}: {
  readonly initialLocale: Locale;
  readonly children: React.ReactNode;
}) {
  const [locale, setLocale] = React.useState<Locale>(initialLocale);
  const value = React.useMemo<LocaleContextValue>(() => ({ locale, setLocale }), [locale]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

/** The active locale. Defaults to `"en"` outside a `LocaleProvider`. */
export function useLocale(): Locale {
  return React.useContext(LocaleContext).locale;
}

/** Updates the locale in local state; pair with `setLocaleAction` to persist it. */
export function useSetLocale(): (locale: Locale) => void {
  return React.useContext(LocaleContext).setLocale;
}
