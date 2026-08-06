/**
 * Calculation repository.
 *
 * In database mode `listCalculations` reads persisted `EmissionCalculation` rows and
 * `getInventory` aggregates persisted `EmissionResult` rows. In demo mode both run
 * the *real* orchestrator over the fixture activity data — which is the whole point
 * of decision 5: the numbers on screen are computed, never invented.
 */

import type { GHGScope, GwpVersion } from "@/lib/core/enums";
import {
  applyConsolidation,
  buildInventory,
  intensity,
  rollUp,
  type ConsolidationApproach,
  type EmissionResultLike,
  type IntensityDenominator,
  type InventoryTotals,
  type RollupNode,
} from "@/lib/domain/emissions/aggregate";
import {
  runCalculation,
  type CalculationOutcome,
} from "@/lib/domain/emissions/orchestrator";
import { prisma } from "@/lib/prisma";

import { isDemoMode, withDb } from "../db";
import {
  DEMO_BASELINE_YEAR,
  DEMO_CURRENT_YEAR,
  DEMO_EMISSION_FACTORS,
  DEMO_FACILITY_CONSOLIDATION,
  DEMO_ORGANIZATION,
  DEMO_SOURCE_HIERARCHY,
  demoEntriesForYear,
  demoPeriodForYear,
} from "../demo";

import { listCalculationEntries } from "./activity-data";
import { listCandidateFactors } from "./emission-factor";
import { listFacilityConsolidation, getSourceHierarchy } from "./organization";

export const DEFAULT_GWP_VERSION: GwpVersion = "AR6";
export const DEFAULT_CONSOLIDATION: ConsolidationApproach = "OPERATIONAL_CONTROL";

export type CalculationSummary = {
  readonly id: string;
  readonly organizationId: string;
  readonly name: string;
  readonly reportingYear: number;
  readonly scope: GHGScope;
  readonly status: string;
  readonly totalEmissions: number;
  readonly unit: string;
  readonly calculatedAt: Date;
  readonly resultCount: number;
};

export type InventoryView = {
  readonly reportingYear: number;
  readonly totals: InventoryTotals;
  readonly consolidated: InventoryTotals;
  readonly consolidationApproach: ConsolidationApproach;
  readonly gwpVersion: GwpVersion;
  readonly byFacility: readonly RollupNode[];
  readonly byBusinessUnit: readonly RollupNode[];
  readonly results: readonly EmissionResultLike[];
  /** True when the figures were computed on the fly from fixtures. */
  readonly computedFromFixtures: boolean;
};

/**
 * Runs the orchestrator over the fixture data for one year. Memoised, because the
 * dashboard reads the same year from several places in one render pass.
 */
const demoOutcomeCache = new Map<string, CalculationOutcome>();

export function demoCalculationOutcome(
  reportingYear: number,
  options: {
    readonly gwpVersion?: GwpVersion;
    readonly consolidationApproach?: ConsolidationApproach;
    readonly scope2Basis?: "LOCATION" | "MARKET";
  } = {},
): CalculationOutcome {
  const gwpVersion = options.gwpVersion ?? DEFAULT_GWP_VERSION;
  const consolidationApproach = options.consolidationApproach ?? DEFAULT_CONSOLIDATION;
  const scope2Basis = options.scope2Basis ?? "LOCATION";
  const key = `${reportingYear}:${gwpVersion}:${consolidationApproach}:${scope2Basis}`;
  const cached = demoOutcomeCache.get(key);
  if (cached) return cached;

  const outcome = runCalculation({
    organizationId: DEMO_ORGANIZATION.id,
    name: `${reportingYear} 온실가스 인벤토리 (${reportingYear} GHG inventory)`,
    reportingYear,
    period: demoPeriodForYear(reportingYear),
    gwpVersion,
    consolidationApproach,
    scope2Basis,
    facilities: DEMO_FACILITY_CONSOLIDATION,
    candidateFactors: DEMO_EMISSION_FACTORS,
    entries: demoEntriesForYear(reportingYear),
  });
  demoOutcomeCache.set(key, outcome);
  return outcome;
}

/**
 * Unconsolidated fixture results, matching what a persisted `EmissionResult` row
 * holds. `runCalculation` applies consolidation to the records it returns, so the
 * demo fallback for `listEmissionResults` runs with an empty facility list and lets
 * `getInventory` consolidate exactly once — the same number of times as the
 * database path.
 */
