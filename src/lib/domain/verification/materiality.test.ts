import { describe, expect, it } from "vitest";

import { CalculationError } from "@/lib/core/errors";

import {
  DEFAULT_MATERIALITY_THRESHOLD,
  MATERIALITY_THRESHOLDS,
  aggregateMisstatements,
  assessMateriality,
  isMaterial,
  type MisstatementLike,
} from "./materiality";

describe("threshold constants", () => {
  it("uses 5 % for limited and 2 % for reasonable assurance", () => {
    expect(MATERIALITY_THRESHOLDS.LIMITED).toBe(0.05);
    expect(MATERIALITY_THRESHOLDS.REASONABLE).toBe(0.02);
    expect(DEFAULT_MATERIALITY_THRESHOLD).toBe(0.05);
  });
});

describe("isMaterial", () => {
  it("compares the magnitude of the deviation against the threshold", () => {
    expect(isMaterial(6_000, 100_000, 0.05)).toBe(true);
    expect(isMaterial(4_000, 100_000, 0.05)).toBe(false);
    expect(isMaterial(-6_000, 100_000, 0.05)).toBe(true);
  });

  it("treats exactly on the threshold as immaterial", () => {
    expect(isMaterial(5_000, 100_000, 0.05)).toBe(false);
  });

  it("defaults to the limited-assurance threshold", () => {
    expect(isMaterial(5_100, 100_000)).toBe(true);
    expect(isMaterial(4_900, 100_000)).toBe(false);
  });

  it("validates its inputs", () => {
    expect(() => isMaterial(1, 0)).toThrow(/greater than zero/);
    expect(() => isMaterial(1, 100, 0)).toThrow(/threshold/);
    expect(() => isMaterial(1, 100, 1.5)).toThrow(/threshold/);
    expect(() => isMaterial(Number.NaN, 100)).toThrow(CalculationError);
  });
});

describe("assessMateriality", () => {
  it("reports the threshold quantity and a defensible rationale", () => {
    const assessment = assessMateriality(6_000, 100_000, 0.05);
    expect(assessment).toMatchObject({
      deviation: 6_000,
      absoluteDeviation: 6_000,
      thresholdQuantity: 5_000,
      isMaterial: true,
      isPervasive: false,
    });
    expect(assessment.relativeDeviation).toBeCloseTo(0.06, 12);
    expect(assessment.rationale).toContain("6.00 %");
    expect(assessment.rationale).toContain("above the 5.00 % materiality threshold");
  });

  it("flags a deviation beyond twice the threshold as pervasive", () => {
    expect(assessMateriality(11_000, 100_000, 0.05).isPervasive).toBe(true);
    expect(assessMateriality(9_000, 100_000, 0.05).isPervasive).toBe(false);
  });
});

