/**
 * Science Based Targets initiative (SBTi) target mathematics.
 *
 * Implements the two target-setting methods the SBTi Corporate Near-Term
 * Criteria (v5) accept for corporate GHG targets:
 *
 *  - **Absolute Contraction Approach (ACA)** — every company reduces absolute
 *    emissions at the same *linear* annual rate, regardless of sector. The
 *    1.5 °C rate is 4.2 %/yr of the base-year value, so a ten-year target
 *    delivers 42 % cumulative reduction. Implemented by
 *    `absoluteContractionPathway`.
 *  - **Sectoral Decarbonization Approach (SDA)** — a company's physical
 *    emission *intensity* converges on a sector-wide intensity by the target
 *    year. Implemented by `sectoralDecarbonizationPathway`.
 *
 * `evaluateProgress` compares reported actuals against the pathway,
 * `netZeroPlan` derives residual emissions and the neutralisation volume a
 * net-zero commitment implies, and `validateTargetAgainstCriteria` screens a
 * draft target against the SBTi eligibility criteria before submission.
 *
 * Every returned object is shaped to `TargetPathway`, `TargetProgress`,
 * `ScienceBasedTarget` or `NetZeroCommitment` so it can be persisted directly.
 *
 * Pure TypeScript — no framework, database or network imports.
 */

import type { TargetBoundary, TargetStatus } from "@/lib/core/enums";
import { CalculationError } from "@/lib/core/errors";
import { clamp, safeDivide } from "@/lib/core/number";

export const DEFAULT_TARGET_UNIT = "tCO2e";

// ---------------------------------------------------------------------------
// Ambition levels
// ---------------------------------------------------------------------------

/**
 * Temperature-alignment levels and their linear annual reduction rates under
 * the Absolute Contraction Approach, expressed as a fraction of the base-year
 * value per year.
 */
export const SBTI_AMBITIONS = ["ONE_POINT_FIVE_C", "WELL_BELOW_2C", "TWO_C"] as const;
export type SbtiAmbition = (typeof SBTI_AMBITIONS)[number];

export const SBTI_ANNUAL_RATES: Readonly<Record<SbtiAmbition, number>> = {
  ONE_POINT_FIVE_C: 0.042,
  WELL_BELOW_2C: 0.025,
  TWO_C: 0.0123,
};

/** Minimum Scope 1+2 ambition the near-term criteria accept (1.5 °C). */
export const MIN_SCOPE12_ANNUAL_RATE = SBTI_ANNUAL_RATES.ONE_POINT_FIVE_C;

/** Minimum Scope 3 ambition the near-term criteria accept (well-below 2 °C). */
export const MIN_SCOPE3_ANNUAL_RATE = SBTI_ANNUAL_RATES.WELL_BELOW_2C;

/**
 * A Scope 3 target is required once Scope 3 exceeds this share of the
 * Scope 1 + 2 + 3 total (SBTi near-term criterion C21).
 */
export const SCOPE3_TARGET_THRESHOLD = 0.4;

/** Earliest base year the near-term criteria allow. */
export const EARLIEST_BASE_YEAR = 2015;

/** Allowed target horizon, in years from the submission year. */
export const MIN_TARGET_HORIZON_YEARS = 5;
export const MAX_TARGET_HORIZON_YEARS = 10;

/** Minimum long-term reduction a Net-Zero Standard commitment must deliver. */
export const NET_ZERO_MIN_REDUCTION = 0.9;

// ---------------------------------------------------------------------------
// Absolute Contraction Approach
// ---------------------------------------------------------------------------

/** One year of a pathway, shaped to the `TargetPathway` model. */
export type TargetPathwayPoint = {
  readonly name: string;
  readonly year: number;
  readonly targetEmissions: number;
  readonly actualEmissions: number | null;
  readonly unit: string;
  readonly isInterim: boolean;
  readonly methodology: string;
};

