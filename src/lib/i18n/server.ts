/**
 * Server-side locale resolution.
 *
 * Reads the `cios-locale` cookie from the request (via `next/headers`) and returns
 * the dictionary for the resolved locale. Used in Server Components and layouts.
 */

import { cookies } from "next/headers";

import type { Dictionary, DictionaryKey } from "./dictionaries/ko";
import en from "./dictionaries/en";
import ko from "./dictionaries/ko";
import { DEFAULT_LOCALE, LOCALE_COOKIE, parseLocale } from "./locales";
import type { Locale } from "./locales";

export type { Dictionary, DictionaryKey };
export type { Locale };

const DICTIONARIES: Record<Locale, Dictionary> = { ko, en };

/** Resolve the current locale from the request cookie. */
export async function getLocale(): Promise<Locale> {
  try {
    const cookieStore = await cookies();
    const value = cookieStore.get(LOCALE_COOKIE)?.value;
    return parseLocale(value);
  } catch {
    // Outside of a request context (e.g. during build), return default.
    return DEFAULT_LOCALE;
  }
}

/** Get the dictionary for the current locale. */
export async function getDictionary(): Promise<Dictionary> {
  const locale = await getLocale();
  return DICTIONARIES[locale];
}

/** Get the dictionary for a specific locale. */
export function getDictionarySync(locale: Locale): Dictionary {
  return DICTIONARIES[locale];
}

/**
 * Translate a key using the current locale's dictionary.
 * Returns the key itself if no translation is found (should not happen with type safety).
 */
export async function t(key: DictionaryKey): Promise<string> {
  const dict = await getDictionary();
  return dict[key];
}
