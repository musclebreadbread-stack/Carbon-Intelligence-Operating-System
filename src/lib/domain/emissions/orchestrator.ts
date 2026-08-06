/**
 * The calculation orchestrator: one activity data set in, a complete, auditable
 * calculation out.
 *
 * For every entry it
 *   1. resolves the applicable emission factor(s)   (factors/resolve-factor)
 *   2. dispatches to the right scope engine         (scope1 / scope2 / scope3)
 *   3. normalises units                             (units/convert, via the kernel)
 *   4. scores data quality                          (quality/score)
 * and then, across all entries,
 *   5. aggregates and consolidates the inventory    (aggregate)
 *   6. propagates and simulates uncertainty         (uncertainty)
 *   7. emits lineage descriptors                    (lineage/types)
 *
 * Everything returned is a plain object shaped to `EmissionCalculation`,
 * `EmissionResult`, `UncertaintyAnalysis`, `DataQualityScore` and
 * `CalculationTrace`. Nothing here touches Prisma, Next or Supabase.
 */

import type {
  CalculationApproach,
  CalculationRunStatus,
  DataQualityLevel,
  GHGScope,
  GwpVersion,
  Scope3Category,
} from "@/lib/core/enums";
import { CalculationError } from "@/lib/core/errors";
import type { ReportingPeriod } from "@/lib/core/period";
import { FACTOR_DENOMINATOR_UNIT } from "@/lib/reference/units";

import { resolveFactor } from "../factors/resolve-factor";
import type { EmissionFactorLike, FactorSpecificity } from "../factors/types";
import type {
  LineageDescriptorSet,
  LineageEdgeDescriptor,
  LineageNodeDescriptor,
} from "../lineage/types";
import {
  aggregateQuality,
  scoreEntry,
  toDataQualityScoreRecord,
  type AggregateQuality,
  type MeasurementType,
  type QualityScore,
} from "../quality/score";

import {
  applyConsolidation,
  buildInventory,
  type ConsolidationApproach,
  type EmissionResultLike,
  type FacilityConsolidationLike,
  type InventoryTotals,
} from "./aggregate";
import {
  calculateFugitiveEmissions,
  calculateMobileCombustion,
  calculateProcessEmissions,
  calculateStationaryCombustion,
} from "./scope1";
import { calculateLocationBased, calculateMarketBased, type ContractualInstrument } from "./scope2";
import { calculateScope3Generic } from "./scope3";
import type {
  ActivityFactorSet,
  EmissionCalcTrace,
  EmissionComputation,
  GasBreakdown,
} from "./types";
import {
  monteCarlo,
  propagateUncertainty,
  toUncertaintyRecord,
  type MonteCarloOptions,
  type UncertaintyAnalysisRecord,
  type UncertaintyComponent,
} from "./uncertainty";

// ---------------------------------------------------------------------------
// Request
// ---------------------------------------------------------------------------

export const SCOPE1_SOURCE_TYPES = ["STATIONARY", "MOBILE", "PROCESS", "FUGITIVE"] as const;
export type Scope1SourceType = (typeof SCOPE1_SOURCE_TYPES)[number];

