import { describe, expect, it } from "vitest";

import { CalculationError } from "./errors";
import {
  clamp,
  mean,
  percentile,
  roundTo,
  safeDivide,
  stdDev,
  sum,
} from "./number";

describe("roundTo", () => {
  it("rounds to the requested precision", () => {
    expect(roundTo(1.23456, 2)).toBe(1.23);
    expect(roundTo(1.23556, 2)).toBe(1.24);
    expect(roundTo(1234.5678, 0)).toBe(1235);
  });

  it("rounds float-representation midpoints half-up", () => {
    expect(roundTo(1.005, 2)).toBe(1.01);
    expect(roundTo(2.675, 2)).toBe(2.68);
  });

  it("handles negative values symmetrically", () => {
    expect(roundTo(-1.005, 2)).toBe(-1.01);
    expect(roundTo(-2.5, 0)).toBe(-3);
  });

  it("rejects non-finite values and bad precision", () => {
    expect(() => roundTo(Number.NaN)).toThrow(CalculationError);
    expect(() => roundTo(1, -1)).toThrow(CalculationError);
  });
});

describe("sum / mean", () => {
  it("sums and averages", () => {
    expect(sum([1, 2, 3, 4])).toBe(10);
    expect(mean([1, 2, 3, 4])).toBe(2.5);
  });

  it("treats the empty set as zero", () => {
    expect(sum([])).toBe(0);
    expect(mean([])).toBe(0);
  });
});

describe("stdDev", () => {
  it("computes the sample standard deviation", () => {
    // Sample sd of [2,4,4,4,5,5,7,9] is 2.13809... (population sd is 2).
    expect(stdDev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.13809, 4);
  });

  it("is zero for fewer than two values", () => {
    expect(stdDev([])).toBe(0);
    expect(stdDev([42])).toBe(0);
  });
});

describe("percentile", () => {
  const values = [15, 20, 35, 40, 50];

  it("returns the interpolated percentile", () => {
    expect(percentile(values, 0)).toBe(15);
    expect(percentile(values, 100)).toBe(50);
    expect(percentile(values, 50)).toBe(35);
    expect(percentile(values, 40)).toBeCloseTo(29, 10);
  });

  it("does not mutate the input", () => {
    const input = [3, 1, 2];
    percentile(input, 50);
    expect(input).toEqual([3, 1, 2]);
  });

  it("rejects an empty set and out-of-range p", () => {
    expect(() => percentile([], 50)).toThrow(CalculationError);
    expect(() => percentile(values, 101)).toThrow(CalculationError);
  });
});

describe("safeDivide", () => {
  it("divides normally", () => {
    expect(safeDivide(10, 4)).toBe(2.5);
  });

  it("returns the fallback for a zero or non-finite divisor", () => {
    expect(safeDivide(10, 0)).toBe(0);
    expect(safeDivide(10, 0, -1)).toBe(-1);
    expect(safeDivide(10, Number.NaN, 7)).toBe(7);
  });
});

describe("clamp", () => {
  it("bounds the value", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(15, 0, 10)).toBe(10);
  });
});