export type TargetPathway = {
  readonly points: readonly TargetPathwayPoint[];
  readonly baselineYear: number;
  readonly baselineEmissions: number;
  readonly targetYear: number;
  /** Linear annual reduction rate, as a fraction of the base-year value. */
  readonly annualRate: number;
  /** Cumulative reduction at the target year, as a fraction (0.42 = 42 %). */
  readonly targetReduction: number;
  readonly targetEmissions: number;
  readonly unit: string;
  readonly methodology: string;
};

export type AbsoluteContractionInput = {
  readonly baselineYear: number;
  readonly baselineEmissions: number;
  readonly targetYear: number;
  /**
   * Linear annual reduction rate as a fraction of the base-year value. Defaults
   * to the rate implied by `ambition`, which itself defaults to 1.5 °C.
   */
  readonly annualRate?: number;
  readonly ambition?: SbtiAmbition;
  readonly name?: string;
  readonly unit?: string;
  /** Years that should be flagged `isInterim` in addition to the target year. */
  readonly interimYears?: readonly number[];
};

function assertYearRange(baselineYear: number, targetYear: number): void {
  if (!Number.isInteger(baselineYear) || !Number.isInteger(targetYear)) {
    throw new CalculationError("Baseline and target years must be integers", {
      baselineYear,
      targetYear,
    });
  }
  if (targetYear <= baselineYear) {
    throw new CalculationError("Target year must be after the baseline year", {
      baselineYear,
      targetYear,
    });
  }
}

/**
 * Absolute Contraction Approach pathway.
 *
 * `E(y) = E₀ × (1 − r × (y − y₀))`, floored at zero — a *linear* contraction of
 * the base-year value, not a compound reduction. A 2020 → 2030 pathway at
 * 4.2 %/yr therefore lands on 58 % of the base year, i.e. a 42 % reduction.
 */
export function absoluteContractionPathway(
  input: AbsoluteContractionInput,
): TargetPathway {
  assertYearRange(input.baselineYear, input.targetYear);
  if (!Number.isFinite(input.baselineEmissions) || input.baselineEmissions < 0) {
    throw new CalculationError("Baseline emissions must be a non-negative number", {
      baselineEmissions: input.baselineEmissions,
    });
  }

  const ambition = input.ambition ?? "ONE_POINT_FIVE_C";
  const annualRate = input.annualRate ?? SBTI_ANNUAL_RATES[ambition];
  if (!Number.isFinite(annualRate) || annualRate < 0 || annualRate > 1) {
    throw new CalculationError("Annual reduction rate must be a fraction between 0 and 1", {
      annualRate,
    });
  }

  const unit = input.unit ?? DEFAULT_TARGET_UNIT;
  const methodology = `SBTi Absolute Contraction Approach, ${(annualRate * 100).toFixed(1)} %/yr linear reduction of the ${input.baselineYear} base year`;
  const name = input.name ?? `ACA ${input.baselineYear}–${input.targetYear}`;
  const interim = new Set(input.interimYears ?? []);

  const points: TargetPathwayPoint[] = [];
  for (let year = input.baselineYear; year <= input.targetYear; year += 1) {
    const elapsed = year - input.baselineYear;
    const remaining = Math.max(0, 1 - annualRate * elapsed);
    points.push({
      name,
      year,
      targetEmissions: input.baselineEmissions * remaining,
      actualEmissions: null,
      unit,
      isInterim:
        year !== input.targetYear &&
        year !== input.baselineYear &&
        (interim.size === 0 || interim.has(year)),
      methodology,
    });
  }

  const targetEmissions = points[points.length - 1].targetEmissions;

  return {
    points,
    baselineYear: input.baselineYear,
    baselineEmissions: input.baselineEmissions,
    targetYear: input.targetYear,
    annualRate,
    targetReduction: safeDivide(
      input.baselineEmissions - targetEmissions,
      input.baselineEmissions,
    ),
    targetEmissions,
    unit,
    methodology,
  };
}