export function demoRawResults(
  reportingYear: number,
  options: {
    readonly gwpVersion?: GwpVersion;
    readonly scope2Basis?: "LOCATION" | "MARKET";
  } = {},
): readonly EmissionResultLike[] {
  const gwpVersion = options.gwpVersion ?? DEFAULT_GWP_VERSION;
  const scope2Basis = options.scope2Basis ?? "LOCATION";
  const key = `raw:${reportingYear}:${gwpVersion}:${scope2Basis}`;
  const cached = demoOutcomeCache.get(key);
  if (cached) return cached.results;

  const outcome = runCalculation({
    organizationId: DEMO_ORGANIZATION.id,
    name: `${reportingYear} 온실가스 인벤토리 (${reportingYear} GHG inventory)`,
    reportingYear,
    period: demoPeriodForYear(reportingYear),
    gwpVersion,
    scope2Basis,
    // Every facility neutralised to full control and a 100 % share, so the
    // orchestrator's consolidation pass is a no-op and the caller consolidates
    // exactly once.
    facilities: DEMO_FACILITY_CONSOLIDATION.map((facility) => ({
      id: facility.id,
      operationalControl: true,
      equityShare: 100,
    })),
    candidateFactors: DEMO_EMISSION_FACTORS,
    entries: demoEntriesForYear(reportingYear),
  });
  demoOutcomeCache.set(key, outcome);
  return outcome.results;
}

/** Test hook: clears the memoised demo outcomes. */
export function resetDemoCalculationCache(): void {
  demoOutcomeCache.clear();
}

export async function listCalculations(
  organizationId: string,
  options: {
    readonly reportingYear?: number;
    /** Include SUPERSEDED runs — for audit/history views, never for totals. */
    readonly includeSuperseded?: boolean;
  } = {},
): Promise<readonly CalculationSummary[]> {
  return withDb(
    async () => {
      const rows = await prisma.emissionCalculation.findMany({
        where: {
          organizationId,
          ...(options.reportingYear ? { reportingYear: options.reportingYear } : {}),
          ...(options.includeSuperseded ? {} : { status: "COMPLETED" }),
        },
        orderBy: [{ reportingYear: "desc" }, { calculatedAt: "desc" }],
        include: { _count: { select: { results: true } } },
      });
      return rows.map((row) => ({
        id: row.id,
        organizationId: row.organizationId,
        name: row.name,
        reportingYear: row.reportingYear,
        scope: row.scope,
        status: row.status,
        totalEmissions: row.totalEmissions ?? 0,
        unit: row.unit,
        calculatedAt: row.calculatedAt ?? row.createdAt,
        resultCount: row._count.results,
      }));
    },
    () => {
      const years = options.reportingYear
        ? [options.reportingYear]
        : [DEMO_CURRENT_YEAR, DEMO_BASELINE_YEAR];
      return years.flatMap((year) => {
        const outcome = demoCalculationOutcome(year);
        return outcome.calculationsByScope.map((record, index) => ({
          id: `demo-calculation-${year}-${record.scope.toLowerCase()}-${index}`,
          organizationId: record.organizationId,
          name: `${record.name} — ${record.scope}`,
          reportingYear: record.reportingYear,
          scope: record.scope,
          status: record.status,
          totalEmissions: record.totalEmissions,
          unit: record.unit,
          calculatedAt: record.calculatedAt,
          resultCount: outcome.results.filter((result) => result.scope === record.scope).length,
        }));
      });
    },
  );
}

/**
 * Persisted emission results for a year, denormalised for the roll-up.
 *
 * Scoped to `COMPLETED` calculation runs only. Without this, re-running a
 * calculation for the same organisation/year (see `runCalculationAction`,
 * which marks the previous run `SUPERSEDED` rather than deleting it) would
 * double-count: every historical run's results would sum together instead of
 * only the active one's.
 */
