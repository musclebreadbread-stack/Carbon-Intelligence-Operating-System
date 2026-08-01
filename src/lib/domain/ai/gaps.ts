/**
 * Data-gap detection and estimation.
 *
 * An inventory is only complete if every period that *should* have data does. This
 * module compares an expected period list against the entries actually recorded,
 * reports the gaps, and fills each one with the most defensible estimate
 * available, in a fixed order of preference:
 *
 *  1. `INTERPOLATION` — both neighbours present: linear interpolation between them.
 *  2. `INTENSITY_BASED` — a physical or financial denominator is known for the gap
 *     period: mean observed intensity × that denominator.
 *  3. `PRIOR_PERIOD` — carry the last observed value forward.
 *  4. `NEXT_PERIOD` — carry the next observed value backward.
 *  5. `NONE` — nothing to estimate from; the gap is reported unfilled.
 *
 * Every estimate carries an explicit `confidenceLevel`, because an estimated
 * figure that is not labelled as one is a misstatement waiting to happen.
 *
 * Records are shaped to the `DataGapAnalysis` model.
 *
 * Pure TypeScript — no framework, database or network imports.
 */

import { CalculationError } from "@/lib/core/errors";
import { mean, safeDivide, sum } from "@/lib/core/number";
import type { ReportingPeriod } from "@/lib/core/period";

export const GAP_TYPES = ["MISSING_PERIOD", "ZERO_VALUE"] as const;
export type GapType = (typeof GAP_TYPES)[number];

export const ESTIMATION_METHODS = [
  "INTERPOLATION",
  "INTENSITY_BASED",
  "PRIOR_PERIOD",
  "NEXT_PERIOD",
  "NONE",
] as const;
export type EstimationMethod = (typeof ESTIMATION_METHODS)[number];

/** Confidence attached to each estimation method. */
export const ESTIMATION_CONFIDENCE: Readonly<Record<EstimationMethod, number>> = {
  INTERPOLATION: 0.9,
  INTENSITY_BASED: 0.75,
  PRIOR_PERIOD: 0.6,
  NEXT_PERIOD: 0.5,
  NONE: 0,
};

export const GAP_SEVERITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;
export type GapSeverity = (typeof GAP_SEVERITIES)[number];

/** A period that should carry data. */
export type ExpectedPeriod = {
  readonly label: string;
  readonly period: ReportingPeriod;
};

/** A recorded observation, matched to an expected period by label or date. */
export type GapEntry = {
  readonly id?: string;
  readonly periodLabel?: string;
  readonly at: Date;
  readonly value: number;
};

export type DetectGapsOptions = {
  readonly dataCategory?: string;
  readonly unit?: string;
  /**
   * Activity denominator per expected-period label (production volume, revenue,
   * floor area). Enables the intensity-based estimate.
   */
  readonly denominators?: Readonly<Record<string, number>>;
  /** Treat a recorded zero as a gap. On by default for emission data. */
  readonly treatZeroAsGap?: boolean;
};

/** Plain object shaped to the `DataGapAnalysis` model. */
export type DataGapRecord = {
  readonly dataCategory: string;
  readonly gapType: GapType;
  readonly description: string;
  readonly severity: GapSeverity;
  readonly affectedPeriodStart: Date;
  readonly affectedPeriodEnd: Date;
  readonly estimationMethod: EstimationMethod;
  readonly estimatedValue: number | null;
  readonly confidenceLevel: number;
  readonly recommendation: string;
  readonly isResolved: boolean;
  readonly periodLabel: string;
  readonly unit: string;
  /** Length of the consecutive run of missing periods this gap belongs to. */
  readonly runLength: number;
};

