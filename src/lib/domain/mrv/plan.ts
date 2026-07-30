/**
 * Digital MRV: monitoring-plan coverage, measurement completeness and evidence
 * packaging.
 *
 * The three questions a verifier asks of a monitoring system are: is every
 * material source actually being monitored, did the readings the plan promised
 * actually happen, and can the evidence be shown to be unaltered. This module
 * answers all three from plain records.
 *
 * Expected reading counts come from `MeasurementFrequency` via
 * `MEASUREMENT_INTERVAL_HOURS`, so an HOURLY parameter over a 30-day period
 * expects 720 readings and a MONTHLY one over a year expects 12.
 *
 * Records are shaped to `MonitoringPlan`, `MonitoringParameter`, `Measurement`
 * and `EvidencePackage`.
 *
 * Pure TypeScript — no framework, database or network imports.
 */

import type { GHGScope, MeasurementFrequency, Scope3Category } from "@/lib/core/enums";
import { CalculationError } from "@/lib/core/errors";
import { clamp, safeDivide, sum } from "@/lib/core/number";
import { periodDays, type ReportingPeriod } from "@/lib/core/period";

import {
  hashEvidenceManifest,
  type EvidenceItem,
  type EvidenceManifest,
} from "../audit/hash";

// ---------------------------------------------------------------------------
// Frequency arithmetic
// ---------------------------------------------------------------------------

/**
 * Hours between readings for each `MeasurementFrequency`.
 *
 * `REAL_TIME` is treated as one reading a minute, which is the finest resolution
 * the IoT ingestion path records. The month, quarter and year intervals use the
 * mean Gregorian year (8 766 h) so a full-year period yields exactly 12, 4 and 1.
 */
export const MEASUREMENT_INTERVAL_HOURS: Readonly<Record<MeasurementFrequency, number>> = {
  REAL_TIME: 1 / 60,
  HOURLY: 1,
  DAILY: 24,
  WEEKLY: 168,
  MONTHLY: 8766 / 12,
  QUARTERLY: 8766 / 4,
  ANNUALLY: 8766,
};

/**
 * Readings a frequency implies over a period.
 *
 * Day counts are inclusive of both endpoints (see `periodDays`), so
 * 1–30 January is 30 days: 720 hourly readings, 30 daily ones, or 1 monthly one.
 */
export function expectedReadings(
  frequency: MeasurementFrequency,
  period: ReportingPeriod,
): number {
  const interval = MEASUREMENT_INTERVAL_HOURS[frequency];
  if (interval === undefined) {
    throw new CalculationError(`Unknown measurement frequency: ${frequency}`, {
      frequency,
    });
  }
  const hours = periodDays(period) * 24;
  return Math.max(0, Math.round(hours / interval));
}

// ---------------------------------------------------------------------------
// Monitoring plan coverage
// ---------------------------------------------------------------------------

/** The `MonitoringParameter` fields coverage depends on. */
export type MonitoringParameterLike = {
  readonly id: string;
  readonly name: string;
  readonly unit: string;
  readonly frequency?: MeasurementFrequency | null;
  readonly methodology?: string | null;
  readonly threshold?: number | null;
  readonly alertOnBreach?: boolean;
  /**
   * Emission source the parameter monitors. Not a column on
   * `MonitoringParameter`; the data layer resolves the association and passes it
   * in denormalised, exactly as the roll-up does for the hierarchy ids.
   */
  readonly emissionSourceId?: string | null;
};

/** The `MonitoringPlan` fields coverage depends on. */
export type MonitoringPlanLike = {
  readonly id: string;
  readonly name: string;
  readonly frequency: MeasurementFrequency;
  readonly startDate: Date;
  readonly endDate?: Date | null;
  readonly status?: string;
  readonly parameters: readonly MonitoringParameterLike[];
};

/** The `EmissionSource` fields coverage depends on. */
export type EmissionSourceLike = {
  readonly id: string;
  readonly name: string;
  readonly code?: string | null;
  readonly scope: GHGScope;
  readonly scope3Category?: Scope3Category | null;
  readonly sourceType?: string | null;
  readonly isActive?: boolean;
  readonly facilityId?: string | null;
};

export type CoveredSource = {
  readonly sourceId: string;
  readonly sourceName: string;
  readonly scope: GHGScope;
  readonly parameterIds: readonly string[];
  readonly parameterCount: number;
  /** Frequencies the covering parameters declare, or the plan's default. */
  readonly frequencies: readonly MeasurementFrequency[];
};

export type UncoveredSource = {
  readonly sourceId: string;
  readonly sourceName: string;
  readonly scope: GHGScope;
  readonly reason: string;
};

