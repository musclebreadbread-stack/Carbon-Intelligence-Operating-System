/**
 * Scenario projection.
 *
 * A scenario takes a base-year inventory and a set of decarbonisation *levers*
 * and projects a year-by-year emission trajectory. The model is deliberately
 * transparent rather than clever, because a scenario that cannot be explained
 * to a board cannot be used to justify capital:
 *
 * ```
 * activityIndex(t) = (1 + growth)^t
 *
 * scope1(t) = scope1₀ × activityIndex(t) × (1 − efficiency)^t × (1 − fuelSwitch)^t
 * scope2(t) = scope2₀ × activityIndex(t) × (1 − efficiency)^t × renewableFactor(t)
 * scope3(t) = scope3₀ × activityIndex(t) × (1 − supplyChainEngagement)^t
 *
 * ramp(t)   = 1 − ambition × (1 − residualFloor) × t / span
 * final(t)  = measures(t) × ramp(t)
 * ```
 *
 * The compound levers capture *structural* change the organisation is already
 * committed to; `abatementAmbition` is the additional, linearly phased-in
 * abatement the scenario assumes on top, so a NET_ZERO scenario
 * (`abatementAmbition = 1`, `residualFloor = 0`) lands exactly on zero in its
 * target year while BAU (`abatementAmbition = 0`) does not bend at all.
 *
 * Every point is shaped to the `ScenarioResult` model and every comparison to
 * `ScenarioComparison`.
 *
 * Pure TypeScript — no framework, database or network imports.
 */

import type { ScenarioType } from "@/lib/core/enums";
import { CalculationError } from "@/lib/core/errors";
import { clamp, safeDivide, sum } from "@/lib/core/number";

export const DEFAULT_SCENARIO_UNIT = "tCO2e";

// ---------------------------------------------------------------------------
// Levers
// ---------------------------------------------------------------------------

export const SCENARIO_LEVERS = [
  /** Annual growth of the underlying business activity, as a fraction. */
  "activityGrowthRate",
  /** Annual reduction in energy intensity, as a fraction. */
  "energyEfficiencyRate",
  /** Renewable electricity share reached in the target year, 0..1. */
  "renewableShareTarget",
  /** Annual share of Scope 1 fossil fuel displaced by a cleaner carrier. */
  "fuelSwitchRate",
  /** Annual Scope 3 reduction delivered by supplier engagement. */
  "supplyChainEngagementRate",
  /**
   * Additional, linearly phased-in abatement across all scopes, 0..1. `1` means
   * the scenario abates everything above `residualFloor` by the target year.
   */
  "abatementAmbition",
  /** Share of the base year that cannot be abated, 0..1. */
  "residualFloor",
  /** Carbon price in the base year, per tonne. */
  "carbonPrice",
  /** Annual growth of the carbon price, as a fraction. */
  "carbonPriceGrowthRate",
  /** Cost of each abated tonne, used for the abatement cost line. */
  "abatementCostPerTonne",
] as const;
export type ScenarioLever = (typeof SCENARIO_LEVERS)[number];

export type LeverSet = Readonly<Record<ScenarioLever, number>>;

const ZERO_LEVERS: LeverSet = {
  activityGrowthRate: 0,
  energyEfficiencyRate: 0,
  renewableShareTarget: 0,
  fuelSwitchRate: 0,
  supplyChainEngagementRate: 0,
  abatementAmbition: 0,
  residualFloor: 0,
  carbonPrice: 0,
  carbonPriceGrowthRate: 0,
  abatementCostPerTonne: 0,
};

/**
 * Default lever set per `ScenarioType`.
 *
 * The IEA sets are calibrated to the World Energy Outlook narratives: NZE is a
 * 1.5 °C-consistent full decarbonisation, APS assumes announced pledges are met,
 * STEPS assumes only policies already legislated. `renewableShareTarget` is left
 * at 0 for the types that make no electricity-mix claim, and is only applied
 * when it exceeds the base-year share.
 */