export type GapAnalysis = {
  readonly gaps: readonly DataGapRecord[];
  readonly expectedCount: number;
  readonly presentCount: number;
  readonly missingCount: number;
  /** Share of expected periods that carry usable data. */
  readonly coverage: number;
  readonly longestRun: number;
  /** Sum of the observed values. */
  readonly observedTotal: number;
  /** Sum of the estimates filled into the gaps. */
  readonly estimatedTotal: number;
  /** Observed plus estimated: the gap-filled total. */
  readonly completedTotal: number;
  readonly dataCategory: string;
  readonly unit: string;
  /** Entries that matched no expected period. */
  readonly unmatchedEntryCount: number;
  readonly isComplete: boolean;
};

function matchEntry(
  expected: ExpectedPeriod,
  entries: readonly GapEntry[],
): GapEntry | undefined {
  const byLabel = entries.find((entry) => entry.periodLabel === expected.label);
  if (byLabel) return byLabel;
  return entries.find(
    (entry) =>
      entry.periodLabel === undefined &&
      entry.at.getTime() >= expected.period.start.getTime() &&
      entry.at.getTime() <= expected.period.end.getTime(),
  );
}

function severityFor(runLength: number, missingShare: number): GapSeverity {
  if (runLength >= 3 || missingShare > 0.5) return "CRITICAL";
  if (runLength === 2 || missingShare > 0.25) return "HIGH";
  if (missingShare > 0.1) return "MEDIUM";
  return "LOW";
}

/**
 * Detects and estimates gaps against an expected period list.
 *
 * Periods must be supplied in chronological order; the interpolation and
 * carry-forward logic depends on it, and silently re-sorting would hide a
 * caller's mistake.
 */
