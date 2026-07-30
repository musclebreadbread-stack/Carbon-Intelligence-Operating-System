import { describe, expect, it } from "vitest";

import { CalculationError } from "@/lib/core/errors";

import {
  ESTIMATION_CONFIDENCE,
  detectDataGaps,
  monthlyExpectedPeriods,
  type GapEntry,
} from "./gaps";

const periods = monthlyExpectedPeriods(2024);

/** One entry per month, omitting the labels listed in `missing`. */
const entriesExcept = (missing: readonly string[], value = 100): GapEntry[] =>
  periods
    .filter((period) => !missing.includes(period.label))
    .map((period) => ({
      id: `e-${period.label}`,
      periodLabel: period.label,
      at: period.period.start,
      value,
    }));

describe("monthlyExpectedPeriods", () => {
  it("builds twelve labelled month periods", () => {
    expect(periods).toHaveLength(12);
    expect(periods[0].label).toBe("2024-01");
    expect(periods[0].period.start.toISOString().slice(0, 10)).toBe("2024-01-01");
    expect(periods[1].period.end.toISOString().slice(0, 10)).toBe("2024-02-29");
    expect(periods[11].label).toBe("2024-12");
    expect(periods[11].period.end.toISOString().slice(0, 10)).toBe("2024-12-31");
  });
});

