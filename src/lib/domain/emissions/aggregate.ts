/**
 * Inventory aggregation, hierarchy roll-up, consolidation, intensity and allocation.
 *
 * Everything here operates on plain `EmissionResultLike` records — the shape a
 * persisted `EmissionResult` row has — so the same code aggregates fixtures and
 * database rows identically.
 *
 * Pure TypeScript — no framework, database or network imports.
 */

import type { GHGScope, OrganizationTier, Scope3Category } from "@/lib/core/enums";
import { CalculationError } from "@/lib/core/errors";
import { safeDivide, sum } from "@/lib/core/number";

export type EmissionResultLike = {
  readonly id?: string;
  readonly scope: GHGScope;
  readonly scope3Category?: Scope3Category | null;
  readonly totalCO2e: number;
  readonly biogenicCO2?: number | null;
  readonly unit?: string;
  /**
   * Hierarchy keys. `businessUnitId`, `facilityId` and `emissionSourceId` are
   * columns on `EmissionResult`; `organizationId` and the deeper levels
   * (building / production line / equipment) are resolved by the data layer
   * from the result's emission source and passed in denormalised, because the
   * roll-up must work at all seven `OrganizationTier` levels.
   */
  readonly organizationId?: string | null;
  readonly businessUnitId?: string | null;
  readonly facilityId?: string | null;
  readonly buildingId?: string | null;
  readonly productionLineId?: string | null;
  readonly equipmentId?: string | null;
  readonly emissionSourceId?: string | null;
};

// ---------------------------------------------------------------------------
// Inventory totals
// ---------------------------------------------------------------------------

export type InventoryTotals = {
  readonly scope1Total: number;
  readonly scope2Location: number;
  readonly scope2Market: number;
  readonly scope3Total: number;
  readonly scope3ByCategory: Readonly<Partial<Record<Scope3Category, number>>>;
  /**
   * Scope 1 + Scope 2 + Scope 3. Which Scope 2 figure is used is controlled by
   * `scope2Basis`; the GHG Protocol requires disclosing which one the total uses.
   */
  readonly totalEmissions: number;
  readonly scope2Basis: "LOCATION" | "MARKET";
  /** Biogenic CO2, reported outside the scope totals. */
  readonly biogenicCO2: number;
  readonly unit: string;
  readonly resultCount: number;
};

export type BuildInventoryOptions = {
  /** Which Scope 2 figure feeds `totalEmissions`. Defaults to `LOCATION`. */
  readonly scope2Basis?: "LOCATION" | "MARKET";
  readonly unit?: string;
};

/** Aggregates results into the columns of the `EmissionInventory` model. */
export function buildInventory(
  results: readonly EmissionResultLike[],
  options: BuildInventoryOptions = {},
): InventoryTotals {
  const scope2Basis = options.scope2Basis ?? "LOCATION";
  const scope3ByCategory: Partial<Record<Scope3Category, number>> = {};

  let scope1Total = 0;
  let scope2Location = 0;
  let scope2Market = 0;
  let scope3Total = 0;
  let biogenicCO2 = 0;

  for (const result of results) {
    if (!Number.isFinite(result.totalCO2e)) {
      throw new CalculationError("Emission result total must be finite", {
        resultId: result.id ?? null,
        totalCO2e: result.totalCO2e,
      });
    }
    biogenicCO2 += result.biogenicCO2 ?? 0;

    switch (result.scope) {
      case "SCOPE_1":
        scope1Total += result.totalCO2e;
        break;
      case "SCOPE_2_LOCATION":
        scope2Location += result.totalCO2e;
        break;
      case "SCOPE_2_MARKET":
        scope2Market += result.totalCO2e;
        break;
      case "SCOPE_3": {
        scope3Total += result.totalCO2e;
        if (result.scope3Category) {
          scope3ByCategory[result.scope3Category] =
            (scope3ByCategory[result.scope3Category] ?? 0) + result.totalCO2e;
        }
        break;
      }
      default: {
        const exhaustive: never = result.scope;
        throw new CalculationError("Unknown GHG scope", { scope: exhaustive });
      }
    }
  }

  const scope2ForTotal = scope2Basis === "MARKET" ? scope2Market : scope2Location;

  return {
    scope1Total,
    scope2Location,
    scope2Market,
    scope3Total,
    scope3ByCategory,
    totalEmissions: scope1Total + scope2ForTotal + scope3Total,
    scope2Basis,
    biogenicCO2,
    unit: options.unit ?? results[0]?.unit ?? "tCO2e",
    resultCount: results.length,
  };
}

// ---------------------------------------------------------------------------
// Hierarchy roll-up
// ---------------------------------------------------------------------------

/** The seven levels of the organisational hierarchy, coarsest first. */
export const ROLLUP_DIMENSIONS = [
  "organizationId",
  "businessUnitId",
  "facilityId",
  "buildingId",
  "productionLineId",
  "equipmentId",
  "emissionSourceId",
] as const;
export type RollupDimension = (typeof ROLLUP_DIMENSIONS)[number];