export const SCENARIO_DEFAULT_LEVERS: Readonly<Record<ScenarioType, LeverSet>> = {
  BASELINE: { ...ZERO_LEVERS },
  BAU: {
    ...ZERO_LEVERS,
    activityGrowthRate: 0.025,
    energyEfficiencyRate: 0.005,
    carbonPrice: 25,
    carbonPriceGrowthRate: 0.03,
  },
  OPTIMISTIC: {
    ...ZERO_LEVERS,
    activityGrowthRate: 0.02,
    energyEfficiencyRate: 0.03,
    renewableShareTarget: 0.8,
    fuelSwitchRate: 0.02,
    supplyChainEngagementRate: 0.02,
    abatementAmbition: 0.25,
    residualFloor: 0.05,
    carbonPrice: 60,
    carbonPriceGrowthRate: 0.05,
    abatementCostPerTonne: 45,
  },
  PESSIMISTIC: {
    ...ZERO_LEVERS,
    activityGrowthRate: 0.035,
    energyEfficiencyRate: 0.002,
    carbonPrice: 100,
    carbonPriceGrowthRate: 0.07,
  },
  NET_ZERO: {
    ...ZERO_LEVERS,
    activityGrowthRate: 0.02,
    energyEfficiencyRate: 0.04,
    renewableShareTarget: 1,
    fuelSwitchRate: 0.05,
    supplyChainEngagementRate: 0.04,
    abatementAmbition: 1,
    residualFloor: 0,
    carbonPrice: 130,
    carbonPriceGrowthRate: 0.05,
    abatementCostPerTonne: 90,
  },
  IEA_NZE: {
    ...ZERO_LEVERS,
    activityGrowthRate: 0.015,
    energyEfficiencyRate: 0.04,
    renewableShareTarget: 1,
    fuelSwitchRate: 0.045,
    supplyChainEngagementRate: 0.035,
    abatementAmbition: 0.95,
    residualFloor: 0.05,
    carbonPrice: 140,
    carbonPriceGrowthRate: 0.06,
    abatementCostPerTonne: 100,
  },
  IEA_APS: {
    ...ZERO_LEVERS,
    activityGrowthRate: 0.018,
    energyEfficiencyRate: 0.025,
    renewableShareTarget: 0.7,
    fuelSwitchRate: 0.025,
    supplyChainEngagementRate: 0.02,
    abatementAmbition: 0.5,
    residualFloor: 0.1,
    carbonPrice: 90,
    carbonPriceGrowthRate: 0.05,
    abatementCostPerTonne: 70,
  },
  IEA_STEPS: {
    ...ZERO_LEVERS,
    activityGrowthRate: 0.022,
    energyEfficiencyRate: 0.015,
    renewableShareTarget: 0.45,
    fuelSwitchRate: 0.01,
    supplyChainEngagementRate: 0.01,
    abatementAmbition: 0.15,
    residualFloor: 0.2,
    carbonPrice: 45,
    carbonPriceGrowthRate: 0.04,
    abatementCostPerTonne: 55,
  },
  CUSTOM: { ...ZERO_LEVERS },
};

/** Levers that are rates or shares and must sit in `[0, 1]`. */
const FRACTION_LEVERS: readonly ScenarioLever[] = [
  "energyEfficiencyRate",
  "renewableShareTarget",
  "fuelSwitchRate",
  "supplyChainEngagementRate",
  "abatementAmbition",
  "residualFloor",
];

export function isScenarioLever(value: string): value is ScenarioLever {
  return (SCENARIO_LEVERS as readonly string[]).includes(value);
}

/** One assumption row, shaped to the `ScenarioAssumption` model. */
export type ScenarioAssumptionLike = {
  readonly parameter: string;
  readonly value: number;
  readonly unit?: string | null;
  readonly category?: string | null;
  readonly description?: string | null;
  readonly source?: string | null;
  readonly confidence?: number | null;
};

/**
 * Merges assumption rows over the type's default levers.
 * An unrecognised parameter is an error rather than a silent no-op: a scenario
 * that quietly ignores an assumption is worse than one that refuses to run.
 */