// ---------------------------------------------------------------------------
// Sectoral Decarbonization Approach
// ---------------------------------------------------------------------------

export type SectoralDecarbonizationInput = {
  readonly baselineYear: number;
  readonly targetYear: number;
  /** Company physical intensity in the base year, e.g. tCO2e per tonne of steel. */
  readonly companyBaselineIntensity: number;
  /** Sector-wide intensity in the base year. */
  readonly sectorBaselineIntensity: number;
  /** Sector-wide intensity the scenario reaches in the target year. */
  readonly sectorTargetIntensity: number;
  /**
   * Market-share parameter `m`: the company's share of sector activity in the
   * base year divided by its share in the target year. `1` (the default) means
   * the company grows in line with the sector.
   */
  readonly marketShareParameter?: number;
  /** Company physical activity in the base year, for the absolute conversion. */
  readonly baselineActivity?: number;
  /** Annual growth of the company's physical activity, as a fraction. */
  readonly activityGrowthRate?: number;
  readonly name?: string;
  readonly intensityUnit?: string;
  readonly unit?: string;
};

export type IntensityPathwayPoint = TargetPathwayPoint & {
  readonly targetIntensity: number;
  readonly sectorIntensity: number;
  readonly intensityUnit: string;
  readonly activity: number | null;
};

export type IntensityPathway = {
  readonly points: readonly IntensityPathwayPoint[];
  readonly baselineYear: number;
  readonly targetYear: number;
  readonly baselineIntensity: number;
  readonly targetIntensity: number;
  /** Cumulative intensity reduction at the target year, as a fraction. */
  readonly targetIntensityReduction: number;
  readonly intensityUnit: string;
  readonly unit: string;
  readonly methodology: string;
};

/**
 * Sectoral Decarbonization Approach pathway.
 *
 * The sector intensity is interpolated linearly between its base-year and
 * target-year values, giving the sector decarbonisation index
 * `P(t) = (Iₛ(t) − Iₛ(T)) / (Iₛ(t₀) − Iₛ(T))`, which runs from 1 at the base
 * year to 0 at the target year. The company intensity is then
 *
 *   `I_c(t) = (I_c(t₀) − Iₛ(T)) × P(t) × m + Iₛ(T)`
 *
 * so it starts at its own base-year value (when `m = 1`) and converges on the
 * sector's target-year intensity. Absolute emissions are only reported when a
 * baseline activity is supplied, because SDA targets are intensity targets.
 */
