/**
 * Presentation formatting.
 *
 * Kept out of `src/lib/domain/**` on purpose: the engines return raw numbers and
 * rounding happens only at the presentation boundary (decision 12). Every helper
 * is deterministic and uses the locale resolved from the request (or the default)
 * so a server-rendered figure and its client-hydrated counterpart are identical.
 *
 * The locale-scoped `createFormatter(locale)` factory is the primary API. The
 * top-level functions remain for backwards compatibility and use the default locale.
 */

import { DEFAULT_LOCALE, INTL_LOCALE } from "@/lib/i18n/locales";
import type { Locale } from "@/lib/i18n/locales";

/** Resolve the Intl locale tag for a given app locale. */
function intlTag(locale: Locale): string {
  return INTL_LOCALE[locale];
}

// ─── Locale-scoped formatter factory ─────────────────────────────────────────

export type Formatter = {
  number: (value: number | null | undefined, decimals?: number) => string;
  emissions: (value: number | null | undefined) => string;
  percent: (value: number | null | undefined, decimals?: number) => string;
  fraction: (value: number | null | undefined, decimals?: number) => string;
  currency: (value: number | null | undefined, currency?: string, decimals?: number) => string;
  date: (value: Date | string | null | undefined) => string;
  dateTime: (value: Date | string | null | undefined) => string;
  month: (value: Date | string | null | undefined) => string;
  scopeLabel: (scope: string) => string;
  humaniseEnum: (value: string | null | undefined) => string;
};

/** Scope labels per locale. */
const SCOPE_LABELS: Record<Locale, Record<string, string>> = {
  ko: {
    SCOPE_1: "Scope 1",
    SCOPE_2_LOCATION: "Scope 2 (\uC704\uCE58\uAE30\uBC18)",
    SCOPE_2_MARKET: "Scope 2 (\uC2DC\uC7A5\uAE30\uBC18)",
    SCOPE_3: "Scope 3",
  },
  en: {
    SCOPE_1: "Scope 1",
    SCOPE_2_LOCATION: "Scope 2 (location)",
    SCOPE_2_MARKET: "Scope 2 (market)",
    SCOPE_3: "Scope 3",
  },
};

/** Create a locale-scoped formatter. */
export function createFormatter(locale: Locale = DEFAULT_LOCALE): Formatter {
  const tag = intlTag(locale);

  function number(value: number | null | undefined, decimals = 0): string {
    if (value === null || value === undefined || !Number.isFinite(value)) return "\u2014";
    return new Intl.NumberFormat(tag, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value);
  }

  function emissions(value: number | null | undefined): string {
    if (value === null || value === undefined || !Number.isFinite(value)) return "\u2014";
    const magnitude = Math.abs(value);
    if (magnitude >= 1000) return number(value, 0);
    if (magnitude >= 1) return number(value, 1);
    return number(value, 3);
  }

  function percent(value: number | null | undefined, decimals = 1): string {
    if (value === null || value === undefined || !Number.isFinite(value)) return "\u2014";
    return `${number(value, decimals)}%`;
  }

  function fraction(value: number | null | undefined, decimals = 1): string {
    if (value === null || value === undefined || !Number.isFinite(value)) return "\u2014";
    return percent(value * 100, decimals);
  }

  function currency(
    value: number | null | undefined,
    cur = locale === "ko" ? "KRW" : "USD",
    decimals = 0,
  ): string {
    if (value === null || value === undefined || !Number.isFinite(value)) return "\u2014";
    return new Intl.NumberFormat(tag, {
      style: "currency",
      currency: cur,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value);
  }

  function date(value: Date | string | null | undefined): string {
    if (!value) return "\u2014";
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return "\u2014";
    return d.toISOString().slice(0, 10);
  }

  function dateTime(value: Date | string | null | undefined): string {
    if (!value) return "\u2014";
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return "\u2014";
    return `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 16)}`;
  }

  function month(value: Date | string | null | undefined): string {
    if (!value) return "\u2014";
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return "\u2014";
    return d.toISOString().slice(0, 7);
  }

  function sl(scope: string): string {
    return SCOPE_LABELS[locale][scope] ?? humaniseEnumFn(scope);
  }

  function humaniseEnumFn(value: string | null | undefined): string {
    if (!value) return "\u2014";
    const words = value.replace(/_/g, " ").toLowerCase().trim();
    return words.charAt(0).toUpperCase() + words.slice(1);
  }

  return {
    number,
    emissions,
    percent,
    fraction,
    currency,
    date,
    dateTime,
    month,
    scopeLabel: sl,
    humaniseEnum: humaniseEnumFn,
  };
}

// ─── Backwards-compatible top-level functions (use default locale) ────────────

const defaultFmt = createFormatter(DEFAULT_LOCALE);

/** Thousands-separated number with a fixed number of decimals. */
export function formatNumber(value: number | null | undefined, decimals = 0): string {
  return defaultFmt.number(value, decimals);
}

export function formatEmissions(value: number | null | undefined): string {
  return defaultFmt.emissions(value);
}

export function formatPercent(value: number | null | undefined, decimals = 1): string {
  return defaultFmt.percent(value, decimals);
}

export function formatFraction(value: number | null | undefined, decimals = 1): string {
  return defaultFmt.fraction(value, decimals);
}

export function formatCurrency(
  value: number | null | undefined,
  currency = "KRW",
  decimals = 0,
): string {
  return defaultFmt.currency(value, currency, decimals);
}

export function formatDate(value: Date | string | null | undefined): string {
  return defaultFmt.date(value);
}

export function formatDateTime(value: Date | string | null | undefined): string {
  return defaultFmt.dateTime(value);
}

export function formatMonth(value: Date | string | null | undefined): string {
  return defaultFmt.month(value);
}

export function humaniseEnum(value: string | null | undefined): string {
  return defaultFmt.humaniseEnum(value);
}

export function scopeLabel(scope: string): string {
  return defaultFmt.scopeLabel(scope);
}

/** Truncates a long identifier for display without hiding that it was cut. */
export function truncate(value: string, max = 40): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}\u2026`;
}
