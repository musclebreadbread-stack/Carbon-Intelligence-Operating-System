import { describe, expect, it } from "vitest";

import { CalculationError } from "@/lib/core/errors";

import type { TimeSeriesPoint } from "./anomaly";
import {
  DEFAULT_CONFIDENCE_LEVEL,
  Z_CRITICAL,
  forecast,
  inferIntervalDays,
  meanAbsolutePercentageError,
} from "./forecast";

const yearly = (values: readonly number[], startYear = 2019): TimeSeriesPoint[] =>
  values.map((value, index) => ({
    at: new Date(Date.UTC(startYear + index, 0, 1)),
    value,
    label: String(startYear + index),
  }));

describe("forecast with the linear method", () => {
  it("forecasts a perfectly linear series exactly, with a zero-width interval", () => {
    const result = forecast(yearly([100, 110, 120, 130, 140]), { horizon: 1 });
    const prediction = result.predictions[0];
    expect(prediction.predictedValue).toBeCloseTo(150, 9);
    expect(prediction.lowerBound).toBeCloseTo(150, 9);
    expect(prediction.upperBound).toBeCloseTo(150, 9);
    expect(result.model.residualStdError).toBeCloseTo(0, 12);
    expect(result.model.rSquared).toBeCloseTo(1, 12);
    expect(result.model.slope).toBeCloseTo(10, 12);
    expect(result.model.intercept).toBeCloseTo(100, 12);
    expect(prediction.confidence).toBeCloseTo(1, 9);
  });

  it("extrapolates further steps on the same line", () => {
    const result = forecast(yearly([100, 110, 120, 130, 140]), { horizon: 3 });
    expect(result.predictions.map((p) => p.predictedValue)).toEqual([150, 160, 170]);
    expect(result.predictions.map((p) => p.step)).toEqual([1, 2, 3]);
  });

  it("shapes predictions to the AIPrediction columns", () => {
    const result = forecast(yearly([100, 110, 120]), {
      horizon: 1,
      metric: "scope1",
      unit: "tCO2e",
    });
    const prediction = result.predictions[0];
    expect(prediction).toMatchObject({
      metric: "scope1",
      actualValue: null,
      unit: "tCO2e",
    });
    expect(prediction.targetDate.getUTCFullYear()).toBe(2022);
    expect(prediction.horizon).toContain("1 step(s)");
    expect(prediction.methodology).toContain("Ordinary least squares");
    expect(prediction.features.method).toBe("linear");
    expect(prediction.features.slope).toBeCloseTo(10, 9);
  });

  it("widens the interval for a noisy series and further horizons", () => {
    const noisy = yearly([100, 118, 119, 135, 138, 155]);
    const result = forecast(noisy, { horizon: 3 });
    expect(result.model.residualStdError).toBeGreaterThan(0);
    const widths = result.predictions.map((p) => p.upperBound - p.lowerBound);
    expect(widths[0]).toBeGreaterThan(0);
    expect(widths).toEqual([...widths].sort((a, b) => a - b));
    expect(new Set(widths).size).toBe(3);
  });

  it("brackets the prediction symmetrically", () => {
    const result = forecast(yearly([100, 118, 119, 135, 138, 155]), { horizon: 1 });
    const prediction = result.predictions[0];
    expect(prediction.upperBound - prediction.predictedValue).toBeCloseTo(
      prediction.predictedValue - prediction.lowerBound,
      9,
    );
  });

  it("handles a flat series with a zero slope", () => {
    const result = forecast(yearly([100, 100, 100, 100]), { horizon: 2 });
    expect(result.model.slope).toBeCloseTo(0, 12);
    expect(result.predictions.map((p) => p.predictedValue)).toEqual([100, 100]);
  });

  it("handles a declining series", () => {
    const result = forecast(yearly([200, 180, 160, 140]), { horizon: 1 });
    expect(result.model.slope).toBeCloseTo(-20, 12);
    expect(result.predictions[0].predictedValue).toBeCloseTo(120, 9);
  });

  it("uses the requested confidence level", () => {
    const noisy = yearly([100, 118, 119, 135, 138, 155]);
    const narrow = forecast(noisy, { confidenceLevel: 0.8 });
    const wide = forecast(noisy, { confidenceLevel: 0.99 });
    const width = (result: ReturnType<typeof forecast>) =>
      result.predictions[0].upperBound - result.predictions[0].lowerBound;
    expect(width(wide)).toBeGreaterThan(width(narrow));
    expect(width(wide) / width(narrow)).toBeCloseTo(Z_CRITICAL[0.99] / Z_CRITICAL[0.8], 6);
    expect(forecast(noisy).confidenceLevel).toBe(DEFAULT_CONFIDENCE_LEVEL);
  });

  it("rejects an unsupported confidence level", () => {
    expect(() => forecast(yearly([1, 2, 3]), { confidenceLevel: 0.42 })).toThrow(
      /Unsupported confidence level/,
    );
  });
});