export function resolveLevers(
  type: ScenarioType,
  assumptions: readonly ScenarioAssumptionLike[] = [],
): LeverSet {
  const levers: Record<ScenarioLever, number> = { ...SCENARIO_DEFAULT_LEVERS[type] };

  for (const assumption of assumptions) {
    if (!isScenarioLever(assumption.parameter)) {
      throw new CalculationError(
        `Unknown scenario lever: ${assumption.parameter}`,
        { parameter: assumption.parameter, known: SCENARIO_LEVERS },
      );
    }
    if (!Number.isFinite(assumption.value)) {
      throw new CalculationError(`Assumption ${assumption.parameter} must be finite`, {
        parameter: assumption.parameter,
        value: assumption.value,
      });
    }
    levers[assumption.parameter] = assumption.value;
  }

  for (const lever of FRACTION_LEVERS) {
    if (levers[lever] < 0 || levers[lever] > 1) {
      throw new CalculationError(`Lever ${lever} must be a fraction between 0 and 1`, {
        lever,
        value: levers[lever],
      });
    }
  }
  if (levers.activityGrowthRate <= -1) {
    throw new CalculationError("activityGrowthRate must be greater than −1", {
      activityGrowthRate: levers.activityGrowthRate,
    });
  }

  return levers;
}

// ---------------------------------------------------------------------------
// Projection
// ---------------------------------------------------------------------------

export type ScenarioBaseline = {
  readonly year: number;
  readonly scope1Emissions: number;
  readonly scope2Emissions: number;
  readonly scope3Emissions: number;
  /** Base-year energy consumption, in the caller's own unit (usually MWh). */
  readonly energyConsumption?: number;
  /** Base-year renewable electricity share, 0..1. */
  readonly renewableShare?: number;
  readonly unit?: string;
};

/** One projected year, shaped to the `ScenarioResult` model. */
export type ScenarioResultPoint = {
  readonly year: number;
  readonly scope1Emissions: number;
  readonly scope2Emissions: number;
  readonly scope3Emissions: number;
  readonly totalEmissions: number;
  /** Absolute reduction from the base year, in `unit`. */
  readonly reductionFromBaseline: number;
  readonly energyConsumption: number | null;
  readonly renewableShare: number | null;
  /** Carbon-price exposure plus abatement cost for the year. */
  readonly costImplication: number;
  readonly unit: string;
  readonly metadata: {
    readonly reductionPercent: number;
    readonly activityIndex: number;
    readonly grossEmissions: number;
    readonly abatedEmissions: number;
    readonly carbonPrice: number;
    readonly carbonPriceExposure: number;
    readonly abatementCost: number;
    readonly abatementRamp: number;
  };
};

export type ScenarioProjection = {
  readonly type: ScenarioType;
  readonly baselineYear: number;
  readonly targetYear: number;
  readonly levers: LeverSet;
  readonly points: readonly ScenarioResultPoint[];
  readonly baselineEmissions: number;
  readonly targetEmissions: number;
  /** Reduction between the base and target years, as a fraction. */
  readonly targetReduction: number;
  /** Sum of `totalEmissions` over every projected year. */
  readonly cumulativeEmissions: number;
  readonly cumulativeCost: number;
  readonly unit: string;
  readonly methodology: string;
  /** The assumptions actually applied, for the audit trail. */
  readonly assumptions: readonly ScenarioAssumptionLike[];
};

export type ProjectScenarioInput = {
  readonly type: ScenarioType;
  readonly baseline: ScenarioBaseline;
  readonly targetYear: number;
  readonly assumptions?: readonly ScenarioAssumptionLike[];
  readonly name?: string;
};

