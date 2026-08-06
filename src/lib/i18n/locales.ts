/**
 * Locale constants and cookie name.
 *
 * Korean is the DEFAULT locale. English is the switchable option.
 */

export const LOCALES = ["ko", "en"] as const;
export type Locale = (typeof LOCALES)[number];

/** The default locale when no cookie is set. Korean by default. */
export const DEFAULT_LOCALE: Locale = "ko";

/** The Intl locale tag for each supported locale. */
export const INTL_LOCALE: Record<Locale, string> = {
  ko: "ko-KR",
  en: "en-US",
};

/** Cookie name used to store the user's locale preference. */
export const LOCALE_COOKIE = "cios-locale";

/** Validate and normalize a locale string, falling back to the default. */
export function parseLocale(value: string | null | undefined): Locale {
  if (value === "ko" || value === "en") return value;
  return DEFAULT_LOCALE;
}
