import { describe, expect, it } from "vitest";

import { CalculationError } from "@/lib/core/errors";

import {
  MAX_ANOMALY_SCORE,
  anomalyImpact,
  anomalyRate,
  detectAnomalies,
  type TimeSeriesPoint,
} from "./anomaly";

const monthly = (values: readonly number[], year = 2024): TimeSeriesPoint[] =>
  values.map((value, index) => ({
    at: new Date(Date.UTC(year, index, 1)),
    value,
    label: `${year}-${String(index + 1).padStart(2, "0")}`,
  }));

describe("detectAnomalies with the zscore method", () => {
  it("flags a spike in an otherwise flat series as CRITICAL", () => {
    const series = monthly([100, 100, 100, 100, 100, 500, 100, 100, 100, 100, 100, 100]);
    const result = detectAnomalies(series, { metric: "scope1", unit: "tCO2e" });
    expect(result.anomalies).toHaveLength(1);
    const anomaly = result.anomalies[0];
    expect(anomaly.severity).toBe("CRITICAL");
    expect(anomaly.detectedValue).toBe(500);
    expect(anomaly.expectedValue).toBe(100);
    expect(anomaly.deviation).toBe(400);
    expect(anomaly.deviationPercent).toBeCloseTo(400, 9);
    expect(anomaly.metric).toBe("scope1");
    expect(anomaly.label).toBe("2024-06");
    expect(anomaly.direction).toBe("above");
    expect(anomaly.isResolved).toBe(false);
    expect(anomaly.score).toBe(MAX_ANOMALY_SCORE);
    expect(anomaly.description).toContain("beyond measurable");
  });

  it("flags nothing in a clean series", () => {
    const flat = detectAnomalies(monthly(Array.from({ length: 12 }, () => 100)));
    expect(flat.anomalies).toEqual([]);
    expect(anomalyRate(flat)).toBe(0);

    const noisy = detectAnomalies(
      monthly([100, 104, 98, 102, 99, 101, 103, 97, 100, 102, 98, 101]),
    );
    expect(noisy.anomalies).toEqual([]);
  });

  it("uses leave-one-out standardisation so a lone spike cannot mask itself", () => {
    const series = monthly([100, 100, 100, 100, 100, 500, 100, 100, 100, 100, 100, 100]);
    // A whole-series z-score would be only ~3.2σ and would not reach CRITICAL.
    const wholeSeriesZ = (500 - series.reduce((t, p) => t + p.value, 0) / 12) / 115.47;
    expect(wholeSeriesZ).toBeLessThan(4);
    expect(detectAnomalies(series).anomalies[0].score).toBeGreaterThan(wholeSeriesZ);
  });

  it("flags a dip as well as a spike", () => {
    const result = detectAnomalies(
      monthly([100, 100, 100, 100, 100, 5, 100, 100, 100, 100, 100, 100]),
    );
    expect(result.anomalies).toHaveLength(1);
    expect(result.anomalies[0].direction).toBe("below");
    expect(result.anomalies[0].deviation).toBe(-95);
  });

  it("honours a directional filter", () => {
    const spike = monthly([100, 100, 100, 100, 100, 500, 100, 100, 100, 100, 100, 100]);
    expect(detectAnomalies(spike, { direction: "above" }).anomalies).toHaveLength(1);
    expect(detectAnomalies(spike, { direction: "below" }).anomalies).toHaveLength(0);

    const dip = monthly([100, 100, 100, 100, 100, 5, 100, 100, 100, 100, 100, 100]);
    expect(detectAnomalies(dip, { direction: "below" }).anomalies).toHaveLength(1);
    expect(detectAnomalies(dip, { direction: "above" }).anomalies).toHaveLength(0);
    expect(detectAnomalies(dip, { direction: "both" }).anomalies).toHaveLength(1);
  });

  it("grades severity by multiples of the threshold", () => {
    // Ten values spread around 100, plus one controlled outlier.
    const base = [100, 120, 80, 110, 90, 105, 95, 115, 85, 100];
    const mild = detectAnomalies(monthly([...base, 145]), { threshold: 3 });
    const severe = detectAnomalies(monthly([...base, 260]), { threshold: 3 });
    expect(mild.anomalies).toHaveLength(1);
    expect(severe.anomalies).toHaveLength(1);
    expect(mild.anomalies[0].score).toBeLessThan(severe.anomalies[0].score);
    expect(mild.anomalies[0].severity).toBe("LOW");
    expect(severe.anomalies[0].severity).toBe("CRITICAL");
  });

  it("respects an explicit threshold", () => {
    const series = monthly([100, 101, 99, 100, 102, 98, 100, 101, 99, 106]);
    expect(detectAnomalies(series, { threshold: 10 }).anomalies).toHaveLength(0);
    expect(detectAnomalies(series, { threshold: 2 }).anomalies).toHaveLength(1);
  });

  it("reports a score for every point and the series statistics", () => {
    const result = detectAnomalies(monthly([10, 20, 30, 40]));
    expect(result.points).toHaveLength(4);
    expect(result.points.every((point) => Number.isFinite(point.score))).toBe(true);
    expect(result.statistics).toMatchObject({ count: 4, min: 10, max: 40, mean: 25 });
    expect(result.statistics.median).toBe(25);
    expect(result.statistics.iqr).toBeCloseTo(15, 9);
    expect(result.methodology).toContain("Leave-one-out");
  });

  it("does not flag a series of fewer than three points", () => {
    expect(detectAnomalies(monthly([100, 900])).anomalies).toEqual([]);
    expect(detectAnomalies(monthly([100])).anomalies).toEqual([]);
  });

  it("sums the impact of the flagged points", () => {
    const result = detectAnomalies(
      monthly([100, 100, 100, 100, 100, 500, 100, 100, 100, 100, 100, 100]),
    );
    expect(anomalyImpact(result)).toBe(400);
    expect(anomalyRate(result)).toBeCloseTo(1 / 12, 12);
  });
});