/** Projects a scenario from its base year to its target year, inclusive. */
export function projectScenario(input: ProjectScenarioInput): ScenarioProjection {
  const { baseline, targetYear, type } = input;
  if (!Number.isInteger(baseline.year) || !Number.isInteger(targetYear)) {
    throw new CalculationError("Scenario years must be integers", {
      baselineYear: baseline.year,
      targetYear,
    });
  }
  if (targetYear <= baseline.year) {
    throw new CalculationError("Scenario target year must be after its baseline year", {
      baselineYear: baseline.year,
      targetYear,
    });
  }
  for (const [key, value] of [
    ["scope1Emissions", baseline.scope1Emissions],
    ["scope2Emissions", baseline.scope2Emissions],
    ["scope3Emissions", baseline.scope3Emissions],
  ] as const) {
    if (!Number.isFinite(value) || value < 0) {
      throw new CalculationError(`Baseline ${key} must be a non-negative number`, {
        [key]: value,
      });
    }
  }

  const levers = resolveLevers(type, input.assumptions);
  const unit = baseline.unit ?? DEFAULT_SCENARIO_UNIT;
  const span = targetYear - baseline.year;
  const baselineShare = clamp(baseline.renewableShare ?? 0, 0, 1);
  const baselineTotal =
    baseline.scope1Emissions + baseline.scope2Emissions + baseline.scope3Emissions;
  const renewableTarget = Math.max(baselineShare, levers.renewableShareTarget);

  const points: ScenarioResultPoint[] = [];
  for (let year = baseline.year; year <= targetYear; year += 1) {
    const elapsed = year - baseline.year;
    const activityIndex = (1 + levers.activityGrowthRate) ** elapsed;
    const efficiency = (1 - levers.energyEfficiencyRate) ** elapsed;

    const renewableShare =
      baselineShare + (renewableTarget - baselineShare) * (elapsed / span);
    // Grid emissions scale with the non-renewable share of consumption.
    const renewableFactor =
      baselineShare >= 1
        ? 0
        : clamp(safeDivide(1 - renewableShare, 1 - baselineShare, 0), 0, 1);

    const grossScope1 = baseline.scope1Emissions * activityIndex;
    const grossScope2 = baseline.scope2Emissions * activityIndex;
    const grossScope3 = baseline.scope3Emissions * activityIndex;
    const grossEmissions = grossScope1 + grossScope2 + grossScope3;

    const measuredScope1 =
      grossScope1 * efficiency * (1 - levers.fuelSwitchRate) ** elapsed;
    const measuredScope2 = grossScope2 * efficiency * renewableFactor;
    const measuredScope3 =
      grossScope3 * (1 - levers.supplyChainEngagementRate) ** elapsed;

    const abatementRamp = clamp(
      1 - levers.abatementAmbition * (1 - levers.residualFloor) * (elapsed / span),
      0,
      1,
    );

    const scope1Emissions = measuredScope1 * abatementRamp;
    const scope2Emissions = measuredScope2 * abatementRamp;
    const scope3Emissions = measuredScope3 * abatementRamp;
    const totalEmissions = scope1Emissions + scope2Emissions + scope3Emissions;

    const carbonPrice =
      levers.carbonPrice * (1 + levers.carbonPriceGrowthRate) ** elapsed;
    const carbonPriceExposure = totalEmissions * carbonPrice;
    const abatedEmissions = Math.max(0, grossEmissions - totalEmissions);
    const abatementCost = abatedEmissions * levers.abatementCostPerTonne;

    points.push({
      year,
      scope1Emissions,
      scope2Emissions,
      scope3Emissions,
      totalEmissions,
      reductionFromBaseline: baselineTotal - totalEmissions,
      energyConsumption:
        baseline.energyConsumption === undefined
          ? null
          : baseline.energyConsumption * activityIndex * efficiency,
      renewableShare: renewableTarget > 0 || baselineShare > 0 ? renewableShare : null,
      costImplication: carbonPriceExposure + abatementCost,
      unit,
      metadata: {
        reductionPercent: safeDivide(baselineTotal - totalEmissions, baselineTotal) * 100,
        activityIndex,
        grossEmissions,
        abatedEmissions,
        carbonPrice,
        carbonPriceExposure,
        abatementCost,
        abatementRamp,
      },
    });
  }

  const targetEmissions = points[points.length - 1].totalEmissions;
  const appliedAssumptions: ScenarioAssumptionLike[] = SCENARIO_LEVERS.map((lever) => ({
    parameter: lever,
    value: levers[lever],
    category: "lever",
    source:
      input.assumptions?.some((assumption) => assumption.parameter === lever) === true
        ? "user"
        : `default:${type}`,
  }));

  return {
    type,
    baselineYear: baseline.year,
    targetYear,
    levers,
    points,
    baselineEmissions: baselineTotal,
    targetEmissions,
    targetReduction: safeDivide(baselineTotal - targetEmissions, baselineTotal),
    cumulativeEmissions: sum(points.map((point) => point.totalEmissions)),
    cumulativeCost: sum(points.map((point) => point.costImplication)),
    unit,
    methodology: `CIOS scenario model v1 (${type}): compound structural levers with a linearly phased abatement ramp to a ${(levers.residualFloor * 100).toFixed(0)} % residual floor`,
    assumptions: appliedAssumptions,
  };
}

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------