/** One row of activity data to calculate, shaped like an `ActivityDataEntry`. */
export type CalculationEntry = {
  readonly id: string;
  readonly name?: string;
  readonly quantity: number;
  readonly unit: string;
  /** Period the activity covers; defaults to the calculation period. */
  readonly dataPeriod?: ReportingPeriod;
  readonly scope: GHGScope;
  readonly scope3Category?: Scope3Category | null;
  /** Required when `scope` is `SCOPE_1`. */
  readonly scope1SourceType?: Scope1SourceType;
  readonly approach?: CalculationApproach;

  // Factor selection criteria
  readonly region?: string | null;
  readonly country?: string | null;
  readonly sector?: string | null;
  readonly supplierId?: string | null;
  readonly factorSourceId?: string | null;
  /**
   * Gases to resolve a factor for. `["CO2e"]` (the default) resolves a single
   * pre-aggregated factor; `["CO2", "CH4_FOSSIL", "N2O"]` resolves one factor per
   * gas so the chosen GWP vintage is applied by the engine.
   */
  readonly gasTypes?: readonly string[];

  // Hierarchy
  readonly businessUnitId?: string | null;
  readonly facilityId?: string | null;
  readonly buildingId?: string | null;
  readonly productionLineId?: string | null;
  readonly equipmentId?: string | null;
  readonly emissionSourceId?: string | null;

  // Engine-specific extras
  readonly mobileMethod?: "FUEL" | "DISTANCE";
  readonly process?: {
    readonly purity?: number;
    readonly calcinationFraction?: number;
  };
  readonly fugitive?: {
    readonly method: "SCREENING" | "MATERIAL_BALANCE";
    readonly gas?: string;
    readonly blend?: string;
    readonly inventoryChange: number;
    readonly purchases: number;
    readonly disposals: number;
    readonly capacityChange?: number;
  };
  readonly market?: {
    readonly instruments?: readonly ContractualInstrument[];
  };
  /** Share of the fuel's carbon that is biomass-derived (0..1). */
  readonly biogenicFraction?: number;

  // Quality and uncertainty metadata
  readonly measurementType?: MeasurementType;
  readonly isEstimated?: boolean;
  readonly hasEvidence?: boolean;
  readonly requiredFields?: readonly string[];
  readonly providedFields?: readonly string[];
  readonly unitConsistent?: boolean;
  readonly sourceConsistentWithPriorPeriod?: boolean;
  readonly methodConsistentWithPriorPeriod?: boolean;
  /** Relative uncertainty of the activity quantity, in per cent. */
  readonly activityDataUncertainty?: number;
  /** Relative uncertainty of the methodology, in per cent. */
  readonly methodologyUncertainty?: number;
};

export type CalculationRequest = {
  readonly organizationId: string;
  readonly name: string;
  readonly reportingYear: number;
  readonly period: ReportingPeriod;
  readonly gwpVersion: GwpVersion;
  readonly approach?: CalculationApproach;
  readonly consolidationApproach?: ConsolidationApproach;
  readonly scope2Basis?: "LOCATION" | "MARKET";
  readonly facilities?: readonly FacilityConsolidationLike[];
  readonly candidateFactors: readonly EmissionFactorLike[];
  readonly entries: readonly CalculationEntry[];
  /** Timestamp stamped on the records; defaults to the period end for determinism. */
  readonly calculatedAt?: Date;
  /** Enables the Monte Carlo pass in addition to analytical propagation. */
  readonly monteCarlo?: MonteCarloOptions;
};

// ---------------------------------------------------------------------------
// Response
// ---------------------------------------------------------------------------

/** Plain object shaped to `EmissionCalculation`. */
export type EmissionCalculationRecord = {
  readonly organizationId: string;
  readonly name: string;
  readonly reportingYear: number;
  readonly reportingPeriodStart: Date;
  readonly reportingPeriodEnd: Date;
  /**
   * `EmissionCalculation.scope` is single-valued, so a mixed-scope run reports
   * the scope with the largest total here. `calculationsByScope` carries one
   * persistable record per scope group.
   */
  readonly scope: GHGScope;
  readonly scope3Category: Scope3Category | null;
  readonly approach: CalculationApproach;
  readonly status: CalculationRunStatus;
  readonly totalEmissions: number;
  readonly unit: string;
  readonly calculatedAt: Date;
  /**
   * Methodology basis snapshot: the values in effect when this run executed,
   * so a later change to global defaults never silently reinterprets a past
   * run. See `EmissionCalculation.gwpVersion`/`scope2Basis`/`consolidationApproach`.
   */
  readonly gwpVersion: GwpVersion;
  readonly scope2Basis: "LOCATION" | "MARKET";
  readonly consolidationApproach: ConsolidationApproach;
};

/** Plain object shaped to `EmissionResult`. */
export type EmissionResultRecord = EmissionResultLike & {
  readonly id: string;
  readonly co2Emissions: number;
  readonly ch4Emissions: number;
  readonly n2oEmissions: number;
  readonly hfcEmissions: number;
  readonly pfcEmissions: number;
  readonly sf6Emissions: number;
  readonly nf3Emissions: number;
  readonly totalCO2e: number;
  readonly biogenicCO2: number;
  readonly unit: string;
  readonly dataQuality: DataQualityLevel;
  readonly emissionFactorId: string | null;
  readonly activityDataEntryId: string;
  readonly calculatedAt: Date;
  /** Engine method label, for the methodology disclosure. */
  readonly method: string;
};

