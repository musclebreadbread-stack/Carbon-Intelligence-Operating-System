/**
 * Audit-log retention.
 *
 * Pure date math for deciding which `AuditTrail` rows are past their retention
 * window. `asOf` defaults to a fixed reference date rather than `new Date()`, the
 * same reproducibility convention `verification/findings.ts` uses for `asOf` —
 * a retention decision computed today must compute the same way in a test run
 * next year.
 *
 * Pure TypeScript — no framework, database or network imports.
 */

import { CalculationError } from "@/lib/core/errors";

export const DEFAULT_AUDIT_RETENTION_DAYS = 365;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const REFERENCE_NOW = new Date(Date.UTC(2024, 0, 1));

function assertRetentionDays(retentionDays: number): void {
  if (!Number.isFinite(retentionDays) || retentionDays <= 0) {
    throw new CalculationError("retentionDays must be a positive number of days", {
      retentionDays,
    });
  }
}

/** Instant before which a row is past the retention window. */
export function retentionCutoff(
  retentionDays: number = DEFAULT_AUDIT_RETENTION_DAYS,
  asOf: Date = REFERENCE_NOW,
): Date {
  assertRetentionDays(retentionDays);
  return new Date(asOf.getTime() - retentionDays * MS_PER_DAY);
}

/** Whether `timestamp` is older than the retention window. */
export function isPastRetention(
  timestamp: Date,
  retentionDays: number = DEFAULT_AUDIT_RETENTION_DAYS,
  asOf: Date = REFERENCE_NOW,
): boolean {
  return timestamp.getTime() < retentionCutoff(retentionDays, asOf).getTime();
}

/** Splits rows into those to archive (past retention) and those to keep. */
export function partitionByRetention<T extends { readonly timestamp: Date }>(
  rows: readonly T[],
  retentionDays: number = DEFAULT_AUDIT_RETENTION_DAYS,
  asOf: Date = REFERENCE_NOW,
): { readonly toArchive: readonly T[]; readonly toKeep: readonly T[] } {
  const cutoff = retentionCutoff(retentionDays, asOf);
  const toArchive: T[] = [];
  const toKeep: T[] = [];
  for (const row of rows) {
    (row.timestamp.getTime() < cutoff.getTime() ? toArchive : toKeep).push(row);
  }
  return { toArchive, toKeep };
}