export function sectoralDecarbonizationPathway(
  input: SectoralDecarbonizationInput,
): IntensityPathway {
  assertYearRange(input.baselineYear, input.targetYear);
  for (const [key, value] of [
    ["companyBaselineIntensity", input.companyBaselineIntensity],
    ["sectorBaselineIntensity", input.sectorBaselineIntensity],
    ["sectorTargetIntensity", input.sectorTargetIntensity],
  ] as const) {
    if (!Number.isFinite(value) || value < 0) {
      throw new CalculationError(`${key} must be a non-negative number`, { [key]: value });
    }
  }
  if (input.sectorTargetIntensity >= input.sectorBaselineIntensity) {
    throw new CalculationError(
      "The sector target intensity must be below the sector baseline intensity for a decarbonisation pathway",
      {
        sectorBaselineIntensity: input.sectorBaselineIntensity,
        sectorTargetIntensity: input.sectorTargetIntensity,
      },
    );
  }

  const marketShare = input.marketShareParameter ?? 1;
  if (!Number.isFinite(marketShare) || marketShare <= 0) {
    throw new CalculationError("marketShareParameter must be greater than zero", {
      marketShareParameter: marketShare,
    });
  }

  const intensityUnit = input.intensityUnit ?? "tCO2e/unit";
  const unit = input.unit ?? DEFAULT_TARGET_UNIT;
  const span = input.targetYear - input.baselineYear;
  const sectorSpread = input.sectorBaselineIntensity - input.sectorTargetIntensity;
  const growth = input.activityGrowthRate ?? 0;
  const name = input.name ?? `SDA ${input.baselineYear}–${input.targetYear}`;
  const methodology = `SBTi Sectoral Decarbonization Approach: convergence on a sector intensity of ${input.sectorTargetIntensity} ${intensityUnit} by ${input.targetYear} (market-share parameter ${marketShare})`;

  const points: IntensityPathwayPoint[] = [];
  for (let year = input.baselineYear; year <= input.targetYear; year += 1) {
    const elapsed = year - input.baselineYear;
    const sectorIntensity =
      input.sectorBaselineIntensity - (sectorSpread * elapsed) / span;
    const decarbonisationIndex = safeDivide(
      sectorIntensity - input.sectorTargetIntensity,
      sectorSpread,
    );
    const targetIntensity = Math.max(
      0,
      (input.companyBaselineIntensity - input.sectorTargetIntensity) *
        decarbonisationIndex *
        marketShare +
        input.sectorTargetIntensity,
    );
    const activity =
      input.baselineActivity === undefined
        ? null
        : input.baselineActivity * (1 + growth) ** elapsed;

    points.push({
      name,
      year,
      targetEmissions: activity === null ? targetIntensity : targetIntensity * activity,
      actualEmissions: null,
      unit: activity === null ? intensityUnit : unit,
      isInterim: year !== input.targetYear,
      methodology,
      targetIntensity,
      sectorIntensity,
      intensityUnit,
      activity,
    });
  }

  const baselineIntensity = points[0].targetIntensity;
  const targetIntensity = points[points.length - 1].targetIntensity;

  return {
    points,
    baselineYear: input.baselineYear,
    targetYear: input.targetYear,
    baselineIntensity,
    targetIntensity,
    targetIntensityReduction: safeDivide(
      baselineIntensity - targetIntensity,
      baselineIntensity,
    ),
    intensityUnit,
    unit,
    methodology,
  };
}

// ---------------------------------------------------------------------------
// Progress evaluation
// ---------------------------------------------------------------------------

/** Reported outcome for one year. */
export type TargetActual = {
  readonly year: number;
  readonly emissions: number;
  readonly verifiedAt?: Date | null;
};

/** Plain object shaped to the `TargetProgress` model, plus the pathway gap. */
export type TargetProgressRecord = {
  readonly year: number;
  readonly emissions: number;
  readonly reductionFromBaseline: number;
  readonly reductionPercent: number;
  readonly isOnTrack: boolean;
  readonly notes: string;
  readonly verifiedAt: Date | null;
  /** Pathway value for the year, `null` when the pathway does not cover it. */
  readonly pathwayEmissions: number | null;
  /** Actual minus pathway: positive means the target is being missed. */
  readonly gapToPathway: number | null;
};

export type TargetProgressSummary = {
  readonly records: readonly TargetProgressRecord[];
  /** Progress for the most recent reported year. */
  readonly latest: TargetProgressRecord | null;
  /** Share of the total required reduction achieved so far (0..1, can exceed 1). */
  readonly currentProgress: number;
  readonly isOnTrack: boolean;
  readonly status: TargetStatus;
  readonly unit: string;
};

export type EvaluateProgressTarget = {
  readonly baselineYear: number;
  readonly baselineEmissions: number;
  readonly targetYear: number;
  readonly targetEmissions?: number;
  readonly pathway?: readonly TargetPathwayPoint[];
  readonly unit?: string;
};

/**
 * Compares reported actuals against a target and its pathway.
 *
 * `isOnTrack` is true when the reported figure is at or below the pathway value
 * for that year. When no pathway point exists for a year the linear pathway
 * implied by `baselineEmissions` → `targetEmissions` is used, so progress can
 * still be judged for a target that was stored without a year series.
 */