/** Plain object shaped to a `CalculationTrace` group. */
export type ResultTrace = {
  readonly resultId: string;
  readonly activityDataEntryId: string;
  readonly steps: EmissionCalcTrace;
};

export type CalculationOutcome = {
  readonly calculation: EmissionCalculationRecord;
  readonly calculationsByScope: readonly EmissionCalculationRecord[];
  readonly results: readonly EmissionResultRecord[];
  readonly inventory: InventoryTotals;
  readonly uncertainty: UncertaintyAnalysisRecord;
  readonly traces: readonly ResultTrace[];
  readonly lineage: LineageDescriptorSet;
  readonly quality: {
    readonly byResultId: Readonly<Record<string, QualityScore>>;
    readonly records: readonly (ReturnType<typeof toDataQualityScoreRecord> & {
      readonly activityDataEntryId: string;
    })[];
    readonly aggregate: AggregateQuality;
  };
  /** Factor-selection rationale per entry, for the audit trail. */
  readonly factorSelections: Readonly<Record<string, readonly string[]>>;
};

// ---------------------------------------------------------------------------
// Factor bridging
// ---------------------------------------------------------------------------

/**
 * Turns resolved `EmissionFactor` rows into the `ActivityFactorSet` the engines
 * consume. A `gasType` of `"CO2e"` becomes a pre-aggregated CO2e factor; any
 * other gas becomes a per-gas mass factor so the engine applies the GWP.
 */
