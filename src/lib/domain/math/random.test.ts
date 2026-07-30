import { describe, expect, it } from "vitest";

import { CalculationError } from "@/lib/core/errors";
import { mean, stdDev } from "@/lib/core/number";

import { lognormal, mulberry32, normal, sampleMany, triangular, uniform } from "./random";

describe("mulberry32", () => {
  it("produces identical sequences for the same seed", () => {
    const a = sampleMany(1000, mulberry32(42));
    const b = sampleMany(1000, mulberry32(42));
    expect(a).toEqual(b);
  });

  it("produces different sequences for different seeds", () => {
    const a = sampleMany(100, mulberry32(1));
    const b = sampleMany(100, mulberry32(2));
    expect(a).not.toEqual(b);
  });

  it("stays inside [0, 1)", () => {
    const samples = sampleMany(10_000, mulberry32(7));
    expect(Math.min(...samples)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...samples)).toBeLessThan(1);
  });

  it("is approximately uniform", () => {
    const samples = sampleMany(20_000, mulberry32(99));
    expect(mean(samples)).toBeCloseTo(0.5, 2);
    // Uniform(0,1) has sd = 1/sqrt(12) ≈ 0.2887.
    expect(stdDev(samples)).toBeCloseTo(0.2887, 2);
  });

  it("rejects a non-finite seed", () => {
    expect(() => mulberry32(Number.NaN)).toThrow(CalculationError);
  });
});

describe("uniform", () => {
  it("stays within the requested range", () => {
    const rng = mulberry32(3);
    const samples = sampleMany(5000, () => uniform(rng, 10, 20));
    expect(Math.min(...samples)).toBeGreaterThanOrEqual(10);
    expect(Math.max(...samples)).toBeLessThan(20);
    expect(mean(samples)).toBeCloseTo(15, 0);
  });
});

describe("normal", () => {
  it("recovers the requested mean and standard deviation", () => {
    const rng = mulberry32(2024);
    const samples = sampleMany(50_000, () => normal(rng, 100, 5));
    expect(mean(samples)).toBeCloseTo(100, 0);
    expect(stdDev(samples)).toBeCloseTo(5, 0);
  });

  it("returns the mean exactly for a zero standard deviation", () => {
    expect(normal(mulberry32(1), 42, 0)).toBe(42);
  });

  it("is reproducible for a given seed", () => {
    const first = sampleMany(50, (() => {
      const rng = mulberry32(11);
      return () => normal(rng, 0, 1);
    })());
    const second = sampleMany(50, (() => {
      const rng = mulberry32(11);
      return () => normal(rng, 0, 1);
    })());
    expect(first).toEqual(second);
  });

  it("rejects a negative standard deviation", () => {
    expect(() => normal(mulberry32(1), 0, -1)).toThrow(CalculationError);
  });
});

describe("triangular", () => {
  it("stays inside the bounds and centres near the mode", () => {
    const rng = mulberry32(5);
    const samples = sampleMany(50_000, () => triangular(rng, 90, 100, 130));
    expect(Math.min(...samples)).toBeGreaterThanOrEqual(90);
    expect(Math.max(...samples)).toBeLessThanOrEqual(130);
    // Mean of a triangular distribution is (min + mode + max) / 3.
    expect(mean(samples)).toBeCloseTo((90 + 100 + 130) / 3, 0);
  });

  it("collapses to a point when min equals max", () => {
    expect(triangular(mulberry32(1), 5, 5, 5)).toBe(5);
  });

  it("rejects an inconsistent min/mode/max", () => {
    expect(() => triangular(mulberry32(1), 10, 5, 20)).toThrow(CalculationError);
    expect(() => triangular(mulberry32(1), 10, 15, 12)).toThrow(/min ≤ mode ≤ max/);
  });
});

describe("lognormal", () => {
  it("recovers the requested mean and standard deviation of the value", () => {
    const rng = mulberry32(77);
    const samples = sampleMany(100_000, () => lognormal(rng, 100, 20));
    expect(mean(samples)).toBeCloseTo(100, -1);
    expect(stdDev(samples)).toBeCloseTo(20, -1);
  });

  it("is strictly positive", () => {
    const rng = mulberry32(13);
    const samples = sampleMany(10_000, () => lognormal(rng, 50, 25));
    expect(Math.min(...samples)).toBeGreaterThan(0);
  });

  it("returns the mean exactly for a zero standard deviation", () => {
    expect(lognormal(mulberry32(1), 42, 0)).toBe(42);
  });

  it("rejects a non-positive mean and a negative standard deviation", () => {
    expect(() => lognormal(mulberry32(1), 0, 1)).toThrow(/greater than zero/);
    expect(() => lognormal(mulberry32(1), 1, -1)).toThrow(CalculationError);
  });
});

describe("sampleMany", () => {
  it("rejects a non-positive or fractional count", () => {
    expect(() => sampleMany(0, () => 1)).toThrow(CalculationError);
    expect(() => sampleMany(1.5, () => 1)).toThrow(/positive integer/);
  });
});
