/**
 * Presentation formatting.
 *
 * Kept out of `src/lib/domain/**` on purpose: the engines return raw numbers and
 * rounding happens only at the presentation boundary (decision 12). Every helper
 * is deterministic and locale-fixed to `en-US`, so a server-rendered figure and its
 * client-hydrated counterpart are byte-identical and React does not warn.
 */

const FIXED_LOCALE = "en-US";

/** Thousands-separated number with a fixed number of decimals. */
export function formatNumber(value: number | null | undefined, decimals = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat(FIXED_LOCALE, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/**
 * Emission quantity. Inventories are meaningful to a few significant figures, so
 * large values lose the decimals and small ones keep them.
 */
export function formatEmissions(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const magnitude = Math.abs(value);
  if (magnitude >= 1000) return formatNumber(value, 0);
  if (magnitude >= 1) return formatNumber(value, 1);
  return formatNumber(value, 3);
}

/** `value` already expressed as a percentage (42 → "42.0%"). */
export function formatPercent(value: number | null | undefined, decimals = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${formatNumber(value, decimals)}%`;
}

/** `value` expressed as a 0..1 fraction (0.42 → "42.0%"). */
export function formatFraction(value: number | null | undefined, decimals = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return formatPercent(value * 100, decimals);
}

export function formatCurrency(
  value: number | null | undefined,
  currency = "USD",
  decimals = 0,
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat(FIXED_LOCALE, {
    style: "currency",
    currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/** ISO date (`2024-03-31`) — stable across time zones because it uses UTC. */
export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toISOString().slice(0, 10);
}

/** ISO date and minute (`2024-03-31 14:05`), UTC. */
export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return `${date.toISOString().slice(0, 10)} ${date.toISOString().slice(11, 16)}`;
}

/** `2024-03` — the month bucket used by the monthly activity series. */
export function formatMonth(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toISOString().slice(0, 7);
}

/** `SCOPE_2_LOCATION` → `Scope 2 location`. */
export function humaniseEnum(value: string | null | undefined): string {
  if (!value) return "—";
  const words = value.replace(/_/g, " ").toLowerCase().trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Short scope label for chart legends and table cells. */
export function scopeLabel(scope: string): string {
  switch (scope) {
    case "SCOPE_1":
      return "Scope 1";
    case "SCOPE_2_LOCATION":
      return "Scope 2 (location)";
    case "SCOPE_2_MARKET":
      return "Scope 2 (market)";
    case "SCOPE_3":
      return "Scope 3";
    default:
      return humaniseEnum(scope);
  }
}

/** Truncates a long identifier for display without hiding that it was cut. */
export function truncate(value: string, max = 40): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}
