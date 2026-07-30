/**
 * Chart palette.
 *
 * One place for the colours so Scope 1 is the same shade on the dashboard, the
 * analytics page and the disclosure report. Fixed hex values rather than CSS
 * variables because recharts renders SVG attributes, not classes.
 */

export const SCOPE_COLORS = {
  scope1: "#ef4444",
  scope2: "#3b82f6",
  scope2Market: "#6366f1",
  scope3: "#10b981",
} as const;

export const SERIES_COLORS = [
  "#10b981",
  "#3b82f6",
  "#f59e0b",
  "#8b5cf6",
  "#ef4444",
  "#14b8a6",
  "#ec4899",
  "#6366f1",
  "#84cc16",
  "#f97316",
] as const;

export const PATHWAY_COLORS = {
  actual: "#111827",
  pathway: "#10b981",
  scenario: "#3b82f6",
  budget: "#f59e0b",
} as const;

/** Tooltip surface that reads on both themes without a CSS variable. */
export const chartTooltipStyle = {
  borderRadius: 8,
  border: "1px solid rgba(107,114,128,0.35)",
  background: "rgba(255,255,255,0.97)",
  color: "#111827",
  fontSize: 11,
} as const;

/** Deterministic colour for an arbitrary series key. */
export function seriesColor(index: number): string {
  return SERIES_COLORS[index % SERIES_COLORS.length];
}

/**
 * Numeric coercion for a recharts tooltip value.
 *
 * Recharts types tooltip callback arguments as a wide union, so the formatters
 * below accept `unknown` and narrow here. That is contravariantly assignable to
 * recharts' `Formatter` type without a cast.
 */
export function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export function formatChartNumber(value: unknown, maximumFractionDigits = 1): string {
  return toNumber(value).toLocaleString("en-US", { maximumFractionDigits });
}

/** `[formattedValue, seriesName]` tuple recharts expects from a tooltip formatter. */
export function quantityTooltip(unit: string, decimals = 1) {
  return (value: unknown, name: unknown): [string, string] => [
    `${formatChartNumber(value, decimals)} ${unit}`,
    String(name ?? ""),
  ];
}
