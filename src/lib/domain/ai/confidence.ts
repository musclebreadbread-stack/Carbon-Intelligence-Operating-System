/**
 * Confidence scoring for AI-assisted and calculated outputs.
 *
 * A single number that says how much weight a figure can bear, decomposed into
 * weighted factors so the number is never a black box. The decomposition is the
 * point: `sum(breakdown.contribution) === score`, exactly, so a reviewer can see
 * which factor is holding a score down.
 *
 * Factors are supplied as fractions in `[0, 1]`. A factor that is not supplied
 * scores a neutral `NEUTRAL_FACTOR_SCORE` and is flagged in the breakdown, so an
 * absent input never reads as a failure and never silently inflates the total.
 *
 * Records are shaped to `AIConfidenceScore` and `ConfidenceBreakdown`.
 *
 * Pure TypeScript — no framework, database or network imports.
 */

import { CalculationError } from "@/lib/core/errors";
import { clamp, sum } from "@/lib/core/number";

export const CONFIDENCE_FACTORS = [
  "dataQuality",
  "coverage",
  "factorSpecificity",
  "methodRigour",
  "uncertainty",
  "verification",
] as const;
export type ConfidenceFactor = (typeof CONFIDENCE_FACTORS)[number];

/** Rubric weights; must sum to 1. */
export const CONFIDENCE_WEIGHTS: Readonly<Record<ConfidenceFactor, number>> = {
  dataQuality: 0.3,
  coverage: 0.2,
  factorSpecificity: 0.2,
  methodRigour: 0.15,
  uncertainty: 0.1,
  verification: 0.05,
};

export const NEUTRAL_FACTOR_SCORE = 0.6;

export const FACTOR_DESCRIPTIONS: Readonly<Record<ConfidenceFactor, string>> = {
  dataQuality:
    "Weighted data-quality score of the underlying activity data (metered > invoiced > estimated).",
  coverage:
    "Share of the reporting boundary and period actually covered by primary data.",
  factorSpecificity:
    "Specificity of the emission factors applied (organisation > supplier > country > region > global).",
  methodRigour:
    "Rigour of the calculation approach relative to the best available for the category.",
  uncertainty:
    "Inverse of the propagated uncertainty: 1 means a negligible confidence interval.",
  verification:
    "Extent of independent verification obtained over the figure.",
};

export const CONFIDENCE_LEVELS = [
  "VERY_HIGH",
  "HIGH",
  "MEDIUM",
  "LOW",
  "VERY_LOW",
] as const;
export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];

/** Level bands, highest first. */
export const CONFIDENCE_LEVEL_THRESHOLDS: readonly {
  readonly level: ConfidenceLevel;
  readonly minScore: number;
}[] = [
  { level: "VERY_HIGH", minScore: 0.9 },
  { level: "HIGH", minScore: 0.75 },
  { level: "MEDIUM", minScore: 0.55 },
  { level: "LOW", minScore: 0.35 },
  { level: "VERY_LOW", minScore: 0 },
];

export type ConfidenceFactorInput = Partial<Record<ConfidenceFactor, number>>;

export type ScoreConfidenceOptions = {
  readonly metric?: string;
  /** Overrides for individual weights. The full set must still sum to 1. */
  readonly weights?: Partial<Record<ConfidenceFactor, number>>;
};

/** One row, shaped to the `ConfidenceBreakdown` model. */
export type ConfidenceBreakdownRow = {
  readonly factor: ConfidenceFactor;
  readonly score: number;
  readonly weight: number;
  /** `score × weight`: this factor's share of the total. */
  readonly contribution: number;
  readonly description: string;
  readonly methodology: string;
  /** True when no value was supplied and the neutral default was used. */
  readonly isDefaulted: boolean;
};

/** Plain object shaped to the `AIConfidenceScore` model. */
export type ConfidenceScore = {
  readonly metric: string;
  /** Weighted total in `[0, 1]`. */
  readonly score: number;
  /** The same figure as a percentage, for display. */
  readonly scorePercent: number;
  readonly level: ConfidenceLevel;
  readonly methodology: string;
  readonly factors: Readonly<Record<ConfidenceFactor, number>>;
  readonly explanation: string;
  readonly breakdown: readonly ConfidenceBreakdownRow[];
  /** Factors that fell back to the neutral default. */
  readonly defaultedFactors: readonly ConfidenceFactor[];
  /** The factor dragging the score down hardest, by lost contribution. */
  readonly weakestFactor: ConfidenceFactor;
};

function levelFor(score: number): ConfidenceLevel {
  return (
    CONFIDENCE_LEVEL_THRESHOLDS.find((band) => score >= band.minScore)?.level ?? "VERY_LOW"
  );
}

/**
 * Scores confidence from its factors.
 *
 * The weights are validated to sum to 1 on every call: a rubric whose weights do
 * not sum to 1 produces a score that cannot be compared with any other score, and
 * that is worse than an error.
 */