export function detectDataGaps(
  expectedPeriods: readonly ExpectedPeriod[],
  entries: readonly GapEntry[],
  options: DetectGapsOptions = {},
): GapAnalysis {
  if (expectedPeriods.length === 0) {
    throw new CalculationError("detectDataGaps requires at least one expected period", {});
  }
  for (let index = 1; index < expectedPeriods.length; index += 1) {
    if (
      expectedPeriods[index].period.start.getTime() <
      expectedPeriods[index - 1].period.start.getTime()
    ) {
      throw new CalculationError("Expected periods must be in chronological order", {
        index,
        previous: expectedPeriods[index - 1].label,
        current: expectedPeriods[index].label,
      });
    }
  }
  for (const entry of entries) {
    if (!Number.isFinite(entry.value)) {
      throw new CalculationError("Entry values must be finite", {
        entryId: entry.id ?? null,
        value: entry.value,
      });
    }
  }

  const dataCategory = options.dataCategory ?? "activity-data";
  const unit = options.unit ?? "tCO2e";
  const treatZeroAsGap = options.treatZeroAsGap ?? true;
  const denominators = options.denominators;

  const matched = new Set<GapEntry>();
  const slots = expectedPeriods.map((expected) => {
    const entry = matchEntry(expected, entries);
    if (entry) matched.add(entry);
    const isZero = entry !== undefined && entry.value === 0 && treatZeroAsGap;
    return {
      expected,
      entry,
      isPresent: entry !== undefined && !isZero,
      gapType: (entry === undefined ? "MISSING_PERIOD" : "ZERO_VALUE") as GapType,
    };
  });

  // Consecutive-run lengths for the missing slots.
  const runLengths = new Array<number>(slots.length).fill(0);
  let cursor = 0;
  while (cursor < slots.length) {
    if (slots[cursor].isPresent) {
      cursor += 1;
      continue;
    }
    let end = cursor;
    while (end < slots.length && !slots[end].isPresent) end += 1;
    for (let index = cursor; index < end; index += 1) runLengths[index] = end - cursor;
    cursor = end;
  }

  const presentValues = slots
    .filter((slot) => slot.isPresent)
    .map((slot) => slot.entry?.value ?? 0);
  const missingCount = slots.filter((slot) => !slot.isPresent).length;
  const missingShare = safeDivide(missingCount, slots.length);

  // Mean intensity over the periods where both value and denominator are known.
  const intensitySamples = slots
    .filter((slot) => slot.isPresent && denominators?.[slot.expected.label] !== undefined)
    .map((slot) => (slot.entry?.value ?? 0) / (denominators?.[slot.expected.label] ?? 1));
  const meanIntensity = intensitySamples.length > 0 ? mean(intensitySamples) : null;

  const gaps: DataGapRecord[] = [];

  slots.forEach((slot, index) => {
    if (slot.isPresent) return;

    const previous = slots
      .slice(0, index)
      .reverse()
      .find((candidate) => candidate.isPresent);
    const next = slots.slice(index + 1).find((candidate) => candidate.isPresent);
    const denominator = denominators?.[slot.expected.label];

    let estimationMethod: EstimationMethod = "NONE";
    let estimatedValue: number | null = null;

    if (previous && next) {
      const previousIndex = slots.indexOf(previous);
      const nextIndex = slots.indexOf(next);
      const span = nextIndex - previousIndex;
      const share = (index - previousIndex) / span;
      const from = previous.entry?.value ?? 0;
      const to = next.entry?.value ?? 0;
      estimationMethod = "INTERPOLATION";
      estimatedValue = from + (to - from) * share;
    } else if (denominator !== undefined && meanIntensity !== null) {
      estimationMethod = "INTENSITY_BASED";
      estimatedValue = meanIntensity * denominator;
    } else if (previous) {
      estimationMethod = "PRIOR_PERIOD";
      estimatedValue = previous.entry?.value ?? 0;
    } else if (next) {
      estimationMethod = "NEXT_PERIOD";
      estimatedValue = next.entry?.value ?? 0;
    }

    const runLength = runLengths[index];
    const severity = severityFor(runLength, missingShare);

    gaps.push({
      dataCategory,
      gapType: slot.gapType,
      description:
        slot.gapType === "MISSING_PERIOD"
          ? `No ${dataCategory} recorded for ${slot.expected.label}${runLength > 1 ? ` (part of a ${runLength}-period run)` : ""}.`
          : `${dataCategory} for ${slot.expected.label} was recorded as zero, which is treated as missing.`,
      severity,
      affectedPeriodStart: slot.expected.period.start,
      affectedPeriodEnd: slot.expected.period.end,
      estimationMethod,
      estimatedValue,
      confidenceLevel: ESTIMATION_CONFIDENCE[estimationMethod],
      recommendation:
        estimationMethod === "NONE"
          ? `Obtain primary data for ${slot.expected.label}: no neighbouring observation or activity denominator is available to estimate from.`
          : `Estimated by ${estimationMethod.toLowerCase().replace(/_/g, " ")} at ${estimatedValue} ${unit}; replace with primary data before external assurance.`,
      isResolved: false,
      periodLabel: slot.expected.label,
      unit,
      runLength,
    });
  });

  const observedTotal = sum(presentValues);
  const estimatedTotal = sum(gaps.map((gap) => gap.estimatedValue ?? 0));

  return {
    gaps,
    expectedCount: slots.length,
    presentCount: slots.length - missingCount,
    missingCount,
    coverage: 1 - missingShare,
    longestRun: runLengths.length > 0 ? Math.max(0, ...runLengths) : 0,
    observedTotal,
    estimatedTotal,
    completedTotal: observedTotal + estimatedTotal,
    dataCategory,
    unit,
    unmatchedEntryCount: entries.filter((entry) => !matched.has(entry)).length,
    isComplete: missingCount === 0,
  };
}

/**
 * Builds the expected monthly period list for a year, which is the shape most
 * activity-data completeness checks need.
 */
export function monthlyExpectedPeriods(year: number): readonly ExpectedPeriod[] {
  return Array.from({ length: 12 }, (_, month) => ({
    label: `${year}-${String(month + 1).padStart(2, "0")}`,
    period: {
      start: new Date(Date.UTC(year, month, 1)),
      end: new Date(Date.UTC(year, month + 1, 0)),
    },
  }));
}