describe("detectAnomalies with the iqr method", () => {
  it("uses Tukey fences and is unaffected by the outlier", () => {
    const series = monthly([100, 100, 100, 100, 100, 500, 100, 100, 100, 100, 100, 100]);
    const result = detectAnomalies(series, { method: "iqr" });
    expect(result.anomalies).toHaveLength(1);
    expect(result.anomalies[0].detectedValue).toBe(500);
    expect(result.anomalies[0].severity).toBe("CRITICAL");
    expect(result.anomalies[0].expectedValue).toBe(100);
    expect(result.methodology).toContain("Tukey fences");
  });

  it("uses the median as the expected value", () => {
    const result = detectAnomalies(monthly([10, 12, 11, 13, 12, 11, 60]), {
      method: "iqr",
    });
    expect(result.anomalies[0].expectedValue).toBe(12);
  });

  it("flags nothing on a well-behaved spread", () => {
    const result = detectAnomalies(monthly([10, 20, 30, 40, 50, 60, 70, 80]), {
      method: "iqr",
    });
    expect(result.anomalies).toEqual([]);
  });

  it("honours the fence multiplier", () => {
    const series = monthly([10, 12, 11, 13, 12, 11, 22]);
    expect(detectAnomalies(series, { method: "iqr", threshold: 1.5 }).anomalies).toHaveLength(
      1,
    );
    expect(detectAnomalies(series, { method: "iqr", threshold: 10 }).anomalies).toHaveLength(
      0,
    );
  });
});

describe("detectAnomalies with the seasonal method", () => {
  it("does not flag a legitimate recurring seasonal peak", () => {
    // Winter heating peaks every January and December, across three years.
    const pattern = [300, 250, 180, 120, 90, 80, 85, 95, 130, 190, 250, 310];
    const threeYears = [...pattern, ...pattern, ...pattern].map((value, index) => ({
      at: new Date(Date.UTC(2022 + Math.floor(index / 12), index % 12, 1)),
      value,
      label: `m${index}`,
    }));
    const seasonal = detectAnomalies(threeYears, {
      method: "seasonal",
      seasonLength: 12,
    });
    expect(seasonal.anomalies).toEqual([]);

    // The same peaks look extreme to a non-seasonal detector at a low threshold.
    const plain = detectAnomalies(threeYears, { threshold: 1.5 });
    expect(plain.anomalies.length).toBeGreaterThan(0);
  });

  it("flags a break in an established seasonal pattern", () => {
    const pattern = [300, 250, 180, 120, 90, 80, 85, 95, 130, 190, 250, 310];
    const values = [...pattern, ...pattern, ...pattern];
    values[24] = 900; // a January three times the usual peak
    const series = values.map((value, index) => ({
      at: new Date(Date.UTC(2022 + Math.floor(index / 12), index % 12, 1)),
      value,
      label: `m${index}`,
    }));
    const result = detectAnomalies(series, { method: "seasonal", seasonLength: 12 });
    expect(result.anomalies.map((anomaly) => anomaly.index)).toContain(24);
    expect(result.methodology).toContain("season index");
  });

  it("falls back to the whole series when a season has too few peers", () => {
    const result = detectAnomalies(monthly([100, 100, 100, 100, 900, 100]), {
      method: "seasonal",
      seasonLength: 12,
    });
    expect(result.anomalies).toHaveLength(1);
    expect(result.anomalies[0].detectedValue).toBe(900);
  });

  it("rejects an invalid season length", () => {
    expect(() =>
      detectAnomalies(monthly([1, 2, 3, 4]), { method: "seasonal", seasonLength: 1 }),
    ).toThrow(CalculationError);
  });
});

describe("input validation", () => {
  it("rejects an empty series, a non-finite value and a bad threshold", () => {
    expect(() => detectAnomalies([])).toThrow(/at least one point/);
    expect(() => detectAnomalies(monthly([1, Number.NaN, 3]))).toThrow(/finite/);
    expect(() => detectAnomalies(monthly([1, 2, 3]), { threshold: 0 })).toThrow(
      /greater than zero/,
    );
  });
});
