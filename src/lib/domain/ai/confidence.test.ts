import { describe, expect, it } from "vitest";

import { CalculationError } from "@/lib/core/errors";
import { sum } from "@/lib/core/number";

import {
  CONFIDENCE_FACTORS,
  CONFIDENCE_WEIGHTS,
  NEUTRAL_FACTOR_SCORE,
  confidenceFactorsFromCalculation,
  scoreConfidence,
} from "./confidence";

describe("rubric definition", () => {
  it("has weights over all six factors summing to 1", () => {
    expect(Object.keys(CONFIDENCE_WEIGHTS).sort()).toEqual([...CONFIDENCE_FACTORS].sort());
    expect(sum(CONFIDENCE_FACTORS.map((factor) => CONFIDENCE_WEIGHTS[factor]))).toBeCloseTo(
      1,
      12,
    );
  });
});

describe("scoreConfidence", () => {
  const full = {
    dataQuality: 0.9,
    coverage: 0.95,
    factorSpecificity: 0.8,
    methodRigour: 0.85,
    uncertainty: 0.7,
    verification: 1,
  };

  it("reproduces the total from the breakdown contributions", () => {
    const score = scoreConfidence(full);
    expect(sum(score.breakdown.map((row) => row.contribution))).toBeCloseTo(score.score, 12);
    // 0.27 + 0.19 + 0.16 + 0.1275 + 0.07 + 0.05 = 0.8675
    expect(score.score).toBeCloseTo(0.8675, 12);
    expect(score.scorePercent).toBeCloseTo(86.75, 9);
    expect(score.level).toBe("HIGH");
  });

  it("emits one breakdown row per factor, shaped to ConfidenceBreakdown", () => {
    const score = scoreConfidence(full);
    expect(score.breakdown.map((row) => row.factor)).toEqual([...CONFIDENCE_FACTORS]);
    const dataQuality = score.breakdown[0];
    expect(dataQuality).toMatchObject({
      factor: "dataQuality",
      score: 0.9,
      weight: 0.3,
      isDefaulted: false,
    });
    expect(dataQuality.contribution).toBeCloseTo(0.27, 12);
    expect(dataQuality.description.length).toBeGreaterThan(0);
    expect(dataQuality.methodology).toContain("weighted at 0.3");
  });

  it("bands the level", () => {
    const bands: readonly [number, string][] = [
      [1, "VERY_HIGH"],
      [0.8, "HIGH"],
      [0.6, "MEDIUM"],
      [0.4, "LOW"],
      [0.1, "VERY_LOW"],
    ];
    for (const [value, level] of bands) {
      const score = scoreConfidence(
        Object.fromEntries(CONFIDENCE_FACTORS.map((factor) => [factor, value])),
      );
      expect(score.score).toBeCloseTo(value, 12);
      expect(score.level).toBe(level);
    }
  });

  it("uses the neutral default for missing factors and flags them", () => {
    const score = scoreConfidence({ dataQuality: 1 });
    expect(score.defaultedFactors).toEqual(
      CONFIDENCE_FACTORS.filter((factor) => factor !== "dataQuality"),
    );
    // 1×0.3 + 0.6×0.7 = 0.72
    expect(score.score).toBeCloseTo(0.72, 12);
    expect(score.breakdown[1].isDefaulted).toBe(true);
    expect(score.breakdown[1].score).toBe(NEUTRAL_FACTOR_SCORE);
    expect(score.breakdown[1].methodology).toContain("neutral default");
    expect(score.explanation).toContain("neutral default");
  });

  it("names the factor losing the most weighted contribution", () => {
    const score = scoreConfidence({
      dataQuality: 0.2, // loses 0.24 of its 0.3
      coverage: 0.9,
      factorSpecificity: 0.9,
      methodRigour: 0.9,
      uncertainty: 0.9,
      verification: 0,
    });
    expect(score.weakestFactor).toBe("dataQuality");
    expect(score.explanation).toContain("Weakest factor: dataQuality");
  });

  it("accepts weight overrides that still sum to 1", () => {
    const score = scoreConfidence(
      { dataQuality: 1, coverage: 0, factorSpecificity: 0, methodRigour: 0, uncertainty: 0, verification: 0 },
      { weights: { dataQuality: 0.5, coverage: 0 } },
    );
    expect(score.breakdown[0].weight).toBe(0.5);
    expect(score.score).toBeCloseTo(0.5, 12);
  });

  it("rejects weights that do not sum to 1", () => {
    expect(() => scoreConfidence({}, { weights: { dataQuality: 0.9 } })).toThrow(
      /must sum to 1/,
    );
  });

  it("rejects out-of-range factor values", () => {
    expect(() => scoreConfidence({ dataQuality: 1.2 })).toThrow(/must be in \[0, 1\]/);
    expect(() => scoreConfidence({ coverage: -0.1 })).toThrow(CalculationError);
    expect(() => scoreConfidence({ coverage: Number.NaN })).toThrow(CalculationError);
  });

  it("labels the metric and records the applied factors", () => {
    const score = scoreConfidence(full, { metric: "scope3-total" });
    expect(score.metric).toBe("scope3-total");
    expect(score.factors).toEqual(full);
    expect(score.methodology).toContain("CIOS confidence rubric v1");
  });

  it("scores everything at zero as VERY_LOW", () => {
    const score = scoreConfidence(
      Object.fromEntries(CONFIDENCE_FACTORS.map((factor) => [factor, 0])),
    );
    expect(score.score).toBe(0);
    expect(score.level).toBe("VERY_LOW");
  });
});