describe("forecast with the holt method", () => {
  it("tracks a trending series", () => {
    const result = forecast(yearly([100, 110, 120, 130, 140]), {
      horizon: 1,
      method: "holt",
    });
    expect(result.predictions[0].predictedValue).toBeGreaterThan(140);
    expect(result.model.method).toBe("holt");
    expect(result.methodology).toContain("Holt's linear");
  });

  it("responds faster than OLS to a recent trend break", () => {
    // Flat for years, then a sharp rise.
    const series = yearly([100, 100, 100, 100, 140, 180]);
    const linear = forecast(series, { horizon: 1 }).predictions[0].predictedValue;
    const holt = forecast(series, { horizon: 1, method: "holt", alpha: 0.8, beta: 0.8 })
      .predictions[0].predictedValue;
    expect(holt).toBeGreaterThan(linear);
  });

  it("widens the interval with the square root of the horizon", () => {
    const result = forecast(yearly([100, 118, 119, 135, 138, 155]), {
      horizon: 4,
      method: "holt",
    });
    const widths = result.predictions.map((p) => p.upperBound - p.lowerBound);
    expect(widths[3] / widths[0]).toBeCloseTo(2, 6);
  });

  it("rejects invalid smoothing parameters", () => {
    expect(() =>
      forecast(yearly([1, 2, 3]), { method: "holt", alpha: 0 }),
    ).toThrow(CalculationError);
    expect(() =>
      forecast(yearly([1, 2, 3]), { method: "holt", beta: 1.5 }),
    ).toThrow(/alpha must be in/);
  });
});

describe("inferIntervalDays", () => {
  it("infers a monthly cadence", () => {
    const monthly = [0, 1, 2, 3].map((month) => ({
      at: new Date(Date.UTC(2024, month, 1)),
      value: month,
    }));
    // Jan→Feb 31, Feb→Mar 29 (2024 is a leap year), Mar→Apr 31: mean 30⅓.
    expect(inferIntervalDays(monthly)).toBeCloseTo(91 / 3, 9);
  });

  it("infers an annual cadence and defaults for a single point", () => {
    expect(inferIntervalDays(yearly([1, 2, 3]))).toBeCloseTo(365.5, 1);
    expect(inferIntervalDays(yearly([1]))).toBe(1);
  });

  it("is overridable, which moves the target date", () => {
    const result = forecast(yearly([100, 110, 120]), { horizon: 1, intervalDays: 30 });
    expect(result.intervalDays).toBe(30);
    expect(result.predictions[0].targetDate.toISOString().slice(0, 10)).toBe("2021-01-31");
  });
});

describe("meanAbsolutePercentageError", () => {
  it("is zero for a perfect fit", () => {
    const series = yearly([100, 110, 120, 130]);
    const result = forecast(series, { horizon: 1 });
    expect(meanAbsolutePercentageError(series, result.model)).toBeCloseTo(0, 9);
  });

  it("is positive for a noisy fit", () => {
    const series = yearly([100, 130, 115, 160]);
    const result = forecast(series, { horizon: 1 });
    expect(meanAbsolutePercentageError(series, result.model)).toBeGreaterThan(0);
  });

  it("is undefined when a value is zero", () => {
    const series = yearly([0, 10, 20]);
    const result = forecast(series, { horizon: 1 });
    expect(meanAbsolutePercentageError(series, result.model)).toBeNull();
  });
});

describe("input validation", () => {
  it("requires at least two observations and a positive horizon", () => {
    expect(() => forecast(yearly([100]))).toThrow(/at least two observations/);
    expect(() => forecast(yearly([100, 110]), { horizon: 0 })).toThrow(
      /positive integer/,
    );
  });

  it("rejects non-finite values", () => {
    expect(() => forecast(yearly([100, Number.POSITIVE_INFINITY]))).toThrow(
      CalculationError,
    );
  });
});