export type MonitoringCoverage = {
  readonly planId: string;
  readonly planName: string;
  readonly planFrequency: MeasurementFrequency;
  readonly sourceCount: number;
  readonly coveredSourceCount: number;
  readonly coverage: number;
  readonly covered: readonly CoveredSource[];
  readonly uncovered: readonly UncoveredSource[];
  /** Parameters that reference no source, or a source outside the list. */
  readonly orphanParameterIds: readonly string[];
  readonly isComplete: boolean;
  readonly byScope: Readonly<Partial<Record<GHGScope, { covered: number; total: number }>>>;
};

/**
 * Reports which emission sources the monitoring plan covers.
 *
 * Only active sources are required to be covered; an inactive source is reported
 * as covered-not-required rather than as a gap. Parameters pointing at a source
 * that is not in the list are reported as orphans, because a monitoring plan
 * that measures something outside the boundary is as much of a finding as one
 * that misses something inside it.
 */
export function monitoringPlanCoverage(
  plan: MonitoringPlanLike,
  sources: readonly EmissionSourceLike[],
): MonitoringCoverage {
  const activeSources = sources.filter((source) => source.isActive !== false);
  const sourceIds = new Set(sources.map((source) => source.id));

  const parametersBySource = new Map<string, MonitoringParameterLike[]>();
  const orphanParameterIds: string[] = [];
  for (const parameter of plan.parameters) {
    const sourceId = parameter.emissionSourceId ?? null;
    if (sourceId === null || !sourceIds.has(sourceId)) {
      orphanParameterIds.push(parameter.id);
      continue;
    }
    const bucket = parametersBySource.get(sourceId);
    if (bucket) bucket.push(parameter);
    else parametersBySource.set(sourceId, [parameter]);
  }

  const covered: CoveredSource[] = [];
  const uncovered: UncoveredSource[] = [];
  const byScope: Partial<Record<GHGScope, { covered: number; total: number }>> = {};

  for (const source of activeSources) {
    const bucket = byScope[source.scope] ?? { covered: 0, total: 0 };
    bucket.total += 1;
    const parameters = parametersBySource.get(source.id) ?? [];
    if (parameters.length > 0) {
      bucket.covered += 1;
      covered.push({
        sourceId: source.id,
        sourceName: source.name,
        scope: source.scope,
        parameterIds: parameters.map((parameter) => parameter.id),
        parameterCount: parameters.length,
        frequencies: [
          ...new Set(parameters.map((parameter) => parameter.frequency ?? plan.frequency)),
        ],
      });
    } else {
      uncovered.push({
        sourceId: source.id,
        sourceName: source.name,
        scope: source.scope,
        reason: `No monitoring parameter in plan "${plan.name}" is assigned to this ${source.scope} source.`,
      });
    }
    byScope[source.scope] = bucket;
  }

  return {
    planId: plan.id,
    planName: plan.name,
    planFrequency: plan.frequency,
    sourceCount: activeSources.length,
    coveredSourceCount: covered.length,
    coverage: clamp(safeDivide(covered.length, activeSources.length), 0, 1),
    covered,
    uncovered,
    orphanParameterIds,
    isComplete: uncovered.length === 0,
    byScope,
  };
}

// ---------------------------------------------------------------------------
// Measurement completeness
// ---------------------------------------------------------------------------

/** The `Measurement` fields completeness depends on. */
export type MeasurementLike = {
  readonly id?: string;
  readonly parameter: string;
  readonly value: number;
  readonly unit?: string;
  readonly uncertainty?: number | null;
  readonly frequency?: MeasurementFrequency | null;
  readonly measuredAt: Date;
  readonly verifiedAt?: Date | null;
  /** Parameter the reading belongs to, when the id is known. */
  readonly monitoringParameterId?: string | null;
};

export type ParameterCompleteness = {
  readonly parameterId: string;
  readonly parameterName: string;
  readonly frequency: MeasurementFrequency;
  readonly expected: number;
  readonly recorded: number;
  readonly verified: number;
  readonly completeness: number;
  readonly missing: number;
  /** Readings recorded beyond the expected count. */
  readonly surplus: number;
  readonly readingsOutsidePeriod: number;
  readonly unitMismatches: number;
};

export type MeasurementCompleteness = {
  readonly parameters: readonly ParameterCompleteness[];
  readonly totalExpected: number;
  readonly totalRecorded: number;
  readonly totalVerified: number;
  readonly completeness: number;
  readonly verifiedShare: number;
  readonly period: ReportingPeriod;
  /** Parameters with no readings at all. */
  readonly unmeasuredParameterIds: readonly string[];
  /** Readings that match no parameter in the plan. */
  readonly unmatchedMeasurementCount: number;
  readonly isComplete: boolean;
};

/**
 * Compares recorded readings against the count the frequency implies.
 *
 * A parameter's own `frequency` wins over the fallback; `defaultFrequency` covers
 * parameters that inherit the plan's. Readings are matched on
 * `monitoringParameterId` where present and otherwise on `parameter` name, which
 * is how manual and file-imported readings arrive.
 */