export function factorSetFromFactors(
  factors: readonly EmissionFactorLike[],
  options: { readonly biogenicFraction?: number } = {},
): ActivityFactorSet {
  if (factors.length === 0) {
    throw new CalculationError("Cannot build a factor set from zero factors", {});
  }
  const denominatorUnits = new Set(
    factors.map((factor) => FACTOR_DENOMINATOR_UNIT[factor.unit]),
  );
  if (denominatorUnits.size !== 1 || denominatorUnits.has(undefined as never)) {
    throw new CalculationError(
      "All factors for one entry must share a known denominator unit",
      { units: factors.map((factor) => factor.unit) },
    );
  }
  const denominatorUnit = [...denominatorUnits][0];

  const perGasKg: Record<string, number> = {};
  let co2eKgPerUnit: number | undefined;
  const uncertainties: number[] = [];

  for (const factor of factors) {
    if (factor.uncertainty !== null && factor.uncertainty !== undefined) {
      uncertainties.push(factor.uncertainty);
    }
    if (factor.gasType === "CO2e") {
      co2eKgPerUnit = (co2eKgPerUnit ?? 0) + factor.value;
    } else {
      perGasKg[factor.gasType] = (perGasKg[factor.gasType] ?? 0) + factor.value;
    }
  }

  return {
    denominatorUnit,
    perGasKg: Object.keys(perGasKg).length > 0 ? perGasKg : undefined,
    co2eKgPerUnit,
    factorId: factors[0].id,
    factorName: factors[0].name,
    // The worst stated factor uncertainty governs the set.
    uncertainty: uncertainties.length > 0 ? Math.max(...uncertainties) : null,
    biogenicFraction: options.biogenicFraction,
  };
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

type ResolvedEntry = {
  readonly entry: CalculationEntry;
  readonly computation: EmissionComputation;
  readonly factorIds: readonly string[];
  readonly specificity: FactorSpecificity;
  readonly rationale: readonly string[];
  readonly factorUncertaintyPercent: number;
};

function resolveEntryFactors(
  entry: CalculationEntry,
  request: CalculationRequest,
): {
  readonly factors: readonly EmissionFactorLike[];
  readonly specificity: FactorSpecificity;
  readonly rationale: readonly string[];
} {
  const gasTypes = entry.gasTypes ?? ["CO2e"];
  const date = (entry.dataPeriod ?? request.period).end;
  const factors: EmissionFactorLike[] = [];
  const rationale: string[] = [];
  let specificity: FactorSpecificity = "ORGANIZATION_SPECIFIC";
  let weakest = Number.POSITIVE_INFINITY;

  for (const gasType of gasTypes) {
    const selection = resolveFactor(request.candidateFactors, {
      date,
      scope: entry.scope,
      scope3Category: entry.scope3Category ?? null,
      region: entry.region ?? null,
      country: entry.country ?? null,
      sector: entry.sector ?? null,
      organizationId: request.organizationId,
      supplierId: entry.supplierId ?? null,
      unit: entry.unit,
      sourceId: entry.factorSourceId ?? null,
      gasType,
    });
    factors.push(selection.factor);
    rationale.push(...selection.selectionRationale);
    if (selection.score < weakest) {
      weakest = selection.score;
      specificity = selection.specificity;
    }
  }

  return { factors, specificity, rationale };
}

function runEngine(
  entry: CalculationEntry,
  request: CalculationRequest,
  factorSet: ActivityFactorSet | null,
): EmissionComputation {
  const gwpVersion = request.gwpVersion;
  const label = entry.name ?? entry.id;

  if (entry.scope === "SCOPE_1") {
    const sourceType = entry.scope1SourceType;
    if (!sourceType) {
      throw new CalculationError(
        `Entry ${entry.id} is Scope 1 but declares no scope1SourceType`,
        { entryId: entry.id },
      );
    }
    if (sourceType === "FUGITIVE") {
      if (!entry.fugitive) {
        throw new CalculationError(
          `Entry ${entry.id} is a fugitive source but carries no fugitive balance`,
          { entryId: entry.id },
        );
      }
      return calculateFugitiveEmissions({
        method: entry.fugitive.method,
        gwpVersion,
        gas: entry.fugitive.gas as never,
        blend: entry.fugitive.blend,
        inventoryChange: entry.fugitive.inventoryChange,
        purchases: entry.fugitive.purchases,
        disposals: entry.fugitive.disposals,
        capacityChange: entry.fugitive.capacityChange,
        sourceName: label,
      });
    }
    if (!factorSet) {
      throw new CalculationError(`Entry ${entry.id} requires an emission factor`, {
        entryId: entry.id,
      });
    }
    switch (sourceType) {
      case "STATIONARY":
        return calculateStationaryCombustion({
          quantity: entry.quantity,
          unit: entry.unit,
          factors: factorSet,
          gwpVersion,
          fuelName: label,
        });
      case "MOBILE":
        return calculateMobileCombustion({
          method: entry.mobileMethod ?? "FUEL",
          quantity: entry.quantity,
          unit: entry.unit,
          factors: factorSet,
          gwpVersion,
          vehicleName: label,
        });
      case "PROCESS":
        return calculateProcessEmissions({
          quantity: entry.quantity,
          unit: entry.unit,
          factors: factorSet,
          gwpVersion,
          purity: entry.process?.purity,
          calcinationFraction: entry.process?.calcinationFraction,
          processName: label,
        });
      default: {
        const exhaustive: never = sourceType;
        throw new CalculationError("Unknown Scope 1 source type", { sourceType: exhaustive });
      }
    }
  }

  if (!factorSet) {
    throw new CalculationError(`Entry ${entry.id} requires an emission factor`, {
      entryId: entry.id,
    });
  }

  if (entry.scope === "SCOPE_2_LOCATION") {
    return calculateLocationBased({
      quantity: entry.quantity,
      unit: entry.unit,
      gridFactor: factorSet,
      gwpVersion,
      label,
    });
  }

  if (entry.scope === "SCOPE_2_MARKET") {
    return calculateMarketBased({
      quantity: entry.quantity,
      unit: entry.unit,
      gwpVersion,
      instruments: entry.market?.instruments,
      residualMixFactor: factorSet,
      label,
    });
  }

  if (!entry.scope3Category) {
    throw new CalculationError(
      `Entry ${entry.id} is Scope 3 but declares no scope3Category`,
      { entryId: entry.id },
    );
  }
  return calculateScope3Generic(entry.scope3Category, {
    quantity: entry.quantity,
    unit: entry.unit,
    factors: factorSet,
    gwpVersion,
    approach: entry.approach,
    label,
  });
}

function gasesToResultColumns(gases: GasBreakdown) {
  return {
    co2Emissions: gases.co2Emissions,
    ch4Emissions: gases.ch4Emissions,
    n2oEmissions: gases.n2oEmissions,
    hfcEmissions: gases.hfcEmissions,
    pfcEmissions: gases.pfcEmissions,
    sf6Emissions: gases.sf6Emissions,
    nf3Emissions: gases.nf3Emissions,
    totalCO2e: gases.totalCO2e,
    biogenicCO2: gases.biogenicCO2,
    unit: gases.unit,
  };
}

/** Deterministic synthetic result id, so re-running produces stable references. */
export function resultIdFor(entry: CalculationEntry): string {
  return `result-${entry.id}`;
}

/** Structural validation of an entry, independent of factor availability. */
function validateEntry(entry: CalculationEntry): void {
  if (entry.scope === "SCOPE_1") {
    if (!entry.scope1SourceType) {
      throw new CalculationError(
        `Entry ${entry.id} is Scope 1 but declares no scope1SourceType`,
        { entryId: entry.id },
      );
    }
    if (entry.scope1SourceType === "FUGITIVE" && !entry.fugitive) {
      throw new CalculationError(
        `Entry ${entry.id} is a fugitive source but carries no fugitive balance`,
        { entryId: entry.id },
      );
    }
  }
  if (entry.scope === "SCOPE_3" && !entry.scope3Category) {
    throw new CalculationError(
      `Entry ${entry.id} is Scope 3 but declares no scope3Category`,
      { entryId: entry.id },
    );
  }
}

/**
 * Runs a complete calculation.
 *
 * Deterministic: given the same request (including the Monte Carlo seed) the
 * output is byte-identical, which is what lets a verifier re-perform the
 * calculation and get the same numbers.
 */
export function runCalculation(request: CalculationRequest): CalculationOutcome {
  if (request.entries.length === 0) {
    throw new CalculationError("A calculation requires at least one activity entry", {
      organizationId: request.organizationId,
    });
  }

  const calculatedAt = request.calculatedAt ?? request.period.end;
  const consolidationApproach = request.consolidationApproach ?? "OPERATIONAL_CONTROL";
  const scope2Basis = request.scope2Basis ?? "LOCATION";

  const resolved: ResolvedEntry[] = [];
  const factorSelections: Record<string, readonly string[]> = {};

  for (const entry of request.entries) {
    // Validate the entry shape before resolving factors, so a structural mistake
    // is not reported as a missing emission factor.
    validateEntry(entry);

    const needsFactor = !(entry.scope === "SCOPE_1" && entry.scope1SourceType === "FUGITIVE");
    let factorSet: ActivityFactorSet | null = null;
    let factorIds: readonly string[] = [];
    let specificity: FactorSpecificity = "GLOBAL";
    let rationale: readonly string[] = [];

    if (needsFactor) {
      const selection = resolveEntryFactors(entry, request);
      factorSet = factorSetFromFactors(selection.factors, {
        biogenicFraction: entry.biogenicFraction,
      });
      factorIds = selection.factors.map((factor) => factor.id);
      specificity = selection.specificity;
      rationale = selection.rationale;
    } else {
      rationale = [
        "No emission factor required: fugitive emissions are computed from the refrigerant balance and the GWP table.",
      ];
    }

    factorSelections[entry.id] = rationale;

    resolved.push({
      entry,
      computation: runEngine(entry, request, factorSet),
      factorIds,
      specificity,
      rationale,
      factorUncertaintyPercent: (factorSet?.uncertainty ?? 0) * 100,
    });
  }

  // --- quality -----------------------------------------------------------
  const qualityByResultId: Record<string, QualityScore> = {};
  const qualityRecords: (ReturnType<typeof toDataQualityScoreRecord> & {
    activityDataEntryId: string;
  })[] = [];

  for (const item of resolved) {
    const score = scoreEntry({
      reportingPeriod: request.period,
      dataPeriod: item.entry.dataPeriod ?? request.period,
      measurementType: item.entry.measurementType ?? "CALCULATED",
      factorSpecificity: item.specificity,
      factorUncertainty: item.factorUncertaintyPercent / 100,
      factorPublishedYear: null,
      requiredFields: item.entry.requiredFields,
      providedFields: item.entry.providedFields,
      unitConsistent: item.entry.unitConsistent,
      sourceConsistentWithPriorPeriod: item.entry.sourceConsistentWithPriorPeriod,
      methodConsistentWithPriorPeriod: item.entry.methodConsistentWithPriorPeriod,
      isEstimated: item.entry.isEstimated,
      hasEvidence: item.entry.hasEvidence,
    });
    qualityByResultId[resultIdFor(item.entry)] = score;
    qualityRecords.push({
      ...toDataQualityScoreRecord(score),
      activityDataEntryId: item.entry.id,
    });
  }

  // --- results -----------------------------------------------------------
  const rawResults: EmissionResultRecord[] = resolved.map((item) => {
    const id = resultIdFor(item.entry);
    return {
      id,
      ...gasesToResultColumns(item.computation.gases),
      scope: item.entry.scope,
      scope3Category: item.entry.scope3Category ?? null,
      dataQuality: qualityByResultId[id].level,
      emissionFactorId: item.factorIds[0] ?? null,
      activityDataEntryId: item.entry.id,
      organizationId: request.organizationId,
      businessUnitId: item.entry.businessUnitId ?? null,
      facilityId: item.entry.facilityId ?? null,
      buildingId: item.entry.buildingId ?? null,
      productionLineId: item.entry.productionLineId ?? null,
      equipmentId: item.entry.equipmentId ?? null,
      emissionSourceId: item.entry.emissionSourceId ?? null,
      calculatedAt,
      method: item.computation.method,
    };
  });

  // --- consolidation and aggregation ------------------------------------
  const consolidated = applyConsolidation(
    rawResults,
    consolidationApproach,
    request.facilities ?? [],
  );
  const results: EmissionResultRecord[] = consolidated.map((row, index) => ({
    ...rawResults[index],
    totalCO2e: row.totalCO2e,
    biogenicCO2: row.biogenicCO2 ?? 0,
  }));

  const inventory = buildInventory(results, { scope2Basis });

  // --- uncertainty -------------------------------------------------------
  const uncertaintyComponents: UncertaintyComponent[] = resolved.map((item, index) => ({
    label: item.entry.name ?? item.entry.id,
    value: results[index].totalCO2e,
    activityDataUncertainty: item.entry.activityDataUncertainty ?? 0,
    emissionFactorUncertainty: item.factorUncertaintyPercent,
    methodologyUncertainty: item.entry.methodologyUncertainty ?? 0,
  }));
  const analytical = propagateUncertainty(uncertaintyComponents);
  const simulation = request.monteCarlo
    ? monteCarlo(
        uncertaintyComponents.map((component, index) => ({
          label: component.label,
          value: component.value,
          uncertainty: analytical.components[index].uncertainty,
        })),
        request.monteCarlo,
      )
    : undefined;
  const uncertainty = toUncertaintyRecord(analytical, simulation);

  // --- traces ------------------------------------------------------------
  const traces: ResultTrace[] = resolved.map((item) => ({
    resultId: resultIdFor(item.entry),
    activityDataEntryId: item.entry.id,
    steps: item.computation.trace,
  }));

  // --- calculation headers ----------------------------------------------
  const scopeTotals = new Map<GHGScope, number>();
  for (const result of results) {
    scopeTotals.set(result.scope, (scopeTotals.get(result.scope) ?? 0) + result.totalCO2e);
  }
  const dominantScope = [...scopeTotals.entries()].sort(
    (a, b) => Math.abs(b[1]) - Math.abs(a[1]),
  )[0][0];
  const approach = request.approach ?? "ACTIVITY_BASED";

  const header = (
    scope: GHGScope,
    totalEmissions: number,
    scope3Category: Scope3Category | null,
  ): EmissionCalculationRecord => ({
    organizationId: request.organizationId,
    name: request.name,
    reportingYear: request.reportingYear,
    reportingPeriodStart: request.period.start,
    reportingPeriodEnd: request.period.end,
    scope,
    scope3Category,
    approach,
    status: "COMPLETED",
    totalEmissions,
    unit: inventory.unit,
    calculatedAt,
    gwpVersion: request.gwpVersion,
    scope2Basis,
    consolidationApproach,
  });

  const calculationsByScope = [...scopeTotals.entries()].map(([scope, total]) => {
    const categories = new Set(
      results.filter((r) => r.scope === scope).map((r) => r.scope3Category ?? null),
    );
    return header(scope, total, categories.size === 1 ? [...categories][0] : null);
  });

  // --- lineage -----------------------------------------------------------
  const nodes: LineageNodeDescriptor[] = [];
  const edges: LineageEdgeDescriptor[] = [];
  const calculationKey = `calculation:${request.organizationId}:${request.reportingYear}`;

  nodes.push({
    key: calculationKey,
    name: request.name,
    type: "CALCULATION",
    entityType: "EmissionCalculation",
    entityId: null,
    metadata: {
      reportingYear: request.reportingYear,
      gwpVersion: request.gwpVersion,
      consolidationApproach,
      scope2Basis,
      totalEmissions: inventory.totalEmissions,
    },
  });

  resolved.forEach((item, index) => {
    const result = results[index];
    const activityKey = `activity:${item.entry.id}`;
    const resultKey = `result:${result.id}`;

    nodes.push({
      key: activityKey,
      name: item.entry.name ?? item.entry.id,
      type: "ACTIVITY_DATA",
      entityType: "ActivityDataEntry",
      entityId: item.entry.id,
      metadata: {
        quantity: item.entry.quantity,
        unit: item.entry.unit,
        scope: item.entry.scope,
        measurementType: item.entry.measurementType ?? "CALCULATED",
      },
    });

    nodes.push({
      key: resultKey,
      name: `${item.entry.name ?? item.entry.id} result`,
      type: "EMISSION_RESULT",
      entityType: "EmissionResult",
      entityId: result.id,
      metadata: {
        totalCO2e: result.totalCO2e,
        unit: result.unit,
        scope: result.scope,
        dataQuality: result.dataQuality,
      },
    });

    edges.push({
      sourceKey: activityKey,
      targetKey: resultKey,
      relationship: "INPUT_TO",
      transformationType: item.computation.method,
      transformation: {
        name: `${item.entry.name ?? item.entry.id}: ${item.computation.method}`,
        type: "emission-calculation",
        description: `Applied the ${item.computation.method} method under ${request.gwpVersion} GWP-100.`,
        logic: item.computation.trace.map((step) => step.formula).join(" ; "),
        parameters: {
          gwpVersion: request.gwpVersion,
          consolidationApproach,
          traceStepCount: item.computation.trace.length,
        },
        version: "1",
      },
    });

    for (const factorId of item.factorIds) {
      const factorKey = `factor:${factorId}`;
      if (!nodes.some((node) => node.key === factorKey)) {
        nodes.push({
          key: factorKey,
          name: `Emission factor ${factorId}`,
          type: "EMISSION_FACTOR",
          entityType: "EmissionFactor",
          entityId: factorId,
          metadata: { specificity: item.specificity },
        });
      }
      edges.push({
        sourceKey: factorKey,
        targetKey: resultKey,
        relationship: "APPLIED_TO",
        transformationType: item.computation.method,
        metadata: { selectionRationale: item.rationale },
      });
    }

    edges.push({
      sourceKey: resultKey,
      targetKey: calculationKey,
      relationship: "AGGREGATED_INTO",
      transformationType: "inventory-aggregation",
    });
  });

  return {
    calculation: header(dominantScope, inventory.totalEmissions, null),
    calculationsByScope,
    results,
    inventory,
    uncertainty,
    traces,
    lineage: { nodes, edges },
    quality: {
      byResultId: qualityByResultId,
      records: qualityRecords,
      aggregate: aggregateQuality(
        resolved.map((item, index) => ({
          score: qualityByResultId[resultIdFor(item.entry)],
          weight: results[index].totalCO2e,
        })),
      ),
    },
    factorSelections,
  };
}
