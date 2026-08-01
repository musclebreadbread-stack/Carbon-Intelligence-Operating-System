import { describe, expect, it } from "vitest";

import { CalculationError } from "@/lib/core/errors";

import {
  combineInQuadrature,
  monteCarlo,
  propagateUncertainty,
  toUncertaintyRecord,
} from "./uncertainty";

describe("combineInQuadrature", () => {
  it("combines 3 % and 4 % into 5 %", () => {
    expect(combineInQuadrature([3, 4])).toBeCloseTo(5, 12);
  });

  it("is order-independent and ignores zeros", () => {
    expect(combineInQuadrature([4, 3, 0])).toBeCloseTo(5, 12);
    expect(combineInQuadrature([0])).toBe(0);
  });

  it("rejects negative or non-finite percentages", () => {
    expect(() => combineInQuadrature([-1])).toThrow(CalculationError);
    expect(() => combineInQuadrature([Number.NaN])).toThrow(/finite/);
  });
});

describe("propagateUncertainty", () => {
  it("combines a component's drivers in quadrature", () => {
    const result = propagateUncertainty([
      {
        label: "Natural gas",
        value: 1000,
        activityDataUncertainty: 3,
        emissionFactorUncertainty: 4,
      },
    ]);
    expect(result.total).toBe(1000);
    expect(result.overallUncertainty).toBeCloseTo(5, 10);
    expect(result.lowerBound).toBeCloseTo(950, 9);
    expect(result.upperBound).toBeCloseTo(1050, 9);
    expect(result.confidenceLevel).toBe(95);
    expect(result.methodology).toContain("Approach 1");
  });

  it("keeps the three drivers separately attributable", () => {
    const result = propagateUncertainty([
      {
        value: 100,
        activityDataUncertainty: 6,
        emissionFactorUncertainty: 8,
        methodologyUncertainty: 0,
      },
    ]);
    expect(result.activityDataUncertainty).toBeCloseTo(6, 10);
    expect(result.emissionFactorUncertainty).toBeCloseTo(8, 10);
    expect(result.methodologyUncertainty).toBe(0);
    expect(result.overallUncertainty).toBeCloseTo(10, 10);
  });

  it("dilutes a small uncertain source against a large certain one", () => {
    // Absolute: 900 × 2 % = 18; 100 × 30 % = 30 → sqrt(18² + 30²) = 34.986 on 1000
    const result = propagateUncertainty([
      { label: "metered", value: 900, activityDataUncertainty: 2 },
      { label: "estimated", value: 100, activityDataUncertainty: 30 },
    ]);
    expect(result.total).toBe(1000);
    expect(result.overallUncertainty).toBeCloseTo(3.4986, 4);
    // The small source dominates the *uncertainty* even though it is 10 % of the total.
    const estimated = result.components.find((c) => c.label === "estimated");
    expect(estimated?.contribution).toBeGreaterThan(0.7);
  });

  it("has component contributions summing to 1", () => {
    const result = propagateUncertainty([
      { value: 500, activityDataUncertainty: 5 },
      { value: 300, emissionFactorUncertainty: 10 },
      { value: 200, methodologyUncertainty: 20 },
    ]);
    const contributions = result.components.reduce((total, c) => total + c.contribution, 0);
    expect(contributions).toBeCloseTo(1, 10);
  });

  it("labels components that were not named", () => {
    const result = propagateUncertainty([{ value: 1, activityDataUncertainty: 1 }]);
    expect(result.components[0].label).toBe("component-1");
  });

  it("returns zero uncertainty when no driver is supplied", () => {
    const result = propagateUncertainty([{ value: 100 }]);
    expect(result.overallUncertainty).toBe(0);
    expect(result.lowerBound).toBe(100);
    expect(result.upperBound).toBe(100);
  });

  it("requires at least one component", () => {
    expect(() => propagateUncertainty([])).toThrow(CalculationError);
  });
});

