/**
 * Data-quality scoring.
 *
 * Produces the five dimensions of the `DataQualityScore` model plus a weighted
 * `overallScore` (0–100) and the derived `DataQualityLevel`.
 *
 * The rubric follows the GHG Protocol Scope 3 data-quality indicators and the
 * pedigree-matrix approach used in ISO 14044 LCA practice. Every dimension is
 * driven by an explicit, documented rule so a score can be defended in
 * verification rather than being a black box:
 *
 * | Dimension    | Weight | Driver                                                   |
 * |--------------|--------|----------------------------------------------------------|
 * | reliability  | 30 %   | measurement type: metered > invoiced > estimated > default |
 * | accuracy     | 25 %   | emission-factor specificity and stated uncertainty        |
 * | completeness | 20 %   | share of the period covered, missing required fields      |
 * | timeliness   | 15 %   | age of the factor and of the data vs the reporting period |
 * | consistency  | 10 %   | unit/source/method consistency with prior periods         |
 *
 * Pure TypeScript — no framework, database or network imports.
 */

import type { DataQualityLevel } from "@/lib/core/enums";
import { CalculationError } from "@/lib/core/errors";
import { clamp, mean, roundTo, safeDivide, sum } from "@/lib/core/number";
import { overlapDays, periodDays, type ReportingPeriod } from "@/lib/core/period";

import type { FactorSpecificity } from "../factors/types";

export const QUALITY_DIMENSIONS = [
  "completeness",
  "accuracy",
  "timeliness",
  "consistency",
  "reliability",
] as const;
export type QualityDimension = (typeof QUALITY_DIMENSIONS)[number];

/** Rubric weights; must sum to 1. */
export const QUALITY_WEIGHTS: Readonly<Record<QualityDimension, number>> = {
  reliability: 0.3,
  accuracy: 0.25,
  completeness: 0.2,
  timeliness: 0.15,
  consistency: 0.1,
};

/** How the activity quantity was obtained, best to worst. */
export const MEASUREMENT_TYPES = [
  "METERED",
  "INVOICED",
  "CALCULATED",
  "ESTIMATED",
  "DEFAULT",
] as const;
export type MeasurementType = (typeof MEASUREMENT_TYPES)[number];

const RELIABILITY_SCORE: Readonly<Record<MeasurementType, number>> = {
  METERED: 100,
  INVOICED: 85,
  CALCULATED: 70,
  ESTIMATED: 45,
  DEFAULT: 20,
};

const SPECIFICITY_SCORE: Readonly<Record<FactorSpecificity, number>> = {
  ORGANIZATION_SPECIFIC: 100,
  SUPPLIER_SPECIFIC: 90,
  COUNTRY: 70,
  REGION: 55,
  GLOBAL: 35,
};

/** Thresholds for the derived `DataQualityLevel`, highest band first. */
export const QUALITY_LEVEL_THRESHOLDS: readonly {
  readonly level: DataQualityLevel;
  readonly minScore: number;
}[] = [
  { level: "HIGH", minScore: 80 },
  { level: "MEDIUM", minScore: 60 },
  { level: "LOW", minScore: 45 },
  { level: "ESTIMATED", minScore: 30 },
  { level: "DEFAULT", minScore: 0 },
];

export type QualityScoreInput = {
  /** Reporting period the entry is being assessed against. */
  readonly reportingPeriod: ReportingPeriod;
  /** Period the activity data actually covers. */
  readonly dataPeriod: ReportingPeriod;
  readonly measurementType: MeasurementType;
  /** Specificity of the resolved emission factor (see `resolveFactor`). */
  readonly factorSpecificity: FactorSpecificity;
  /** Stated relative uncertainty of the factor, as a fraction (0.05 = ±5 %). */
  readonly factorUncertainty?: number | null;
  /** Publication year of the emission factor. */
  readonly factorPublishedYear?: number | null;
  /** Required activity fields that are populated vs required, for completeness. */
  readonly requiredFields?: readonly string[];
  readonly providedFields?: readonly string[];
  /** Whether the entry's unit matches the canonical unit for its activity type. */
  readonly unitConsistent?: boolean;
  /** Whether the same factor source was used in the previous period. */
  readonly sourceConsistentWithPriorPeriod?: boolean;
  /** Whether the calculation method matches the prior period's. */
  readonly methodConsistentWithPriorPeriod?: boolean;
  /** `ActivityDataEntry.isEstimated`; forces reliability down when true. */
  readonly isEstimated?: boolean;
  /** Whether supporting evidence (invoice, meter log) is attached. */
  readonly hasEvidence?: boolean;
};