/** `OrganizationTier` each roll-up dimension corresponds to. */
export const DIMENSION_TIER: Readonly<Record<RollupDimension, OrganizationTier>> = {
  organizationId: "ENTERPRISE",
  businessUnitId: "BUSINESS_UNIT",
  facilityId: "FACILITY",
  buildingId: "BUILDING",
  productionLineId: "PRODUCTION_LINE",
  equipmentId: "EQUIPMENT",
  emissionSourceId: "SOURCE",
};

export type RollupNode = {
  readonly dimension: RollupDimension;
  readonly tier: OrganizationTier;
  /** Entity id, or `null` for results that are unassigned at this level. */
  readonly key: string | null;
  readonly totals: InventoryTotals;
};

/**
 * Groups results by one hierarchy level.
 *
 * Results with no value at that level are grouped under the `null` key, so a
 * roll-up at any level always sums back to the same grand total.
 */
export function rollUp(
  results: readonly EmissionResultLike[],
  dimension: RollupDimension,
  options: BuildInventoryOptions = {},
): readonly RollupNode[] {
  const groups = new Map<string | null, EmissionResultLike[]>();
  for (const result of results) {
    const key = result[dimension] ?? null;
    const bucket = groups.get(key);
    if (bucket) bucket.push(result);
    else groups.set(key, [result]);
  }

  return [...groups.entries()].map(([key, group]) => ({
    dimension,
    tier: DIMENSION_TIER[dimension],
    key,
    totals: buildInventory(group, options),
  }));
}

/** Rolls up at every level at once, for the hierarchy explorer UI. */
export function rollUpAllLevels(
  results: readonly EmissionResultLike[],
  options: BuildInventoryOptions = {},
): Readonly<Record<RollupDimension, readonly RollupNode[]>> {
  return Object.fromEntries(
    ROLLUP_DIMENSIONS.map((dimension) => [dimension, rollUp(results, dimension, options)]),
  ) as Record<RollupDimension, readonly RollupNode[]>;
}

// ---------------------------------------------------------------------------
// Consolidation
// ---------------------------------------------------------------------------

export const CONSOLIDATION_APPROACHES = [
  "OPERATIONAL_CONTROL",
  "FINANCIAL_CONTROL",
  "EQUITY_SHARE",
] as const;
export type ConsolidationApproach = (typeof CONSOLIDATION_APPROACHES)[number];

/** The `Facility` attributes consolidation depends on. */
export type FacilityConsolidationLike = {
  readonly id: string;
  /** `Facility.operationalControl`. */
  readonly operationalControl?: boolean;
  /** `Facility.equityShare`, as a percentage (0–100). */
  readonly equityShare?: number | null;
  /** Financial control, where it differs from operational control. */
  readonly financialControl?: boolean;
};

export type ConsolidatedResult = EmissionResultLike & {
  /** Share of the gross figure attributed to the organisation (0..1). */
  readonly consolidationShare: number;
  /** Figure before consolidation, retained for the audit trail. */
  readonly grossCO2e: number;
};

/**
 * Applies the chosen consolidation approach to each result.
 *
 *  - `OPERATIONAL_CONTROL` 100 % of facilities the organisation operates, 0 % otherwise
 *  - `FINANCIAL_CONTROL`   100 % of facilities it financially controls, 0 % otherwise
 *  - `EQUITY_SHARE`        the facility's equity share
 *
 * Results with no facility are attributed in full: they are corporate-level
 * activities that are inside the boundary by definition.
 */
export function applyConsolidation(
  results: readonly EmissionResultLike[],
  approach: ConsolidationApproach,
  facilities: readonly FacilityConsolidationLike[],
): readonly ConsolidatedResult[] {
  const byId = new Map(facilities.map((facility) => [facility.id, facility]));

  return results.map((result) => {
    const facility = result.facilityId ? byId.get(result.facilityId) : undefined;
    if (result.facilityId && !facility) {
      throw new CalculationError(
        `Cannot consolidate: no facility record for ${result.facilityId}`,
        { facilityId: result.facilityId, resultId: result.id ?? null },
      );
    }

    let share = 1;
    if (facility) {
      switch (approach) {
        case "OPERATIONAL_CONTROL":
          share = facility.operationalControl === false ? 0 : 1;
          break;
        case "FINANCIAL_CONTROL":
          share = (facility.financialControl ?? facility.operationalControl) === false ? 0 : 1;
          break;
        case "EQUITY_SHARE": {
          const percent = facility.equityShare ?? 100;
          if (percent < 0 || percent > 100) {
            throw new CalculationError("equityShare must be between 0 and 100", {
              facilityId: facility.id,
              equityShare: percent,
            });
          }
          share = percent / 100;
          break;
        }
        default: {
          const exhaustive: never = approach;
          throw new CalculationError("Unknown consolidation approach", {
            approach: exhaustive,
          });
        }
      }
    }

    return {
      ...result,
      grossCO2e: result.totalCO2e,
      consolidationShare: share,
      totalCO2e: result.totalCO2e * share,
      biogenicCO2: (result.biogenicCO2 ?? 0) * share,
    };
  });
}