export function measurementCompleteness(
  parameters: readonly MonitoringParameterLike[],
  measurements: readonly MeasurementLike[],
  defaultFrequency: MeasurementFrequency,
  period: ReportingPeriod,
): MeasurementCompleteness {
  if (period.end.getTime() < period.start.getTime()) {
    throw new CalculationError("Measurement period end precedes its start", {
      start: period.start.toISOString(),
      end: period.end.toISOString(),
    });
  }

  const matched = new Set<MeasurementLike>();
  const rows: ParameterCompleteness[] = parameters.map((parameter) => {
    const frequency = parameter.frequency ?? defaultFrequency;
    const expected = expectedReadings(frequency, period);

    const readings = measurements.filter((measurement) => {
      const byId =
        measurement.monitoringParameterId !== undefined &&
        measurement.monitoringParameterId !== null &&
        measurement.monitoringParameterId === parameter.id;
      const byName =
        (measurement.monitoringParameterId === undefined ||
          measurement.monitoringParameterId === null) &&
        measurement.parameter === parameter.name;
      if (byId || byName) {
        matched.add(measurement);
        return true;
      }
      return false;
    });

    const inPeriod = readings.filter(
      (reading) =>
        reading.measuredAt.getTime() >= period.start.getTime() &&
        reading.measuredAt.getTime() <= period.end.getTime() + 24 * 60 * 60 * 1000 - 1,
    );

    return {
      parameterId: parameter.id,
      parameterName: parameter.name,
      frequency,
      expected,
      recorded: inPeriod.length,
      verified: inPeriod.filter((reading) => reading.verifiedAt != null).length,
      completeness: clamp(safeDivide(inPeriod.length, expected), 0, 1),
      missing: Math.max(0, expected - inPeriod.length),
      surplus: Math.max(0, inPeriod.length - expected),
      readingsOutsidePeriod: readings.length - inPeriod.length,
      unitMismatches: inPeriod.filter(
        (reading) => reading.unit !== undefined && reading.unit !== parameter.unit,
      ).length,
    };
  });

  const totalExpected = sum(rows.map((row) => row.expected));
  const totalRecorded = sum(rows.map((row) => row.recorded));

  return {
    parameters: rows,
    totalExpected,
    totalRecorded,
    totalVerified: sum(rows.map((row) => row.verified)),
    completeness: clamp(safeDivide(Math.min(totalRecorded, totalExpected), totalExpected), 0, 1),
    verifiedShare: clamp(
      safeDivide(sum(rows.map((row) => row.verified)), totalRecorded),
      0,
      1,
    ),
    period,
    unmeasuredParameterIds: rows
      .filter((row) => row.recorded === 0)
      .map((row) => row.parameterId),
    unmatchedMeasurementCount: measurements.filter(
      (measurement) => !matched.has(measurement),
    ).length,
    isComplete: rows.every((row) => row.missing === 0),
  };
}

// ---------------------------------------------------------------------------
// Evidence packaging
// ---------------------------------------------------------------------------

/** Plain object shaped to the `EvidencePackage` model. */
export type EvidencePackageRecord = {
  readonly name: string;
  readonly description: string | null;
  readonly type: string | null;
  readonly fileCount: number;
  readonly totalSize: number | null;
  readonly hash: string;
  readonly status: string;
  readonly submittedAt: Date | null;
  /** Per-item digests, for the `AuditEvidence` rows. */
  readonly manifest: EvidenceManifest;
};

export type BuildEvidencePackageOptions = {
  readonly name?: string;
  readonly description?: string;
  readonly type?: string;
  readonly submittedAt?: Date;
  readonly status?: string;
};

/**
 * Hashes a set of evidence items into a submittable package.
 *
 * The package hash is computed by `hashEvidenceManifest` over the id-sorted
 * per-item digests, so it is independent of the order files were added and any
 * change to any file changes it. An empty package is rejected: submitting
 * nothing is not the same as submitting evidence.
 */
export function buildEvidencePackage(
  items: readonly EvidenceItem[],
  options: BuildEvidencePackageOptions = {},
): EvidencePackageRecord {
  if (items.length === 0) {
    throw new CalculationError("An evidence package requires at least one item", {});
  }
  const manifest = hashEvidenceManifest(items);
  return {
    name: options.name ?? `Evidence package (${manifest.fileCount} item(s))`,
    description: options.description ?? null,
    type: options.type ?? null,
    fileCount: manifest.fileCount,
    totalSize: manifest.totalSize,
    hash: manifest.packageHash,
    status: options.status ?? "pending",
    submittedAt: options.submittedAt ?? null,
    manifest,
  };
}
