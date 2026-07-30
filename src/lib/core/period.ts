/**
 * Reporting-period arithmetic.
 *
 * All dates are treated as UTC instants; day counts are inclusive of the start
 * date and exclusive of the end date's remainder, which matches how
 * `ActivityDataEntry.startDate` / `endDate` are populated.
 *
 * Pure TypeScript — no framework, database or network imports.
 */

import { CalculationError } from "./errors";

export const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type ReportingPeriod = {
  readonly start: Date;
  readonly end: Date;
};

export function createPeriod(start: Date, end: Date): ReportingPeriod {
  if (end.getTime() < start.getTime()) {
    throw new CalculationError("Reporting period end precedes its start", {
      start: start.toISOString(),
      end: end.toISOString(),
    });
  }
  return { start, end };
}

/** Whole days spanned by a period, counting both endpoints (1 Jan–1 Jan = 1 day). */
export function periodDays(period: ReportingPeriod): number {
  return Math.floor((period.end.getTime() - period.start.getTime()) / MS_PER_DAY) + 1;
}

/** Days shared by two periods; 0 when they do not overlap. */
export function overlapDays(a: ReportingPeriod, b: ReportingPeriod): number {
  const start = Math.max(a.start.getTime(), b.start.getTime());
  const end = Math.min(a.end.getTime(), b.end.getTime());
  if (end < start) return 0;
  return Math.floor((end - start) / MS_PER_DAY) + 1;
}

/**
 * Scales `value`, recorded over `source`, down to the part that falls inside
 * `target`. Used when an invoice period straddles a reporting-year boundary.
 */
export function prorate(
  value: number,
  source: ReportingPeriod,
  target: ReportingPeriod,
): number {
  const sourceDays = periodDays(source);
  if (sourceDays <= 0) return 0;
  return (value * overlapDays(source, target)) / sourceDays;
}

/**
 * Bounds of the fiscal year containing `reference`.
 *
 * `fiscalYearStart` is the 1-based month the fiscal year opens in (1 = January,
 * so the default is the calendar year). The returned `label` is the calendar
 * year the fiscal year *starts* in.
 */
export function fiscalYearBounds(
  reference: Date,
  fiscalYearStart = 1,
): ReportingPeriod & { readonly label: number } {
  if (!Number.isInteger(fiscalYearStart) || fiscalYearStart < 1 || fiscalYearStart > 12) {
    throw new CalculationError("fiscalYearStart must be a month between 1 and 12", {
      fiscalYearStart,
    });
  }
  const year = reference.getUTCFullYear();
  const monthIndex = reference.getUTCMonth(); // 0-based
  const startYear = monthIndex >= fiscalYearStart - 1 ? year : year - 1;
  const start = new Date(Date.UTC(startYear, fiscalYearStart - 1, 1));
  // Last instant-day of the fiscal year: one day before the next year's start.
  const nextStart = new Date(Date.UTC(startYear + 1, fiscalYearStart - 1, 1));
  const end = new Date(nextStart.getTime() - MS_PER_DAY);
  return { start, end, label: startYear };
}

/** Every whole or partial calendar month touched by `period`, in order. */
export function monthsInPeriod(period: ReportingPeriod): ReportingPeriod[] {
  const months: ReportingPeriod[] = [];
  let cursor = new Date(
    Date.UTC(period.start.getUTCFullYear(), period.start.getUTCMonth(), 1),
  );
  while (cursor.getTime() <= period.end.getTime()) {
    const monthStart = cursor;
    const nextMonth = new Date(
      Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1),
    );
    const monthEnd = new Date(nextMonth.getTime() - MS_PER_DAY);
    months.push({
      start: monthStart.getTime() < period.start.getTime() ? period.start : monthStart,
      end: monthEnd.getTime() > period.end.getTime() ? period.end : monthEnd,
    });
    cursor = nextMonth;
  }
  return months;
}

/** Calendar-year period, handy for `EmissionInventory.reportingYear`. */
export function calendarYear(year: number): ReportingPeriod {
  return {
    start: new Date(Date.UTC(year, 0, 1)),
    end: new Date(Date.UTC(year, 11, 31)),
  };
}