describe("monteCarlo", () => {
  const inputs = [
    { label: "scope1", value: 1000, uncertainty: 5 },
    { label: "scope2", value: 400, uncertainty: 3 },
    { label: "scope3", value: 2600, uncertainty: 25 },
  ] as const;

  it("is byte-identical across two runs with the same seed", () => {
    const a = monteCarlo(inputs, { iterations: 5000, seed: 20240615 });
    const b = monteCarlo(inputs, { iterations: 5000, seed: 20240615 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("produces a different interval for a different seed", () => {
    const a = monteCarlo(inputs, { iterations: 5000, seed: 1 });
    const b = monteCarlo(inputs, { iterations: 5000, seed: 2 });
    expect(a.lowerBound).not.toBe(b.lowerBound);
    // …but the same central tendency, within Monte Carlo sampling error.
    expect(Math.abs(a.mean - b.mean) / 4000).toBeLessThan(0.02);
  });

  it("brackets the analytic mean inside the 95 % interval", () => {
    const result = monteCarlo(inputs, { iterations: 20_000, seed: 7 });
    expect(result.deterministicTotal).toBe(4000);
    expect(result.mean).toBeCloseTo(4000, -1);
    expect(result.lowerBound).toBeLessThan(4000);
    expect(result.upperBound).toBeGreaterThan(4000);
    expect(result.confidenceLevel).toBe(95);
    expect(result.monteCarloIterations).toBe(20_000);
    expect(result.seed).toBe(7);
  });

  it("agrees with the analytical quadrature result", () => {
    // Quadrature: sqrt(50² + 12² + 650²) = 652.6 on 4000 → ±16.3 %
    const analytical = propagateUncertainty([
      { value: 1000, activityDataUncertainty: 5 },
      { value: 400, activityDataUncertainty: 3 },
      { value: 2600, activityDataUncertainty: 25 },
    ]);
    const simulated = monteCarlo(inputs, { iterations: 50_000, seed: 3 });
    // The Monte Carlo half-width at 95 % is ≈1.96 σ, the analytical one is 1 σ.
    expect(simulated.overallUncertainty).toBeCloseTo(
      analytical.overallUncertainty * 1.96,
      0,
    );
  });

  it("narrows the interval for a tighter confidence level", () => {
    const wide = monteCarlo(inputs, { iterations: 20_000, seed: 4, confidenceLevel: 95 });
    const narrow = monteCarlo(inputs, { iterations: 20_000, seed: 4, confidenceLevel: 68 });
    expect(narrow.upperBound - narrow.lowerBound).toBeLessThan(
      wide.upperBound - wide.lowerBound,
    );
    expect(narrow.confidenceLevel).toBe(68);
  });

  it("supports lognormal and triangular components", () => {
    const result = monteCarlo(
      [
        { value: 1000, uncertainty: 20, distribution: "LOGNORMAL" },
        { value: 500, uncertainty: 10, distribution: "TRIANGULAR" },
        { value: 200, uncertainty: 50, distribution: "TRIANGULAR", min: 150, max: 400 },
      ],
      { iterations: 20_000, seed: 9 },
    );
    // Triangular with explicit bounds has mean (150 + 200 + 400)/3 = 250, so the
    // simulated mean sits above the deterministic total of 1700.
    expect(result.deterministicTotal).toBe(1700);
    expect(result.mean).toBeGreaterThan(1700);
    expect(result.lowerBound).toBeLessThan(result.median);
    expect(result.median).toBeLessThan(result.upperBound);
  });

  it("leaves a non-positive lognormal component unchanged", () => {
    const result = monteCarlo([{ value: 0, uncertainty: 20, distribution: "LOGNORMAL" }], {
      iterations: 1000,
      seed: 1,
    });
    expect(result.mean).toBe(0);
  });

  it("validates iterations, confidence level and inputs", () => {
    expect(() => monteCarlo([])).toThrow(/at least one input/);
    expect(() => monteCarlo(inputs, { iterations: 10 })).toThrow(/≥ 100/);
    expect(() => monteCarlo(inputs, { iterations: 1000.5 })).toThrow(CalculationError);
    expect(() => monteCarlo(inputs, { confidenceLevel: 100 })).toThrow(/between 0 and 100/);
  });
});

describe("toUncertaintyRecord", () => {
  const analytical = propagateUncertainty([
    { value: 1000, activityDataUncertainty: 3, emissionFactorUncertainty: 4 },
  ]);

  it("shapes the analytical result to the UncertaintyAnalysis columns", () => {
    const record = toUncertaintyRecord(analytical);
    expect(record.overallUncertainty).toBeCloseTo(5, 10);
    expect(record.activityDataUncertainty).toBeCloseTo(3, 10);
    expect(record.emissionFactorUncertainty).toBeCloseTo(4, 10);
    expect(record.monteCarloIterations).toBeNull();
    expect(record.notes).toBeNull();
    expect(record.confidenceLevel).toBe(95);
  });

  it("prefers the Monte Carlo interval and records the analytical figure in the notes", () => {
    const simulation = monteCarlo([{ value: 1000, uncertainty: 5 }], {
      iterations: 5000,
      seed: 42,
    });
    const record = toUncertaintyRecord(analytical, simulation);
    expect(record.monteCarloIterations).toBe(5000);
    expect(record.overallUncertainty).toBe(simulation.overallUncertainty);
    expect(record.lowerBound).toBe(simulation.lowerBound);
    expect(record.methodology).toContain("Approach 2");
    expect(record.notes).toContain("Analytical (Approach 1) uncertainty was ±5.00 %");
  });
});