export function evaluateProgress(
  target: EvaluateProgressTarget,
  actuals: readonly TargetActual[],
): TargetProgressSummary {
  assertYearRange(target.baselineYear, target.targetYear);
  const unit = target.unit ?? target.pathway?.[0]?.unit ?? DEFAULT_TARGET_UNIT;
  const pathwayByYear = new Map(
    (target.pathway ?? []).map((point) => [point.year, point.targetEmissions]),
  );
  const finalTarget =
    target.targetEmissions ??
    pathwayByYear.get(target.targetYear) ??
    null;

  const interpolate = (year: number): number | null => {
    const exact = pathwayByYear.get(year);
    if (exact !== undefined) return exact;
    if (finalTarget === null) return null;
    if (year <= target.baselineYear) return target.baselineEmissions;
    if (year >= target.targetYear) return finalTarget;
    const share = (year - target.baselineYear) / (target.targetYear - target.baselineYear);
    return (
      target.baselineEmissions - (target.baselineEmissions - finalTarget) * share
    );
  };

  const records: TargetProgressRecord[] = [...actuals]
    .sort((a, b) => a.year - b.year)
    .map((actual) => {
      if (!Number.isFinite(actual.emissions)) {
        throw new CalculationError("Reported emissions must be finite", {
          year: actual.year,
          emissions: actual.emissions,
        });
      }
      const pathwayEmissions = interpolate(actual.year);
      const gapToPathway =
        pathwayEmissions === null ? null : actual.emissions - pathwayEmissions;
      const reductionFromBaseline = target.baselineEmissions - actual.emissions;
      const reductionPercent =
        safeDivide(reductionFromBaseline, target.baselineEmissions) * 100;
      const isOnTrack = gapToPathway === null ? false : gapToPathway <= 0;

      return {
        year: actual.year,
        emissions: actual.emissions,
        reductionFromBaseline,
        reductionPercent,
        isOnTrack,
        verifiedAt: actual.verifiedAt ?? null,
        pathwayEmissions,
        gapToPathway,
        notes:
          pathwayEmissions === null
            ? `No pathway value for ${actual.year}; ${reductionPercent.toFixed(1)} % below the ${target.baselineYear} baseline.`
            : `${actual.emissions.toFixed(1)} ${unit} against a pathway of ${pathwayEmissions.toFixed(1)} ${unit} (${gapToPathway !== null && gapToPathway <= 0 ? "on track" : "off track"}); ${reductionPercent.toFixed(1)} % below the ${target.baselineYear} baseline.`,
      };
    });

  const latest = records.length > 0 ? records[records.length - 1] : null;
  const requiredReduction =
    finalTarget === null ? 0 : target.baselineEmissions - finalTarget;
  const currentProgress =
    latest === null ? 0 : safeDivide(latest.reductionFromBaseline, requiredReduction);

  let status: TargetStatus = "COMMITTED";
  if (latest !== null) {
    if (finalTarget !== null && latest.emissions <= finalTarget) status = "ACHIEVED";
    else status = latest.isOnTrack ? "ON_TRACK" : "OFF_TRACK";
  }

  return {
    records,
    latest,
    currentProgress,
    isOnTrack: latest?.isOnTrack ?? false,
    status,
    unit,
  };
}

// ---------------------------------------------------------------------------
// Net-zero planning
// ---------------------------------------------------------------------------

export type NetZeroCommitmentInput = {
  readonly baselineYear: number;
  readonly baselineEmissions: number;
  readonly netZeroYear: number;
  readonly pledgeYear?: number;
  /**
   * Long-term reduction the commitment delivers, as a fraction. The Net-Zero
   * Standard requires at least 90 %, which is the default.
   */
  readonly longTermReduction?: number;
  readonly interimYear?: number;
  /** Interim reduction, as a fraction of the base year. */
  readonly interimReduction?: number;
  readonly unit?: string;
  readonly neutralizationStrategy?: string;
};

