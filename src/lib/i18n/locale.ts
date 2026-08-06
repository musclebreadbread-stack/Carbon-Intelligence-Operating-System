/**
 * UI locale, resolved server-side from a cookie.
 *
 * The same shape `active-organization.ts` uses for tenant selection: a UI
 * preference lives in a cookie rather than the session, is read once per
 * request, and is handed down through a provider rather than read again by
 * every client component that needs it.
 *
 * `next/headers` import: deliberately kept out of `messages.ts`, which stays
 * framework-free so both server and client components can import it directly.
 */

import { cookies } from "next/headers";

import { DEFAULT_LOCALE, LOCALES, type Locale } from "./messages";

export const LOCALE_COOKIE = "cios-locale";

function isLocale(value: string | undefined): value is Locale {
  return value !== undefined && (LOCALES as readonly string[]).includes(value);
}

/** The locale a page should render in, set by `setLocaleAction`. */
export async function resolveLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const value = cookieStore.get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : DEFAULT_LOCALE;
}