export const SCENARIO_COMPARISON_METRICS = [
  "scope1Emissions",
  "scope2Emissions",
  "scope3Emissions",
  "totalEmissions",
  "energyConsumption",
  "renewableShare",
  "costImplication",
  "reductionPercent",
  "cumulativeEmissions",
  "cumulativeCost",
] as const;
export type ScenarioComparisonMetric = (typeof SCENARIO_COMPARISON_METRICS)[number];

/** One comparison row, shaped to the `ScenarioComparison` model. */
export type ScenarioComparisonRecord = {
  readonly name: string;
  readonly metric: ScenarioComparisonMetric;
  readonly scenarioAValue: number | null;
  readonly scenarioBValue: number | null;
  /** `scenarioBValue − scenarioAValue`; negative means B is lower than A. */
  readonly difference: number | null;
  /** `difference / |scenarioAValue| × 100`; `null` when A is zero. */
  readonly percentChange: number | null;
  readonly notes: string;
};

export type CompareScenariosOptions = {
  /** Year the point metrics are read at. Defaults to the shared target year. */
  readonly year?: number;
};

function metricValue(
  projection: ScenarioProjection,
  metric: ScenarioComparisonMetric,
  year: number,
): number | null {
  if (metric === "cumulativeEmissions") return projection.cumulativeEmissions;
  if (metric === "cumulativeCost") return projection.cumulativeCost;
  const point = projection.points.find((candidate) => candidate.year === year);
  if (!point) return null;
  if (metric === "reductionPercent") return point.metadata.reductionPercent;
  return point[metric];
}

/**
 * Compares two projections metric by metric.
 *
 * `difference` is always B − A, so a negative difference means scenario B emits
 * (or costs) less than scenario A.
 */
export function compareScenarios(
  a: ProjectionWithName,
  b: ProjectionWithName,
  metrics: readonly ScenarioComparisonMetric[] = ["totalEmissions", "cumulativeEmissions"],
  options: CompareScenariosOptions = {},
): readonly ScenarioComparisonRecord[] {
  if (metrics.length === 0) {
    throw new CalculationError("compareScenarios requires at least one metric", {});
  }
  const year = options.year ?? Math.min(a.projection.targetYear, b.projection.targetYear);

  return metrics.map((metric) => {
    const scenarioAValue = metricValue(a.projection, metric, year);
    const scenarioBValue = metricValue(b.projection, metric, year);
    const difference =
      scenarioAValue === null || scenarioBValue === null
        ? null
        : scenarioBValue - scenarioAValue;
    const percentChange =
      difference === null || scenarioAValue === null || scenarioAValue === 0
        ? null
        : (difference / Math.abs(scenarioAValue)) * 100;

    return {
      name: `${a.name} vs ${b.name}`,
      metric,
      scenarioAValue,
      scenarioBValue,
      difference,
      percentChange,
      notes:
        difference === null
          ? `${metric} is not available in ${year} for both scenarios.`
          : `${metric} in ${year}: ${b.name} is ${difference === 0 ? "level with" : `${Math.abs(difference).toPrecision(4)} ${difference < 0 ? "below" : "above"}`} ${a.name}${percentChange === null ? "" : ` (${percentChange > 0 ? "+" : ""}${percentChange.toFixed(1)} %)`}.`,
    };
  });
}

export type ProjectionWithName = {
  readonly name: string;
  readonly projection: ScenarioProjection;
};