export type NetZeroPlan = {
  /** Plain object shaped to the `NetZeroCommitment` model. */
  readonly commitment: {
    readonly pledgeYear: number;
    readonly netZeroYear: number;
    readonly interimTarget: number | null;
    readonly interimYear: number | null;
    readonly residualEmissions: number;
    readonly neutralizationStrategy: string;
    readonly status: TargetStatus;
  };
  readonly longTermReduction: number;
  readonly abatedEmissions: number;
  /** Emissions remaining at the net-zero year that must be neutralised. */
  readonly residualEmissions: number;
  /** Permanent removals needed each year from the net-zero year onwards. */
  readonly neutralizationVolume: number;
  readonly meetsNetZeroStandard: boolean;
  readonly warnings: readonly string[];
  readonly pathway: readonly TargetPathwayPoint[];
  readonly unit: string;
};

/**
 * Derives residual emissions and the neutralisation volume implied by a
 * net-zero commitment.
 *
 * The SBTi Net-Zero Standard defines corporate net zero as (a) deep abatement of
 * at least 90 % of base-year emissions and (b) neutralisation of the residual
 * with permanent removals. Avoided-emission credits do not count, so the
 * neutralisation volume equals the residual exactly.
 */
export function netZeroPlan(input: NetZeroCommitmentInput): NetZeroPlan {
  assertYearRange(input.baselineYear, input.netZeroYear);
  if (!Number.isFinite(input.baselineEmissions) || input.baselineEmissions < 0) {
    throw new CalculationError("Baseline emissions must be a non-negative number", {
      baselineEmissions: input.baselineEmissions,
    });
  }
  const longTermReduction = input.longTermReduction ?? NET_ZERO_MIN_REDUCTION;
  if (longTermReduction < 0 || longTermReduction > 1) {
    throw new CalculationError("longTermReduction must be a fraction between 0 and 1", {
      longTermReduction,
    });
  }

  const unit = input.unit ?? DEFAULT_TARGET_UNIT;
  const residualEmissions = input.baselineEmissions * (1 - longTermReduction);
  const abatedEmissions = input.baselineEmissions - residualEmissions;

  const warnings: string[] = [];
  if (longTermReduction < NET_ZERO_MIN_REDUCTION) {
    warnings.push(
      `Long-term reduction of ${(longTermReduction * 100).toFixed(1)} % is below the ${(NET_ZERO_MIN_REDUCTION * 100).toFixed(0)} % deep-abatement floor of the SBTi Net-Zero Standard.`,
    );
  }
  if (input.netZeroYear > 2050) {
    warnings.push(
      `A net-zero year of ${input.netZeroYear} is later than 2050 and is not eligible for validation.`,
    );
  }
  if (input.interimYear === undefined) {
    warnings.push(
      "No interim (near-term) target year is set; the Net-Zero Standard requires a validated near-term target alongside the long-term one.",
    );
  }

  const interimReduction =
    input.interimReduction ??
    (input.interimYear === undefined
      ? undefined
      : clamp(
          MIN_SCOPE12_ANNUAL_RATE * (input.interimYear - input.baselineYear),
          0,
          1,
        ));

  const pathway = absoluteContractionPathway({
    baselineYear: input.baselineYear,
    baselineEmissions: input.baselineEmissions,
    targetYear: input.netZeroYear,
    annualRate: longTermReduction / (input.netZeroYear - input.baselineYear),
    name: `Net zero by ${input.netZeroYear}`,
    unit,
    interimYears: input.interimYear === undefined ? undefined : [input.interimYear],
  }).points;

  return {
    commitment: {
      pledgeYear: input.pledgeYear ?? input.baselineYear,
      netZeroYear: input.netZeroYear,
      interimTarget:
        interimReduction === undefined
          ? null
          : input.baselineEmissions * (1 - interimReduction),
      interimYear: input.interimYear ?? null,
      residualEmissions,
      neutralizationStrategy:
        input.neutralizationStrategy ??
        "Permanent carbon removal with durable storage for 100 % of residual emissions",
      status: warnings.length === 0 ? "COMMITTED" : "DRAFT",
    },
    longTermReduction,
    abatedEmissions,
    residualEmissions,
    neutralizationVolume: residualEmissions,
    meetsNetZeroStandard: warnings.length === 0,
    warnings,
    pathway,
    unit,
  };
}