describe("detectDataGaps", () => {
  it("detects a missing month and interpolates it", () => {
    const entries = periods.map((period, index) => ({
      periodLabel: period.label,
      at: period.period.start,
      value: 100 + index * 10,
    }));
    const withGap = entries.filter((entry) => entry.periodLabel !== "2024-06");
    const analysis = detectDataGaps(periods, withGap, { dataCategory: "electricity" });

    expect(analysis.missingCount).toBe(1);
    expect(analysis.gaps).toHaveLength(1);
    const gap = analysis.gaps[0];
    expect(gap.periodLabel).toBe("2024-06");
    expect(gap.gapType).toBe("MISSING_PERIOD");
    expect(gap.estimationMethod).toBe("INTERPOLATION");
    // May is 140 and July is 160, so June interpolates to 150.
    expect(gap.estimatedValue).toBeCloseTo(150, 9);
    expect(gap.confidenceLevel).toBe(ESTIMATION_CONFIDENCE.INTERPOLATION);
    expect(gap.dataCategory).toBe("electricity");
    expect(gap.affectedPeriodStart.toISOString().slice(0, 10)).toBe("2024-06-01");
    expect(gap.affectedPeriodEnd.toISOString().slice(0, 10)).toBe("2024-06-30");
    expect(gap.recommendation).toContain("replace with primary data");
    expect(gap.isResolved).toBe(false);
  });

  it("reports full coverage when nothing is missing", () => {
    const analysis = detectDataGaps(periods, entriesExcept([]));
    expect(analysis.gaps).toEqual([]);
    expect(analysis.coverage).toBe(1);
    expect(analysis.isComplete).toBe(true);
    expect(analysis.presentCount).toBe(12);
    expect(analysis.observedTotal).toBe(1_200);
    expect(analysis.estimatedTotal).toBe(0);
    expect(analysis.completedTotal).toBe(1_200);
  });

  it("interpolates linearly across a multi-month run", () => {
    const entries: GapEntry[] = [
      { periodLabel: "2024-01", at: periods[0].period.start, value: 100 },
      { periodLabel: "2024-04", at: periods[3].period.start, value: 400 },
      ...periods.slice(4).map((period, index) => ({
        periodLabel: period.label,
        at: period.period.start,
        value: 400 + (index + 1) * 10,
      })),
    ];
    const analysis = detectDataGaps(periods, entries);
    expect(analysis.gaps.map((gap) => gap.periodLabel)).toEqual(["2024-02", "2024-03"]);
    expect(analysis.gaps[0].estimatedValue).toBeCloseTo(200, 9);
    expect(analysis.gaps[1].estimatedValue).toBeCloseTo(300, 9);
    expect(analysis.gaps.every((gap) => gap.runLength === 2)).toBe(true);
    expect(analysis.longestRun).toBe(2);
  });

  it("carries the prior period forward when there is no later observation", () => {
    const analysis = detectDataGaps(periods, entriesExcept(["2024-11", "2024-12"], 250));
    expect(analysis.gaps.map((gap) => gap.estimationMethod)).toEqual([
      "PRIOR_PERIOD",
      "PRIOR_PERIOD",
    ]);
    expect(analysis.gaps[0].estimatedValue).toBe(250);
    expect(analysis.gaps[0].confidenceLevel).toBe(ESTIMATION_CONFIDENCE.PRIOR_PERIOD);
  });

  it("carries the next period backward when there is no earlier observation", () => {
    const analysis = detectDataGaps(periods, entriesExcept(["2024-01", "2024-02"], 80));
    expect(analysis.gaps.map((gap) => gap.estimationMethod)).toEqual([
      "NEXT_PERIOD",
      "NEXT_PERIOD",
    ]);
    expect(analysis.gaps[0].estimatedValue).toBe(80);
  });

  it("uses an intensity-based estimate when a denominator is known and one side is missing", () => {
    const entries = periods.slice(0, 10).map((period, index) => ({
      periodLabel: period.label,
      at: period.period.start,
      value: (index + 1) * 20,
    }));
    const denominators = Object.fromEntries(
      periods.map((period, index) => [period.label, (index + 1) * 10]),
    );
    const analysis = detectDataGaps(periods, entries, { denominators });
    expect(analysis.gaps.map((gap) => gap.estimationMethod)).toEqual([
      "INTENSITY_BASED",
      "INTENSITY_BASED",
    ]);
    // Every observed period has an intensity of exactly 2 per unit.
    expect(analysis.gaps[0].estimatedValue).toBeCloseTo(2 * 110, 9);
    expect(analysis.gaps[1].estimatedValue).toBeCloseTo(2 * 120, 9);
    expect(analysis.gaps[0].confidenceLevel).toBe(ESTIMATION_CONFIDENCE.INTENSITY_BASED);
  });

  it("prefers interpolation over the intensity estimate when both neighbours exist", () => {
    const denominators = Object.fromEntries(periods.map((period) => [period.label, 10]));
    const analysis = detectDataGaps(periods, entriesExcept(["2024-06"]), { denominators });
    expect(analysis.gaps[0].estimationMethod).toBe("INTERPOLATION");
  });

  it("leaves a gap unestimated when there is nothing to estimate from", () => {
    const analysis = detectDataGaps(periods, []);
    expect(analysis.gaps).toHaveLength(12);
    expect(analysis.gaps.every((gap) => gap.estimationMethod === "NONE")).toBe(true);
    expect(analysis.gaps[0].estimatedValue).toBeNull();
    expect(analysis.gaps[0].confidenceLevel).toBe(0);
    expect(analysis.gaps[0].recommendation).toContain("Obtain primary data");
    expect(analysis.coverage).toBe(0);
    expect(analysis.completedTotal).toBe(0);
  });

  it("treats a recorded zero as a gap by default", () => {
    const entries = entriesExcept([]).map((entry) =>
      entry.periodLabel === "2024-06" ? { ...entry, value: 0 } : entry,
    );
    const analysis = detectDataGaps(periods, entries);
    expect(analysis.gaps).toHaveLength(1);
    expect(analysis.gaps[0].gapType).toBe("ZERO_VALUE");
    expect(analysis.gaps[0].description).toContain("recorded as zero");
    expect(analysis.gaps[0].estimationMethod).toBe("INTERPOLATION");

    const permissive = detectDataGaps(periods, entries, { treatZeroAsGap: false });
    expect(permissive.gaps).toEqual([]);
  });

  it("grades severity by run length and overall missing share", () => {
    expect(detectDataGaps(periods, entriesExcept(["2024-06"])).gaps[0].severity).toBe("LOW");
    expect(
      detectDataGaps(periods, entriesExcept(["2024-05", "2024-06"])).gaps[0].severity,
    ).toBe("HIGH");
    expect(
      detectDataGaps(periods, entriesExcept(["2024-05", "2024-06", "2024-07"])).gaps[0]
        .severity,
    ).toBe("CRITICAL");
    expect(
      detectDataGaps(periods, entriesExcept(["2024-02", "2024-05", "2024-08"])).gaps[0]
        .severity,
    ).toBe("MEDIUM");
  });

  it("matches entries by date when no period label is given", () => {
    const entries: GapEntry[] = periods
      .filter((period) => period.label !== "2024-06")
      .map((period) => ({ at: new Date(period.period.start.getTime() + 86_400_000), value: 50 }));
    const analysis = detectDataGaps(periods, entries);
    expect(analysis.presentCount).toBe(11);
    expect(analysis.unmatchedEntryCount).toBe(0);
  });

  it("reports entries that match no expected period", () => {
    const analysis = detectDataGaps(periods, [
      ...entriesExcept([]),
      { periodLabel: "2023-12", at: new Date(Date.UTC(2023, 11, 1)), value: 99 },
    ]);
    expect(analysis.unmatchedEntryCount).toBe(1);
  });

  it("totals observed and estimated values separately", () => {
    const analysis = detectDataGaps(periods, entriesExcept(["2024-06"], 100));
    expect(analysis.observedTotal).toBe(1_100);
    expect(analysis.estimatedTotal).toBe(100);
    expect(analysis.completedTotal).toBe(1_200);
    expect(analysis.coverage).toBeCloseTo(11 / 12, 12);
  });

  it("validates its inputs", () => {
    expect(() => detectDataGaps([], [])).toThrow(/at least one expected period/);
    expect(() =>
      detectDataGaps([periods[5], periods[1]], []),
    ).toThrow(/chronological order/);
    expect(() =>
      detectDataGaps(periods, [
        { periodLabel: "2024-01", at: periods[0].period.start, value: Number.NaN },
      ]),
    ).toThrow(CalculationError);
  });
});