describe("confidenceFactorsFromCalculation", () => {
  it("derives factors from the platform's own numbers", () => {
    const factors = confidenceFactorsFromCalculation({
      dataQualityScore: 85,
      coverage: 0.92,
      specificFactorShare: 0.4,
      rigorousMethodShare: 0.7,
      overallUncertainty: 6,
      verifiedShare: 1,
    });
    expect(factors.dataQuality).toBeCloseTo(0.85, 12);
    expect(factors.coverage).toBe(0.92);
    expect(factors.factorSpecificity).toBe(0.4);
    expect(factors.methodRigour).toBe(0.7);
    // 1 − 6/30
    expect(factors.uncertainty).toBeCloseTo(0.8, 12);
    expect(factors.verification).toBe(1);
  });

  it("scores uncertainty at zero once it reaches the ceiling", () => {
    expect(
      confidenceFactorsFromCalculation({ overallUncertainty: 40 }).uncertainty,
    ).toBe(0);
    expect(
      confidenceFactorsFromCalculation({ overallUncertainty: 5, uncertaintyCeiling: 10 })
        .uncertainty,
    ).toBeCloseTo(0.5, 12);
  });

  it("omits factors it was given nothing for, so they fall back to neutral", () => {
    const factors = confidenceFactorsFromCalculation({ dataQualityScore: 90 });
    expect(Object.keys(factors)).toEqual(["dataQuality"]);
    const score = scoreConfidence(factors);
    expect(score.defaultedFactors).toHaveLength(5);
  });

  it("clamps out-of-range inputs rather than throwing", () => {
    const factors = confidenceFactorsFromCalculation({
      dataQualityScore: 150,
      coverage: 1.4,
    });
    expect(factors.dataQuality).toBe(1);
    expect(factors.coverage).toBe(1);
    expect(() => scoreConfidence(factors)).not.toThrow();
  });

  it("feeds straight into scoreConfidence", () => {
    const score = scoreConfidence(
      confidenceFactorsFromCalculation({
        dataQualityScore: 100,
        coverage: 1,
        specificFactorShare: 1,
        rigorousMethodShare: 1,
        overallUncertainty: 0,
        verifiedShare: 1,
      }),
      { metric: "inventory" },
    );
    expect(score.score).toBeCloseTo(1, 12);
    expect(score.level).toBe("VERY_HIGH");
    expect(score.defaultedFactors).toEqual([]);
  });
});