// ---------------------------------------------------------------------------
// Eligibility screening
// ---------------------------------------------------------------------------

export const TARGET_WARNING_CODES = [
  "BASELINE_TOO_OLD",
  "BASELINE_EMISSIONS_MISSING",
  "HORIZON_TOO_SHORT",
  "HORIZON_TOO_LONG",
  "AMBITION_BELOW_MINIMUM",
  "SCOPE3_TARGET_REQUIRED",
  "SCOPE3_AMBITION_BELOW_MINIMUM",
  "SCOPE3_SHARE_UNKNOWN",
] as const;
export type TargetWarningCode = (typeof TARGET_WARNING_CODES)[number];

export type TargetWarning = {
  readonly code: TargetWarningCode;
  readonly severity: "BLOCKING" | "ADVISORY";
  readonly message: string;
  readonly criterion: string;
};

export type ValidatableTarget = {
  readonly boundary: TargetBoundary;
  readonly baselineYear: number;
  readonly baselineEmissions?: number | null;
  readonly targetYear: number;
  /** Target reduction, as a percentage of the base year (SBTi stores percent). */
  readonly targetReduction: number;
  /** Year the target is (or was) submitted for validation. */
  readonly submissionYear?: number;
  /** Base-year Scope 1, 2 and 3 emissions, for the Scope 3 threshold test. */
  readonly scope1Emissions?: number | null;
  readonly scope2Emissions?: number | null;
  readonly scope3Emissions?: number | null;
};

export type TargetValidation = {
  readonly isEligible: boolean;
  readonly warnings: readonly TargetWarning[];
  /** Implied linear annual reduction rate of the target, as a fraction. */
  readonly impliedAnnualRate: number;
  /** Scope 3 share of the base-year total, or `null` when unknown. */
  readonly scope3Share: number | null;
  readonly requiresScope3Target: boolean;
};

/**
 * Screens a draft target against the SBTi Corporate Near-Term Criteria.
 *
 * Blocking warnings mean the target as drafted would be rejected; advisory ones
 * flag data the validator will ask for. Nothing here throws for a merely
 * unambitious target — the point is to report *why* it fails.
 */
