/**
 * Materiality assessment and assurance opinion formation.
 *
 * A verifier does not check every number; they check whether the numbers are
 * right *enough*. "Enough" is the materiality threshold — 5 % of the reported
 * total for limited assurance and 2 % for reasonable assurance, which are the
 * levels ISO 14064-3 and ISAE 3410 engagements are normally scoped at.
 *
 * The opinion follows the standard three-way logic:
 *
 *  - uncorrected misstatements within the threshold → **unqualified**
 *  - material but confined misstatements → **qualified**
 *  - material *and* pervasive misstatements → **adverse**
 *  - insufficient evidence to conclude → **disclaimer**
 *
 * Corrected misstatements are tracked but do not drive the opinion: the point of
 * verification is that errors get fixed before the report is issued.
 *
 * Pure TypeScript — no framework, database or network imports.
 */

import { CalculationError } from "@/lib/core/errors";
import { safeDivide, sum } from "@/lib/core/number";

export const ASSURANCE_LEVELS = ["LIMITED", "REASONABLE"] as const;
export type AssuranceLevel = (typeof ASSURANCE_LEVELS)[number];

/** Materiality threshold as a fraction of the reported total. */
export const MATERIALITY_THRESHOLDS: Readonly<Record<AssuranceLevel, number>> = {
  LIMITED: 0.05,
  REASONABLE: 0.02,
};

export const DEFAULT_MATERIALITY_THRESHOLD = MATERIALITY_THRESHOLDS.LIMITED;

/**
 * Multiple of the threshold at which a misstatement is treated as pervasive and
 * the opinion becomes adverse rather than qualified.
 */
export const PERVASIVE_THRESHOLD_MULTIPLE = 2;

export const OPINION_TYPES = [
  "unqualified",
  "qualified",
  "adverse",
  "disclaimer",
] as const;
export type OpinionType = (typeof OPINION_TYPES)[number];

function assertTotal(total: number): void {
  if (!Number.isFinite(total) || total <= 0) {
    throw new CalculationError("Reported total must be greater than zero", { total });
  }
}

function assertThreshold(threshold: number): void {
  if (!Number.isFinite(threshold) || threshold <= 0 || threshold > 1) {
    throw new CalculationError(
      "Materiality threshold must be a fraction greater than 0 and at most 1",
      { threshold },
    );
  }
}

/**
 * Whether a single deviation is material against the reported total.
 *
 * The deviation may be signed — an understatement is just as material as an
 * overstatement — so the magnitude is what is tested.
 */
export function isMaterial(
  deviation: number,
  total: number,
  threshold: number = DEFAULT_MATERIALITY_THRESHOLD,
): boolean {
  assertTotal(total);
  assertThreshold(threshold);
  if (!Number.isFinite(deviation)) {
    throw new CalculationError("Deviation must be finite", { deviation });
  }
  return Math.abs(deviation) / total > threshold;
}

export type MaterialityAssessment = {
  readonly deviation: number;
  readonly absoluteDeviation: number;
  readonly total: number;
  readonly threshold: number;
  /** The threshold expressed in the reporting unit. */
  readonly thresholdQuantity: number;
  readonly relativeDeviation: number;
  readonly isMaterial: boolean;
  readonly isPervasive: boolean;
  readonly rationale: string;
};

/** The full materiality calculation behind `isMaterial`, for the audit trail. */
export function assessMateriality(
  deviation: number,
  total: number,
  threshold: number = DEFAULT_MATERIALITY_THRESHOLD,
): MaterialityAssessment {
  const material = isMaterial(deviation, total, threshold);
  const absoluteDeviation = Math.abs(deviation);
  const relativeDeviation = absoluteDeviation / total;
  const pervasive = relativeDeviation > threshold * PERVASIVE_THRESHOLD_MULTIPLE;
  return {
    deviation,
    absoluteDeviation,
    total,
    threshold,
    thresholdQuantity: total * threshold,
    relativeDeviation,
    isMaterial: material,
    isPervasive: pervasive,
    rationale: `Deviation of ${absoluteDeviation} against a reported total of ${total} is ${(relativeDeviation * 100).toFixed(2)} %, ${material ? "above" : "within"} the ${(threshold * 100).toFixed(2)} % materiality threshold${pervasive ? " and above the pervasiveness multiple" : ""}.`,
  };
}

// ---------------------------------------------------------------------------
// Aggregation across findings
// ---------------------------------------------------------------------------

/** A quantified misstatement identified during verification. */
export type MisstatementLike = {
  readonly id: string;
  readonly title?: string;
  /**
   * Signed deviation in the reporting unit: positive where the reported figure
   * overstates emissions, negative where it understates them.
   */
  readonly deviation: number;
  /** Area affected, e.g. `"SCOPE_1"` or a facility id. Drives pervasiveness. */
  readonly area?: string | null;
  /** Whether the reporting entity corrected the figure before issue. */
  readonly isCorrected?: boolean;
};

export type MisstatementRow = MaterialityAssessment & {
  readonly id: string;
  readonly title: string | null;
  readonly area: string | null;
  readonly isCorrected: boolean;
};

export type AggregateMisstatementsOptions = {
  readonly threshold?: number;
  readonly assuranceLevel?: AssuranceLevel;
  /**
   * Number of distinct areas that, once affected by material misstatements,
   * makes them pervasive regardless of magnitude.
   */
  readonly pervasiveAreaCount?: number;
  /** Set when the verifier could not obtain sufficient appropriate evidence. */
  readonly insufficientEvidence?: boolean;
  readonly unit?: string;
};