export async function listEmissionResults(
  organizationId: string,
  reportingYear: number,
): Promise<readonly EmissionResultLike[]> {
  const hierarchy = await getSourceHierarchy(organizationId);
  return withDb<readonly EmissionResultLike[]>(
    async () => {
      const rows = await prisma.emissionResult.findMany({
        where: { calculation: { organizationId, reportingYear, status: "COMPLETED" } },
        select: {
          id: true,
          scope: true,
          scope3Category: true,
          totalCO2e: true,
          biogenicCO2: true,
          unit: true,
          businessUnitId: true,
          facilityId: true,
          emissionSourceId: true,
        },
      });
      return rows.map((row) => {
        const path = row.emissionSourceId ? hierarchy[row.emissionSourceId] : undefined;
        return {
          id: row.id,
          scope: row.scope,
          scope3Category: row.scope3Category,
          totalCO2e: row.totalCO2e,
          biogenicCO2: row.biogenicCO2,
          unit: row.unit,
          organizationId,
          businessUnitId: row.businessUnitId ?? path?.businessUnitId ?? null,
          facilityId: row.facilityId ?? path?.facilityId ?? null,
          buildingId: path?.buildingId ?? null,
          productionLineId: path?.productionLineId ?? null,
          equipmentId: path?.equipmentId ?? null,
          emissionSourceId: row.emissionSourceId,
        } satisfies EmissionResultLike;
      });
    },
    () => demoRawResults(reportingYear),
  );
}

/**
 * The inventory view every dashboard reads. Both branches call the same
 * aggregation functions, so a persisted inventory and a computed one are
 * identical in shape and in arithmetic.
 */
export async function getInventory(
  organizationId: string,
  reportingYear: number,
  options: {
    readonly gwpVersion?: GwpVersion;
    readonly consolidationApproach?: ConsolidationApproach;
    readonly scope2Basis?: "LOCATION" | "MARKET";
  } = {},
): Promise<InventoryView> {
  const gwpVersion = options.gwpVersion ?? DEFAULT_GWP_VERSION;
  const consolidationApproach = options.consolidationApproach ?? DEFAULT_CONSOLIDATION;
  const scope2Basis = options.scope2Basis ?? "LOCATION";

  const [results, facilities] = await Promise.all([
    listEmissionResults(organizationId, reportingYear),
    listFacilityConsolidation(organizationId),
  ]);

  const totals = buildInventory(results, { scope2Basis });
  const consolidatedResults = applyConsolidation(results, consolidationApproach, facilities);
  const consolidated = buildInventory(consolidatedResults, { scope2Basis });

  return {
    reportingYear,
    totals,
    consolidated,
    consolidationApproach,
    gwpVersion,
    byFacility: rollUp(results, "facilityId", { scope2Basis }),
    byBusinessUnit: rollUp(results, "businessUnitId", { scope2Basis }),
    results,
    computedFromFixtures: isDemoMode(),
  };
}

/** Full orchestrator output for the calculation detail views. */
export async function getCalculationOutcome(
  organizationId: string,
  reportingYear: number,
  options: {
    readonly gwpVersion?: GwpVersion;
    readonly consolidationApproach?: ConsolidationApproach;
    readonly scope2Basis?: "LOCATION" | "MARKET";
  } = {},
): Promise<CalculationOutcome> {
  const gwpVersion = options.gwpVersion ?? DEFAULT_GWP_VERSION;
  const consolidationApproach = options.consolidationApproach ?? DEFAULT_CONSOLIDATION;
  const scope2Basis = options.scope2Basis ?? "LOCATION";

  const [entries, candidateFactors, facilities] = await Promise.all([
    listCalculationEntries(organizationId, reportingYear),
    listCandidateFactors(organizationId),
    listFacilityConsolidation(organizationId),
  ]);

  return runCalculation({
    organizationId,
    name: `${reportingYear} 온실가스 인벤토리 (${reportingYear} GHG inventory)`,
    reportingYear,
    period: demoPeriodForYear(reportingYear),
    gwpVersion,
    consolidationApproach,
    scope2Basis,
    facilities,
    candidateFactors,
    entries,
  });
}

/** Intensity metrics for the analytics page. */
export function inventoryIntensity(
  totals: InventoryTotals,
  denominator: {
    readonly type: IntensityDenominator;
    readonly value: number;
    readonly unit: string;
  },
) {
  return intensity(totals.totalEmissions, denominator);
}

export { DEMO_SOURCE_HIERARCHY as demoSourceHierarchy };