describe("aggregateMisstatements", () => {
  it("yields a qualified opinion for a 6 % misstatement against a 5 % threshold", () => {
    const result = aggregateMisstatements(
      [{ id: "f1", title: "Understated refrigerant losses", deviation: 6_000 }],
      100_000,
      { threshold: 0.05 },
    );
    expect(result.relativeUncorrected).toBeCloseTo(0.06, 12);
    expect(result.isMaterial).toBe(true);
    expect(result.isPervasive).toBe(false);
    expect(result.opinionType).toBe("qualified");
    expect(result.materialFindingIds).toEqual(["f1"]);
    expect(result.rationale.join(" ")).toContain("material but confined");
  });

  it("yields an unqualified opinion within the threshold", () => {
    const result = aggregateMisstatements(
      [{ id: "f1", deviation: 2_000 }, { id: "f2", deviation: 1_000 }],
      100_000,
    );
    expect(result.opinionType).toBe("unqualified");
    expect(result.isMaterial).toBe(false);
    expect(result.materialFindingIds).toEqual([]);
    expect(result.rationale.join(" ")).toContain("below materiality");
  });

  it("yields an adverse opinion when the misstatement is pervasive by magnitude", () => {
    const result = aggregateMisstatements([{ id: "f1", deviation: 15_000 }], 100_000, {
      threshold: 0.05,
    });
    expect(result.opinionType).toBe("adverse");
    expect(result.isPervasive).toBe(true);
    expect(result.rationale.join(" ")).toContain("2× materiality");
  });

  it("yields an adverse opinion when material misstatements span too many areas", () => {
    const findings: MisstatementLike[] = [
      { id: "f1", deviation: 6_000, area: "SCOPE_1" },
      { id: "f2", deviation: 6_000, area: "SCOPE_2_LOCATION" },
    ];
    const confined = aggregateMisstatements(findings, 400_000, {
      threshold: 0.05,
      pervasiveAreaCount: 2,
    });
    // 12 000 / 400 000 = 3 %: immaterial in aggregate, so still unqualified.
    expect(confined.opinionType).toBe("unqualified");

    // 12 000 / 200 000 = 6 %: material but under 2× the threshold, so only the
    // spread across two areas makes it pervasive.
    const pervasive = aggregateMisstatements(findings, 200_000, {
      threshold: 0.05,
      pervasiveAreaCount: 2,
    });
    expect(pervasive.relativeUncorrected).toBeCloseTo(0.06, 12);
    expect(pervasive.affectedAreas).toEqual(["SCOPE_1", "SCOPE_2_LOCATION"]);
    expect(pervasive.opinionType).toBe("adverse");
    expect(pervasive.rationale.join(" ")).toContain("2 area(s)");
  });

  it("nets offsetting misstatements but still reports the gross", () => {
    const result = aggregateMisstatements(
      [
        { id: "over", deviation: 8_000 },
        { id: "under", deviation: -7_000 },
      ],
      100_000,
      { threshold: 0.05 },
    );
    expect(result.netMisstatement).toBe(1_000);
    expect(result.grossMisstatement).toBe(15_000);
    expect(result.opinionType).toBe("unqualified");
    expect(result.materialFindingIds).toEqual(["over", "under"]);
  });

  it("excludes corrected misstatements from the opinion", () => {
    const result = aggregateMisstatements(
      [
        { id: "fixed", deviation: 9_000, isCorrected: true },
        { id: "open", deviation: 1_000 },
      ],
      100_000,
      { threshold: 0.05 },
    );
    expect(result.netMisstatement).toBe(10_000);
    expect(result.uncorrectedMisstatement).toBe(1_000);
    expect(result.opinionType).toBe("unqualified");
  });

  it("disclaims when evidence was insufficient, regardless of magnitude", () => {
    const result = aggregateMisstatements([{ id: "f1", deviation: 100 }], 100_000, {
      insufficientEvidence: true,
    });
    expect(result.opinionType).toBe("disclaimer");
    expect(result.rationale.join(" ")).toContain("sufficient appropriate evidence");
  });

  it("applies the reasonable-assurance threshold when asked", () => {
    const limited = aggregateMisstatements([{ id: "f1", deviation: 3_000 }], 100_000, {
      assuranceLevel: "LIMITED",
    });
    const reasonable = aggregateMisstatements([{ id: "f1", deviation: 3_000 }], 100_000, {
      assuranceLevel: "REASONABLE",
    });
    expect(limited.opinionType).toBe("unqualified");
    expect(reasonable.threshold).toBe(0.02);
    expect(reasonable.opinionType).toBe("qualified");
  });

  it("handles an empty finding list", () => {
    const result = aggregateMisstatements([], 100_000);
    expect(result.opinionType).toBe("unqualified");
    expect(result.grossMisstatement).toBe(0);
    expect(result.rows).toEqual([]);
    expect(result.thresholdQuantity).toBe(5_000);
  });

  it("validates the reported total and the threshold", () => {
    expect(() => aggregateMisstatements([], 0)).toThrow(/greater than zero/);
    expect(() => aggregateMisstatements([], 100, { threshold: 2 })).toThrow(
      CalculationError,
    );
  });
});