export type QualityScore = {
  readonly completeness: number;
  readonly accuracy: number;
  readonly timeliness: number;
  readonly consistency: number;
  readonly reliability: number;
  readonly overallScore: number;
  readonly level: DataQualityLevel;
  readonly methodology: string;
  /** One human-readable justification per dimension, for the audit trail. */
  readonly rationale: readonly string[];
};

function levelFor(score: number): DataQualityLevel {
  const band = QUALITY_LEVEL_THRESHOLDS.find((entry) => score >= entry.minScore);
  return band?.level ?? "DEFAULT";
}

/** Scores a single activity-data entry against the rubric. */
export function scoreEntry(input: QualityScoreInput): QualityScore {
  const rationale: string[] = [];

  // --- reliability -------------------------------------------------------
  let reliability = RELIABILITY_SCORE[input.measurementType];
  if (reliability === undefined) {
    throw new CalculationError(`Unknown measurement type: ${input.measurementType}`, {
      measurementType: input.measurementType,
    });
  }
  if (input.isEstimated && reliability > RELIABILITY_SCORE.ESTIMATED) {
    reliability = RELIABILITY_SCORE.ESTIMATED;
    rationale.push(
      "Reliability capped at the ESTIMATED band because the entry is flagged as estimated.",
    );
  }
  if (input.hasEvidence === false) {
    reliability -= 10;
    rationale.push("Reliability reduced by 10 points: no supporting evidence is attached.");
  }
  reliability = clamp(reliability, 0, 100);
  rationale.push(
    `Reliability ${roundTo(reliability, 1)}: measurement type ${input.measurementType}.`,
  );

  // --- accuracy ----------------------------------------------------------
  const specificityScore = SPECIFICITY_SCORE[input.factorSpecificity];
  if (specificityScore === undefined) {
    throw new CalculationError(
      `Unknown factor specificity: ${input.factorSpecificity}`,
      { factorSpecificity: input.factorSpecificity },
    );
  }
  // Each percentage point of stated factor uncertainty costs one point, capped at 40.
  const uncertaintyPenalty = clamp((input.factorUncertainty ?? 0) * 100, 0, 40);
  const accuracy = clamp(specificityScore - uncertaintyPenalty, 0, 100);
  rationale.push(
    `Accuracy ${roundTo(accuracy, 1)}: ${input.factorSpecificity} emission factor` +
      (uncertaintyPenalty > 0
        ? ` less ${roundTo(uncertaintyPenalty, 1)} points for a stated ±${roundTo((input.factorUncertainty ?? 0) * 100, 1)} % factor uncertainty.`
        : " with no stated uncertainty penalty."),
  );

  // --- completeness ------------------------------------------------------
  const reportingDays = periodDays(input.reportingPeriod);
  const coveredDays = overlapDays(input.reportingPeriod, input.dataPeriod);
  const coverage = clamp(safeDivide(coveredDays, reportingDays), 0, 1);

  const required = input.requiredFields ?? [];
  const provided = new Set(input.providedFields ?? []);
  const missing = required.filter((field) => !provided.has(field));
  const fieldCoverage = required.length === 0 ? 1 : 1 - missing.length / required.length;

  const completeness = clamp(coverage * 100 * fieldCoverage, 0, 100);
  rationale.push(
    `Completeness ${roundTo(completeness, 1)}: ${coveredDays} of ${reportingDays} reporting days covered` +
      (missing.length > 0 ? `; missing required field(s): ${missing.join(", ")}.` : "."),
  );

  // --- timeliness --------------------------------------------------------
  const reportingYear = input.reportingPeriod.end.getUTCFullYear();
  const factorAge =
    input.factorPublishedYear === undefined || input.factorPublishedYear === null
      ? null
      : reportingYear - input.factorPublishedYear;
  // 15 points per year of factor age; a same-year factor scores 100.
  const factorTimeliness =
    factorAge === null ? 60 : clamp(100 - Math.max(0, factorAge) * 15, 0, 100);
  // Data recorded outside the reporting period loses 20 points per year of offset.
  const dataOffsetYears = Math.abs(
    input.dataPeriod.end.getUTCFullYear() - reportingYear,
  );
  const dataTimeliness = clamp(100 - dataOffsetYears * 20, 0, 100);
  const timeliness = clamp(mean([factorTimeliness, dataTimeliness]), 0, 100);
  rationale.push(
    `Timeliness ${roundTo(timeliness, 1)}: ` +
      (factorAge === null
        ? "factor publication year unknown (neutral 60)"
        : `factor is ${Math.max(0, factorAge)} year(s) old`) +
      `, activity data offset ${dataOffsetYears} year(s) from the reporting year.`,
  );

  // --- consistency -------------------------------------------------------
  const consistencyChecks = [
    input.unitConsistent ?? true,
    input.sourceConsistentWithPriorPeriod ?? true,
    input.methodConsistentWithPriorPeriod ?? true,
  ];
  const consistency = clamp(
    (consistencyChecks.filter(Boolean).length / consistencyChecks.length) * 100,
    0,
    100,
  );
  const inconsistencies = [
    input.unitConsistent === false ? "unit differs from the canonical unit" : null,
    input.sourceConsistentWithPriorPeriod === false ? "factor source changed" : null,
    input.methodConsistentWithPriorPeriod === false ? "calculation method changed" : null,
  ].filter((entry): entry is string => entry !== null);
  rationale.push(
    `Consistency ${roundTo(consistency, 1)}: ` +
      (inconsistencies.length === 0
        ? "unit, factor source and method are consistent with the prior period."
        : `${inconsistencies.join("; ")}.`),
  );

  const dimensions: Record<QualityDimension, number> = {
    completeness,
    accuracy,
    timeliness,
    consistency,
    reliability,
  };
  const overallScore = clamp(
    sum(
      QUALITY_DIMENSIONS.map((dimension) => dimensions[dimension] * QUALITY_WEIGHTS[dimension]),
    ),
    0,
    100,
  );

  return {
    ...dimensions,
    overallScore,
    level: levelFor(overallScore),
    methodology:
      "CIOS data-quality rubric v1: weighted reliability 30 %, accuracy 25 %, completeness 20 %, timeliness 15 %, consistency 10 % (GHG Protocol Scope 3 data-quality indicators; ISO 14044 pedigree approach)",
    rationale,
  };
}