export function scoreConfidence(
  factors: ConfidenceFactorInput,
  options: ScoreConfidenceOptions = {},
): ConfidenceScore {
  const weights: Record<ConfidenceFactor, number> = {
    ...CONFIDENCE_WEIGHTS,
    ...(options.weights ?? {}),
  };
  const weightTotal = sum(CONFIDENCE_FACTORS.map((factor) => weights[factor]));
  if (Math.abs(weightTotal - 1) > 1e-9) {
    throw new CalculationError("Confidence weights must sum to 1", {
      weightTotal,
      weights,
    });
  }

  const resolved: Record<ConfidenceFactor, number> = {} as Record<ConfidenceFactor, number>;
  const defaultedFactors: ConfidenceFactor[] = [];

  for (const factor of CONFIDENCE_FACTORS) {
    const supplied = factors[factor];
    if (supplied === undefined) {
      resolved[factor] = NEUTRAL_FACTOR_SCORE;
      defaultedFactors.push(factor);
      continue;
    }
    if (!Number.isFinite(supplied) || supplied < 0 || supplied > 1) {
      throw new CalculationError(`Confidence factor ${factor} must be in [0, 1]`, {
        factor,
        value: supplied,
      });
    }
    resolved[factor] = supplied;
  }

  const breakdown: ConfidenceBreakdownRow[] = CONFIDENCE_FACTORS.map((factor) => ({
    factor,
    score: resolved[factor],
    weight: weights[factor],
    contribution: resolved[factor] * weights[factor],
    description: FACTOR_DESCRIPTIONS[factor],
    methodology: defaultedFactors.includes(factor)
      ? `No value supplied; scored at the neutral default of ${NEUTRAL_FACTOR_SCORE}.`
      : `Supplied score ${resolved[factor]} weighted at ${weights[factor]}.`,
    isDefaulted: defaultedFactors.includes(factor),
  }));

  // The score is the sum of the contributions by construction, so the breakdown
  // always reproduces the total exactly.
  const score = clamp(sum(breakdown.map((row) => row.contribution)), 0, 1);
  const weakest = [...breakdown].sort(
    (a, b) => (b.weight - b.contribution) - (a.weight - a.contribution),
  )[0];

  return {
    metric: options.metric ?? "confidence",
    score,
    scorePercent: score * 100,
    level: levelFor(score),
    methodology:
      "CIOS confidence rubric v1: data quality 30 %, coverage 20 %, factor specificity 20 %, method rigour 15 %, uncertainty 10 %, verification 5 %",
    factors: resolved,
    explanation:
      `Confidence ${(score * 100).toFixed(1)} % (${levelFor(score)}). ` +
      `Weakest factor: ${weakest.factor} at ${(weakest.score * 100).toFixed(0)} % of its ${(weakest.weight * 100).toFixed(0)} % weight.` +
      (defaultedFactors.length > 0
        ? ` ${defaultedFactors.length} factor(s) used the neutral default: ${defaultedFactors.join(", ")}.`
        : ""),
    breakdown,
    defaultedFactors,
    weakestFactor: weakest.factor,
  };
}

/**
 * Derives the factor inputs from the numbers the platform already computes, so a
 * confidence score can be attached to any calculation without hand-entering
 * anything.
 *
 * `overallUncertainty` is a percentage (as `UncertaintyAnalysis` stores it) and is
 * inverted onto `[0, 1]` against `uncertaintyCeiling`: at or above the ceiling the
 * factor scores 0.
 */
export function confidenceFactorsFromCalculation(input: {
  /** `aggregateQuality().overallScore`, 0–100. */
  readonly dataQualityScore?: number;
  /** Share of the boundary and period covered by primary data, 0..1. */
  readonly coverage?: number;
  /** Share of emissions backed by supplier- or organisation-specific factors, 0..1. */
  readonly specificFactorShare?: number;
  /** Share of results using the most rigorous available approach, 0..1. */
  readonly rigorousMethodShare?: number;
  /** `UncertaintyAnalysis.overallUncertainty`, as a percentage. */
  readonly overallUncertainty?: number;
  readonly uncertaintyCeiling?: number;
  /** Share of emissions covered by an external verification opinion, 0..1. */
  readonly verifiedShare?: number;
}): ConfidenceFactorInput {
  const ceiling = input.uncertaintyCeiling ?? 30;
  const factors: Record<string, number> = {};
  if (input.dataQualityScore !== undefined) {
    factors.dataQuality = clamp(input.dataQualityScore / 100, 0, 1);
  }
  if (input.coverage !== undefined) factors.coverage = clamp(input.coverage, 0, 1);
  if (input.specificFactorShare !== undefined) {
    factors.factorSpecificity = clamp(input.specificFactorShare, 0, 1);
  }
  if (input.rigorousMethodShare !== undefined) {
    factors.methodRigour = clamp(input.rigorousMethodShare, 0, 1);
  }
  if (input.overallUncertainty !== undefined) {
    factors.uncertainty = clamp(1 - input.overallUncertainty / ceiling, 0, 1);
  }
  if (input.verifiedShare !== undefined) {
    factors.verification = clamp(input.verifiedShare, 0, 1);
  }
  return factors as ConfidenceFactorInput;
}