export function validateTargetAgainstCriteria(
  target: ValidatableTarget,
): TargetValidation {
  assertYearRange(target.baselineYear, target.targetYear);
  const warnings: TargetWarning[] = [];

  const span = target.targetYear - target.baselineYear;
  const impliedAnnualRate = target.targetReduction / 100 / span;

  if (target.baselineYear < EARLIEST_BASE_YEAR) {
    warnings.push({
      code: "BASELINE_TOO_OLD",
      severity: "BLOCKING",
      message: `Base year ${target.baselineYear} is earlier than ${EARLIEST_BASE_YEAR}; the near-term criteria do not accept it.`,
      criterion: "SBTi near-term criterion C4 (base year)",
    });
  }
  if (
    target.baselineEmissions === undefined ||
    target.baselineEmissions === null ||
    target.baselineEmissions <= 0
  ) {
    warnings.push({
      code: "BASELINE_EMISSIONS_MISSING",
      severity: "BLOCKING",
      message:
        "Base-year emissions are missing, so the target cannot be expressed in absolute terms.",
      criterion: "SBTi near-term criterion C4 (base year inventory)",
    });
  }

  const submissionYear = target.submissionYear;
  if (submissionYear !== undefined) {
    const horizon = target.targetYear - submissionYear;
    if (horizon < MIN_TARGET_HORIZON_YEARS) {
      warnings.push({
        code: "HORIZON_TOO_SHORT",
        severity: "BLOCKING",
        message: `Target year ${target.targetYear} is only ${horizon} year(s) after submission; near-term targets must be at least ${MIN_TARGET_HORIZON_YEARS} years out.`,
        criterion: "SBTi near-term criterion C6 (target timeframe)",
      });
    }
    if (horizon > MAX_TARGET_HORIZON_YEARS) {
      warnings.push({
        code: "HORIZON_TOO_LONG",
        severity: "BLOCKING",
        message: `Target year ${target.targetYear} is ${horizon} years after submission; near-term targets may not exceed ${MAX_TARGET_HORIZON_YEARS} years.`,
        criterion: "SBTi near-term criterion C6 (target timeframe)",
      });
    }
  }

  const isScope3Only = target.boundary === "SCOPE_3_ONLY";
  const minimumRate = isScope3Only ? MIN_SCOPE3_ANNUAL_RATE : MIN_SCOPE12_ANNUAL_RATE;
  if (impliedAnnualRate + 1e-12 < minimumRate) {
    warnings.push({
      code: isScope3Only ? "SCOPE3_AMBITION_BELOW_MINIMUM" : "AMBITION_BELOW_MINIMUM",
      severity: "BLOCKING",
      message: `The target implies ${(impliedAnnualRate * 100).toFixed(2)} %/yr of linear reduction, below the ${(minimumRate * 100).toFixed(2)} %/yr minimum for a ${isScope3Only ? "Scope 3" : "Scope 1+2"} target.`,
      criterion: isScope3Only
        ? "SBTi near-term criterion C22 (Scope 3 ambition)"
        : "SBTi near-term criterion C17 (Scope 1+2 ambition)",
    });
  }

  // --- Scope 3 inclusion threshold --------------------------------------
  const scope1 = target.scope1Emissions ?? null;
  const scope2 = target.scope2Emissions ?? null;
  const scope3 = target.scope3Emissions ?? null;
  let scope3Share: number | null = null;
  if (scope1 !== null && scope2 !== null && scope3 !== null) {
    const total = scope1 + scope2 + scope3;
    scope3Share = safeDivide(scope3, total);
  } else if (scope3 !== null) {
    warnings.push({
      code: "SCOPE3_SHARE_UNKNOWN",
      severity: "ADVISORY",
      message:
        "Scope 3 emissions are reported but Scope 1 and 2 are not, so the Scope 3 share of the inventory cannot be tested against the 40 % threshold.",
      criterion: "SBTi near-term criterion C21 (Scope 3 screening)",
    });
  }

  const boundaryCoversScope3 =
    target.boundary === "SCOPE_1_2_3" ||
    target.boundary === "SCOPE_3_ONLY" ||
    target.boundary === "FULL_VALUE_CHAIN";
  const requiresScope3Target =
    scope3Share !== null && scope3Share > SCOPE3_TARGET_THRESHOLD;

  if (requiresScope3Target && !boundaryCoversScope3) {
    warnings.push({
      code: "SCOPE3_TARGET_REQUIRED",
      severity: "BLOCKING",
      message: `Scope 3 is ${((scope3Share ?? 0) * 100).toFixed(1)} % of the base-year inventory, above the ${SCOPE3_TARGET_THRESHOLD * 100} % threshold, so a Scope 3 target is required but the boundary is ${target.boundary}.`,
      criterion: "SBTi near-term criterion C21 (Scope 3 target requirement)",
    });
  }

  return {
    isEligible: !warnings.some((warning) => warning.severity === "BLOCKING"),
    warnings,
    impliedAnnualRate,
    scope3Share,
    requiresScope3Target,
  };
}