export type AggregateQualityInput = {
  readonly score: QualityScore;
  /** Emissions the entry accounts for, in tCO2e. Used to weight the aggregate. */
  readonly weight?: number;
};

export type AggregateQuality = {
  readonly completeness: number;
  readonly accuracy: number;
  readonly timeliness: number;
  readonly consistency: number;
  readonly reliability: number;
  readonly overallScore: number;
  readonly level: DataQualityLevel;
  readonly entryCount: number;
  /** Share of assessed emissions in each quality band. */
  readonly levelDistribution: Readonly<Partial<Record<DataQualityLevel, number>>>;
  readonly methodology: string;
};

/**
 * Inventory-level quality.
 *
 * Scores are weighted by the emissions each entry represents, so a poorly
 * documented rounding error cannot drag down an otherwise well-measured
 * inventory — and a large, poorly-documented source cannot hide behind a long
 * tail of good small ones.
 */
export function aggregateQuality(
  inputs: readonly AggregateQualityInput[],
): AggregateQuality {
  if (inputs.length === 0) {
    throw new CalculationError("aggregateQuality requires at least one score", {});
  }
  const weights = inputs.map((entry) => Math.abs(entry.weight ?? 1));
  const totalWeight = sum(weights);
  // With no usable weights fall back to an unweighted mean.
  const effective = totalWeight === 0 ? inputs.map(() => 1) : weights;
  const effectiveTotal = sum(effective);

  const weighted = (dimension: QualityDimension): number =>
    sum(inputs.map((entry, index) => entry.score[dimension] * effective[index])) /
    effectiveTotal;

  const dimensions: Record<QualityDimension, number> = {
    completeness: weighted("completeness"),
    accuracy: weighted("accuracy"),
    timeliness: weighted("timeliness"),
    consistency: weighted("consistency"),
    reliability: weighted("reliability"),
  };

  const overallScore =
    sum(inputs.map((entry, index) => entry.score.overallScore * effective[index])) /
    effectiveTotal;

  const levelDistribution: Partial<Record<DataQualityLevel, number>> = {};
  inputs.forEach((entry, index) => {
    const level = entry.score.level;
    levelDistribution[level] = (levelDistribution[level] ?? 0) + effective[index] / effectiveTotal;
  });

  return {
    ...dimensions,
    overallScore,
    level: levelFor(overallScore),
    entryCount: inputs.length,
    levelDistribution,
    methodology:
      "Emission-weighted mean of the per-entry CIOS data-quality rubric v1 scores",
  };
}

/** Plain object shaped to the `DataQualityScore` model. */
export function toDataQualityScoreRecord(score: QualityScore): {
  readonly overallScore: number;
  readonly completeness: number;
  readonly accuracy: number;
  readonly timeliness: number;
  readonly consistency: number;
  readonly reliability: number;
  readonly methodology: string;
  readonly notes: string;
} {
  return {
    overallScore: roundTo(score.overallScore, 2),
    completeness: roundTo(score.completeness, 2),
    accuracy: roundTo(score.accuracy, 2),
    timeliness: roundTo(score.timeliness, 2),
    consistency: roundTo(score.consistency, 2),
    reliability: roundTo(score.reliability, 2),
    methodology: score.methodology,
    notes: score.rationale.join(" "),
  };
}