// ---------------------------------------------------------------------------
// Intensity metrics
// ---------------------------------------------------------------------------

export const INTENSITY_DENOMINATORS = [
  "REVENUE",
  "PRODUCTION",
  "AREA",
  "FTE",
  "CUSTOM",
] as const;
export type IntensityDenominator = (typeof INTENSITY_DENOMINATORS)[number];

export type IntensityMetric = {
  readonly denominator: IntensityDenominator;
  readonly numerator: number;
  readonly denominatorValue: number;
  readonly value: number;
  /** e.g. `"tCO2e/MUSD"`, `"tCO2e/t"`, `"tCO2e/sqm"`, `"tCO2e/FTE"`. */
  readonly unit: string;
};

/**
 * Emission intensity. Returns 0 (not Infinity) for a zero denominator so a
 * dashboard cannot render `Infinity`; the caller can detect it via
 * `denominatorValue === 0`.
 */
export function intensity(
  total: number,
  denominator: {
    readonly type: IntensityDenominator;
    readonly value: number;
    readonly unit: string;
  },
  numeratorUnit = "tCO2e",
): IntensityMetric {
  return {
    denominator: denominator.type,
    numerator: total,
    denominatorValue: denominator.value,
    value: safeDivide(total, denominator.value),
    unit: `${numeratorUnit}/${denominator.unit}`,
  };
}

// ---------------------------------------------------------------------------
// Allocation
// ---------------------------------------------------------------------------

export const ALLOCATION_METHODS = [
  "PHYSICAL",
  "ECONOMIC",
  "MASS",
  "ENERGY_CONTENT",
] as const;
export type AllocationMethod = (typeof ALLOCATION_METHODS)[number];

/** One target of an allocation, shaped to `EmissionAllocation`. */
export type AllocationKey = {
  /** `EmissionAllocation.targetEntity`, e.g. `"Product"`. */
  readonly targetEntity: string;
  readonly targetEntityId: string;
  /**
   * The allocation basis in the method's own units: output quantity for
   * PHYSICAL, revenue for ECONOMIC, mass for MASS, energy content for
   * ENERGY_CONTENT.
   */
  readonly basis: number;
};

export type Allocation = {
  readonly allocationMethod: AllocationMethod;
  readonly allocationFactor: number;
  readonly allocatedAmount: number;
  readonly unit: string;
  readonly targetEntity: string;
  readonly targetEntityId: string;
};

/**
 * Splits a total across targets in proportion to the chosen basis.
 *
 * The allocated amounts always sum back to the input total (subject only to
 * floating-point representation), which is what makes an allocation auditable.
 */
export function allocate(
  total: number,
  method: AllocationMethod,
  keys: readonly AllocationKey[],
  unit = "tCO2e",
): readonly Allocation[] {
  if (keys.length === 0) {
    throw new CalculationError("Allocation requires at least one target", { method });
  }
  for (const key of keys) {
    if (!Number.isFinite(key.basis) || key.basis < 0) {
      throw new CalculationError("Allocation basis must be a finite, non-negative number", {
        targetEntityId: key.targetEntityId,
        basis: key.basis,
      });
    }
  }

  const totalBasis = sum(keys.map((key) => key.basis));
  if (totalBasis === 0) {
    throw new CalculationError(
      "Allocation basis sums to zero; cannot apportion emissions",
      { method, targetCount: keys.length },
    );
  }

  return keys.map((key) => {
    const allocationFactor = key.basis / totalBasis;
    return {
      allocationMethod: method,
      allocationFactor,
      allocatedAmount: total * allocationFactor,
      unit,
      targetEntity: key.targetEntity,
      targetEntityId: key.targetEntityId,
    };
  });
}

/** Adds two inventory totals, e.g. to combine subsidiaries. */
export function addInventories(a: InventoryTotals, b: InventoryTotals): InventoryTotals {
  if (a.scope2Basis !== b.scope2Basis) {
    throw new CalculationError("Cannot add inventories with different Scope 2 bases", {
      a: a.scope2Basis,
      b: b.scope2Basis,
    });
  }
  const scope3ByCategory: Partial<Record<Scope3Category, number>> = { ...a.scope3ByCategory };
  for (const [category, value] of Object.entries(b.scope3ByCategory) as [
    Scope3Category,
    number,
  ][]) {
    scope3ByCategory[category] = (scope3ByCategory[category] ?? 0) + value;
  }
  return {
    scope1Total: a.scope1Total + b.scope1Total,
    scope2Location: a.scope2Location + b.scope2Location,
    scope2Market: a.scope2Market + b.scope2Market,
    scope3Total: a.scope3Total + b.scope3Total,
    scope3ByCategory,
    totalEmissions: a.totalEmissions + b.totalEmissions,
    scope2Basis: a.scope2Basis,
    biogenicCO2: a.biogenicCO2 + b.biogenicCO2,
    unit: a.unit,
    resultCount: a.resultCount + b.resultCount,
  };
}