export type MisstatementAggregate = {
  readonly total: number;
  readonly threshold: number;
  readonly thresholdQuantity: number;
  readonly assuranceLevel: AssuranceLevel;
  /** Sum of the magnitudes of every misstatement. */
  readonly grossMisstatement: number;
  /** Signed sum: offsetting errors cancel, as they do in practice. */
  readonly netMisstatement: number;
  /** Signed sum of the misstatements that were *not* corrected. */
  readonly uncorrectedMisstatement: number;
  readonly uncorrectedGross: number;
  readonly relativeNet: number;
  readonly relativeUncorrected: number;
  readonly rows: readonly MisstatementRow[];
  readonly materialFindingIds: readonly string[];
  readonly affectedAreas: readonly string[];
  readonly isMaterial: boolean;
  readonly isPervasive: boolean;
  readonly opinionType: OpinionType;
  readonly rationale: readonly string[];
  readonly unit: string;
};

/**
 * Accumulates misstatements and forms the assurance opinion.
 *
 * The opinion is driven by the **uncorrected** aggregate, netted so that an
 * overstatement in one place genuinely offsets an understatement in another. The
 * gross figure is reported alongside it because a set of large offsetting errors
 * is a control finding even when the net is immaterial.
 */
export function aggregateMisstatements(
  findings: readonly MisstatementLike[],
  total: number,
  options: AggregateMisstatementsOptions = {},
): MisstatementAggregate {
  const assuranceLevel = options.assuranceLevel ?? "LIMITED";
  const threshold = options.threshold ?? MATERIALITY_THRESHOLDS[assuranceLevel];
  assertTotal(total);
  assertThreshold(threshold);

  const rows: MisstatementRow[] = findings.map((finding) => ({
    ...assessMateriality(finding.deviation, total, threshold),
    id: finding.id,
    title: finding.title ?? null,
    area: finding.area ?? null,
    isCorrected: finding.isCorrected ?? false,
  }));

  const uncorrected = rows.filter((row) => !row.isCorrected);
  const grossMisstatement = sum(rows.map((row) => row.absoluteDeviation));
  const netMisstatement = sum(rows.map((row) => row.deviation));
  const uncorrectedMisstatement = sum(uncorrected.map((row) => row.deviation));
  const uncorrectedGross = sum(uncorrected.map((row) => row.absoluteDeviation));
  const relativeUncorrected = safeDivide(Math.abs(uncorrectedMisstatement), total);

  // Distinct areas touched by *uncorrected* misstatements. Individually
  // immaterial errors still count here: pervasiveness is about spread, and a
  // dozen small errors across every scope is a systemic control failure.
  const affectedAreas = [
    ...new Set(
      uncorrected
        .map((row) => row.area)
        .filter((area): area is string => area !== null),
    ),
  ].sort();

  const material = relativeUncorrected > threshold;
  const pervasiveByMagnitude =
    relativeUncorrected > threshold * PERVASIVE_THRESHOLD_MULTIPLE;
  const pervasiveByArea =
    options.pervasiveAreaCount !== undefined &&
    affectedAreas.length >= options.pervasiveAreaCount;
  const pervasive = material && (pervasiveByMagnitude || pervasiveByArea);

  let opinionType: OpinionType;
  if (options.insufficientEvidence === true) opinionType = "disclaimer";
  else if (!material) opinionType = "unqualified";
  else if (pervasive) opinionType = "adverse";
  else opinionType = "qualified";

  const unit = options.unit ?? "tCO2e";
  const rationale: string[] = [
    `Materiality threshold ${(threshold * 100).toFixed(2)} % of ${total} ${unit} = ${total * threshold} ${unit} (${assuranceLevel.toLowerCase()} assurance).`,
    `${rows.length} misstatement(s) identified; ${uncorrected.length} uncorrected.`,
    `Uncorrected net misstatement ${uncorrectedMisstatement} ${unit} (${(relativeUncorrected * 100).toFixed(2)} % of the reported total); gross ${uncorrectedGross} ${unit}.`,
  ];
  if (options.insufficientEvidence === true) {
    rationale.push(
      "Opinion disclaimed: sufficient appropriate evidence could not be obtained.",
    );
  } else if (!material) {
    rationale.push("Uncorrected misstatements are below materiality: unqualified opinion.");
  } else if (pervasive) {
    rationale.push(
      pervasiveByMagnitude
        ? `Uncorrected misstatements exceed ${PERVASIVE_THRESHOLD_MULTIPLE}× materiality and are therefore pervasive: adverse opinion.`
        : `Material misstatements affect ${affectedAreas.length} area(s) and are therefore pervasive: adverse opinion.`,
    );
  } else {
    rationale.push(
      "Uncorrected misstatements are material but confined: qualified opinion.",
    );
  }

  return {
    total,
    threshold,
    thresholdQuantity: total * threshold,
    assuranceLevel,
    grossMisstatement,
    netMisstatement,
    uncorrectedMisstatement,
    uncorrectedGross,
    relativeNet: safeDivide(Math.abs(netMisstatement), total),
    relativeUncorrected,
    rows,
    materialFindingIds: rows.filter((row) => row.isMaterial).map((row) => row.id),
    affectedAreas,
    isMaterial: material,
    isPervasive: pervasive,
    opinionType,
    rationale,
    unit,
  };
}
