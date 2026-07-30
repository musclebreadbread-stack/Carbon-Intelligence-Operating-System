import { describe, expect, it } from "vitest";

import { CalculationError } from "@/lib/core/errors";

import {
  MIN_SCOPE12_ANNUAL_RATE,
  NET_ZERO_MIN_REDUCTION,
  SBTI_AMBITIONS,
  SBTI_ANNUAL_RATES,
  SCOPE3_TARGET_THRESHOLD,
  absoluteContractionPathway,
  evaluateProgress,
  netZeroPlan,
  sectoralDecarbonizationPathway,
  validateTargetAgainstCriteria,
  type ValidatableTarget,
} from "./sbti";

describe("SBTI_ANNUAL_RATES", () => {
  it("declares a rate for every ambition level, strictly decreasing", () => {
    const rates = SBTI_AMBITIONS.map((ambition) => SBTI_ANNUAL_RATES[ambition]);
    expect(rates).toEqual([...rates].sort((a, b) => b - a));
    expect(SBTI_ANNUAL_RATES.ONE_POINT_FIVE_C).toBe(0.042);
    expect(MIN_SCOPE12_ANNUAL_RATE).toBe(0.042);
  });
});

describe("absoluteContractionPathway", () => {
  const pathway = absoluteContractionPathway({
    baselineYear: 2020,
    baselineEmissions: 100_000,
    targetYear: 2030,
  });

  it("delivers 42 % cumulative reduction over 2020→2030 at 4.2 %/yr", () => {
    expect(pathway.annualRate).toBe(0.042);
    expect(pathway.targetReduction).toBeCloseTo(0.42, 12);
    expect(pathway.targetEmissions).toBeCloseTo(58_000, 6);
  });

  it("emits one TargetPathway-shaped point per year inclusive of both endpoints", () => {
    expect(pathway.points).toHaveLength(11);
    expect(pathway.points[0]).toMatchObject({
      year: 2020,
      targetEmissions: 100_000,
      actualEmissions: null,
      unit: "tCO2e",
      isInterim: false,
    });
    expect(pathway.points[10].year).toBe(2030);
    expect(pathway.points[10].isInterim).toBe(false);
    expect(pathway.points[5].targetEmissions).toBeCloseTo(79_000, 6);
    expect(pathway.points[5].isInterim).toBe(true);
    expect(pathway.points[5].methodology).toContain("Absolute Contraction Approach");
  });

  it("contracts linearly, not compound", () => {
    // A compound 4.2 %/yr would leave 100000 × 0.958^10 = 65 220, not 58 000.
    expect(pathway.points[10].targetEmissions).toBeLessThan(100_000 * 0.958 ** 10);
  });

  it("honours an explicit ambition level", () => {
    const wb2c = absoluteContractionPathway({
      baselineYear: 2020,
      baselineEmissions: 100_000,
      targetYear: 2030,
      ambition: "WELL_BELOW_2C",
    });
    expect(wb2c.targetReduction).toBeCloseTo(0.25, 12);
  });

  it("floors the pathway at zero rather than going negative", () => {
    const long = absoluteContractionPathway({
      baselineYear: 2020,
      baselineEmissions: 1_000,
      targetYear: 2060,
    });
    expect(long.targetEmissions).toBe(0);
    expect(long.points.every((point) => point.targetEmissions >= 0)).toBe(true);
  });

  it("flags only the requested interim years", () => {
    const withInterim = absoluteContractionPathway({
      baselineYear: 2020,
      baselineEmissions: 100,
      targetYear: 2030,
      interimYears: [2025],
    });
    expect(withInterim.points.filter((point) => point.isInterim).map((p) => p.year)).toEqual([
      2025,
    ]);
  });

  it("rejects a target year at or before the baseline and a negative baseline", () => {
    expect(() =>
      absoluteContractionPathway({
        baselineYear: 2030,
        baselineEmissions: 100,
        targetYear: 2030,
      }),
    ).toThrow(CalculationError);
    expect(() =>
      absoluteContractionPathway({
        baselineYear: 2020,
        baselineEmissions: -1,
        targetYear: 2030,
      }),
    ).toThrow(/non-negative/);
    expect(() =>
      absoluteContractionPathway({
        baselineYear: 2020,
        baselineEmissions: 100,
        targetYear: 2030,
        annualRate: 1.5,
      }),
    ).toThrow(/between 0 and 1/);
  });
});

describe("sectoralDecarbonizationPathway", () => {
  const pathway = sectoralDecarbonizationPathway({
    baselineYear: 2020,
    targetYear: 2030,
    companyBaselineIntensity: 2.0,
    sectorBaselineIntensity: 1.8,
    sectorTargetIntensity: 1.0,
    intensityUnit: "tCO2e/t",
  });

  it("starts at the company intensity and converges on the sector target intensity", () => {
    expect(pathway.points[0].targetIntensity).toBeCloseTo(2.0, 12);
    expect(pathway.points[10].targetIntensity).toBeCloseTo(1.0, 12);
    expect(pathway.targetIntensityReduction).toBeCloseTo(0.5, 12);
  });

  it("decreases monotonically", () => {
    const intensities = pathway.points.map((point) => point.targetIntensity);
    expect(intensities).toEqual([...intensities].sort((a, b) => b - a));
  });

  it("interpolates the sector intensity linearly", () => {
    expect(pathway.points[5].sectorIntensity).toBeCloseTo(1.4, 12);
    // P(2025) = (1.4 − 1.0)/(1.8 − 1.0) = 0.5 → 1.0 + (2.0 − 1.0)×0.5 = 1.5
    expect(pathway.points[5].targetIntensity).toBeCloseTo(1.5, 12);
  });

  it("converts to absolute emissions when an activity baseline is supplied", () => {
    const absolute = sectoralDecarbonizationPathway({
      baselineYear: 2020,
      targetYear: 2030,
      companyBaselineIntensity: 2.0,
      sectorBaselineIntensity: 1.8,
      sectorTargetIntensity: 1.0,
      baselineActivity: 10_000,
      activityGrowthRate: 0.02,
    });
    expect(absolute.points[0].targetEmissions).toBeCloseTo(20_000, 6);
    expect(absolute.points[0].activity).toBe(10_000);
    expect(absolute.points[10].activity).toBeCloseTo(10_000 * 1.02 ** 10, 6);
    expect(absolute.points[10].targetEmissions).toBeCloseTo(10_000 * 1.02 ** 10, 6);
    expect(absolute.points[0].unit).toBe("tCO2e");
  });

  it("applies the market-share parameter", () => {
    const shrinking = sectoralDecarbonizationPathway({
      baselineYear: 2020,
      targetYear: 2030,
      companyBaselineIntensity: 2.0,
      sectorBaselineIntensity: 1.8,
      sectorTargetIntensity: 1.0,
      marketShareParameter: 0.5,
    });
    // Halving m halves the company's intensity premium over the sector target.
    expect(shrinking.points[0].targetIntensity).toBeCloseTo(1.5, 12);
    expect(shrinking.points[10].targetIntensity).toBeCloseTo(1.0, 12);
  });

  it("rejects a sector target intensity that is not below the sector baseline", () => {
    expect(() =>
      sectoralDecarbonizationPathway({
        baselineYear: 2020,
        targetYear: 2030,
        companyBaselineIntensity: 2,
        sectorBaselineIntensity: 1,
        sectorTargetIntensity: 1,
      }),
    ).toThrow(/below the sector baseline/);
    expect(() =>
      sectoralDecarbonizationPathway({
        baselineYear: 2020,
        targetYear: 2030,
        companyBaselineIntensity: 2,
        sectorBaselineIntensity: 1.8,
        sectorTargetIntensity: 1,
        marketShareParameter: 0,
      }),
    ).toThrow(/greater than zero/);
  });
});

describe("evaluateProgress", () => {
  const pathway = absoluteContractionPathway({
    baselineYear: 2020,
    baselineEmissions: 100_000,
    targetYear: 2030,
  });
  const target = {
    baselineYear: 2020,
    baselineEmissions: 100_000,
    targetYear: 2030,
    pathway: pathway.points,
  };

  it("flips isOnTrack either side of the pathway value", () => {
    // The 2024 pathway value is 100 000 × (1 − 0.042×4) = 83 200.
    const under = evaluateProgress(target, [{ year: 2024, emissions: 83_000 }]);
    const over = evaluateProgress(target, [{ year: 2024, emissions: 83_400 }]);
    expect(under.latest?.pathwayEmissions).toBeCloseTo(83_200, 6);
    expect(under.isOnTrack).toBe(true);
    expect(under.status).toBe("ON_TRACK");
    expect(over.isOnTrack).toBe(false);
    expect(over.status).toBe("OFF_TRACK");
    expect(over.latest?.gapToPathway).toBeCloseTo(200, 6);
  });

  it("treats exactly on the pathway as on track", () => {
    const exact = evaluateProgress(target, [{ year: 2024, emissions: 83_200 }]);
    expect(exact.latest?.gapToPathway).toBeCloseTo(0, 9);
    expect(exact.isOnTrack).toBe(true);
  });

  it("produces TargetProgress-shaped records in year order", () => {
    const summary = evaluateProgress(target, [
      { year: 2023, emissions: 88_000 },
      { year: 2021, emissions: 95_000 },
      { year: 2022, emissions: 92_000 },
    ]);
    expect(summary.records.map((record) => record.year)).toEqual([2021, 2022, 2023]);
    // The 2021 pathway value is 100 000 × (1 − 0.042) = 95 800.
    expect(summary.records[0]).toMatchObject({
      year: 2021,
      emissions: 95_000,
      reductionFromBaseline: 5_000,
      isOnTrack: true,
    });
    expect(summary.records[0].reductionPercent).toBeCloseTo(5, 9);
    expect(summary.records[0].notes).toContain("on track");
    // 2022 pathway is 91 600 and 2023 is 87 400, so both later years slip.
    expect(summary.records.map((record) => record.isOnTrack)).toEqual([true, false, false]);
  });

  it("reports the share of the required reduction achieved", () => {
    const summary = evaluateProgress(target, [{ year: 2025, emissions: 79_000 }]);
    // 21 000 of the 42 000 tCO2e reduction the target requires.
    expect(summary.currentProgress).toBeCloseTo(0.5, 9);
  });

  it("marks a target that has already reached its endpoint as ACHIEVED", () => {
    const summary = evaluateProgress(target, [{ year: 2026, emissions: 57_000 }]);
    expect(summary.status).toBe("ACHIEVED");
  });

  it("interpolates a linear pathway when no year series is stored", () => {
    const summary = evaluateProgress(
      {
        baselineYear: 2020,
        baselineEmissions: 100_000,
        targetYear: 2030,
        targetEmissions: 58_000,
      },
      [{ year: 2025, emissions: 79_000 }],
    );
    expect(summary.latest?.pathwayEmissions).toBeCloseTo(79_000, 6);
    expect(summary.isOnTrack).toBe(true);
  });

  it("returns an empty summary for no actuals and rejects non-finite ones", () => {
    const empty = evaluateProgress(target, []);
    expect(empty.records).toEqual([]);
    expect(empty.latest).toBeNull();
    expect(empty.status).toBe("COMMITTED");
    expect(() =>
      evaluateProgress(target, [{ year: 2024, emissions: Number.NaN }]),
    ).toThrow(CalculationError);
  });
});

describe("netZeroPlan", () => {
  it("computes residual emissions and the neutralisation volume", () => {
    const plan = netZeroPlan({
      baselineYear: 2020,
      baselineEmissions: 200_000,
      netZeroYear: 2050,
      interimYear: 2030,
    });
    expect(plan.longTermReduction).toBe(NET_ZERO_MIN_REDUCTION);
    expect(plan.residualEmissions).toBeCloseTo(20_000, 6);
    expect(plan.abatedEmissions).toBeCloseTo(180_000, 6);
    expect(plan.neutralizationVolume).toBe(plan.residualEmissions);
    expect(plan.meetsNetZeroStandard).toBe(true);
    expect(plan.commitment.status).toBe("COMMITTED");
    expect(plan.commitment.residualEmissions).toBeCloseTo(20_000, 6);
  });

  it("derives the interim target from the 1.5 °C near-term rate", () => {
    const plan = netZeroPlan({
      baselineYear: 2020,
      baselineEmissions: 100_000,
      netZeroYear: 2050,
      interimYear: 2030,
    });
    // 4.2 %/yr × 10 years = 42 % → 58 000 tCO2e.
    expect(plan.commitment.interimTarget).toBeCloseTo(58_000, 6);
    expect(plan.commitment.interimYear).toBe(2030);
  });

  it("ends the pathway on the residual, not on zero", () => {
    const plan = netZeroPlan({
      baselineYear: 2020,
      baselineEmissions: 100_000,
      netZeroYear: 2040,
      interimYear: 2030,
    });
    expect(plan.pathway).toHaveLength(21);
    expect(plan.pathway[20].targetEmissions).toBeCloseTo(10_000, 6);
  });

  it("warns when the commitment falls short of the standard", () => {
    const plan = netZeroPlan({
      baselineYear: 2020,
      baselineEmissions: 100_000,
      netZeroYear: 2060,
      longTermReduction: 0.7,
    });
    expect(plan.meetsNetZeroStandard).toBe(false);
    expect(plan.commitment.status).toBe("DRAFT");
    const codes = plan.warnings.join(" ");
    expect(codes).toContain("deep-abatement floor");
    expect(codes).toContain("later than 2050");
    expect(codes).toContain("interim");
  });

  it("validates its inputs", () => {
    expect(() =>
      netZeroPlan({ baselineYear: 2050, baselineEmissions: 1, netZeroYear: 2040 }),
    ).toThrow(CalculationError);
    expect(() =>
      netZeroPlan({
        baselineYear: 2020,
        baselineEmissions: 1,
        netZeroYear: 2050,
        longTermReduction: 1.2,
      }),
    ).toThrow(/between 0 and 1/);
  });
});

describe("validateTargetAgainstCriteria", () => {
  const base: ValidatableTarget = {
    boundary: "SCOPE_1_2",
    baselineYear: 2020,
    baselineEmissions: 100_000,
    targetYear: 2030,
    targetReduction: 42,
    submissionYear: 2023,
    scope1Emissions: 40_000,
    scope2Emissions: 40_000,
    scope3Emissions: 20_000,
  };

  it("accepts a compliant 1.5 °C aligned near-term target", () => {
    const result = validateTargetAgainstCriteria(base);
    expect(result.isEligible).toBe(true);
    expect(result.warnings).toEqual([]);
    expect(result.impliedAnnualRate).toBeCloseTo(0.042, 12);
    expect(result.scope3Share).toBeCloseTo(0.2, 12);
    expect(result.requiresScope3Target).toBe(false);
  });

  it("fires the Scope 3 threshold warning at a 45 % Scope 3 share", () => {
    const result = validateTargetAgainstCriteria({
      ...base,
      scope1Emissions: 27_500,
      scope2Emissions: 27_500,
      scope3Emissions: 45_000,
    });
    expect(result.scope3Share).toBeCloseTo(0.45, 12);
    expect(result.requiresScope3Target).toBe(true);
    expect(result.isEligible).toBe(false);
    const warning = result.warnings.find((w) => w.code === "SCOPE3_TARGET_REQUIRED");
    expect(warning?.severity).toBe("BLOCKING");
    expect(warning?.message).toContain("45.0 %");
  });

  it("does not fire the Scope 3 warning exactly at the threshold", () => {
    const result = validateTargetAgainstCriteria({
      ...base,
      scope1Emissions: 30_000,
      scope2Emissions: 30_000,
      scope3Emissions: 40_000,
    });
    expect(result.scope3Share).toBeCloseTo(SCOPE3_TARGET_THRESHOLD, 12);
    expect(result.requiresScope3Target).toBe(false);
    expect(result.isEligible).toBe(true);
  });

  it("accepts a high Scope 3 share when the boundary already covers Scope 3", () => {
    const result = validateTargetAgainstCriteria({
      ...base,
      boundary: "SCOPE_1_2_3",
      scope1Emissions: 27_500,
      scope2Emissions: 27_500,
      scope3Emissions: 45_000,
    });
    expect(result.requiresScope3Target).toBe(true);
    expect(result.warnings.some((w) => w.code === "SCOPE3_TARGET_REQUIRED")).toBe(false);
    expect(result.isEligible).toBe(true);
  });

  it("rejects a base year before 2015", () => {
    const result = validateTargetAgainstCriteria({
      ...base,
      baselineYear: 2010,
      targetYear: 2030,
      targetReduction: 84,
      submissionYear: 2023,
    });
    expect(result.warnings.some((w) => w.code === "BASELINE_TOO_OLD")).toBe(true);
    expect(result.isEligible).toBe(false);
  });

  it("rejects an under-ambitious Scope 1+2 target", () => {
    const result = validateTargetAgainstCriteria({ ...base, targetReduction: 25 });
    const warning = result.warnings.find((w) => w.code === "AMBITION_BELOW_MINIMUM");
    expect(warning?.message).toContain("2.50 %/yr");
    expect(warning?.message).toContain("4.20 %/yr");
    expect(result.isEligible).toBe(false);
  });

  it("applies the softer well-below-2 °C floor to a Scope 3-only target", () => {
    const scope3Only = validateTargetAgainstCriteria({
      ...base,
      boundary: "SCOPE_3_ONLY",
      targetReduction: 25,
    });
    expect(scope3Only.isEligible).toBe(true);
    const tooLow = validateTargetAgainstCriteria({
      ...base,
      boundary: "SCOPE_3_ONLY",
      targetReduction: 10,
    });
    expect(
      tooLow.warnings.some((w) => w.code === "SCOPE3_AMBITION_BELOW_MINIMUM"),
    ).toBe(true);
  });

  it("enforces the 5–10 year submission horizon", () => {
    const tooShort = validateTargetAgainstCriteria({
      ...base,
      submissionYear: 2027,
      targetYear: 2030,
      baselineYear: 2020,
      targetReduction: 42,
    });
    expect(tooShort.warnings.some((w) => w.code === "HORIZON_TOO_SHORT")).toBe(true);
    const tooLong = validateTargetAgainstCriteria({
      ...base,
      submissionYear: 2023,
      targetYear: 2040,
      targetReduction: 84,
    });
    expect(tooLong.warnings.some((w) => w.code === "HORIZON_TOO_LONG")).toBe(true);
  });

  it("blocks a target with no base-year inventory", () => {
    const result = validateTargetAgainstCriteria({ ...base, baselineEmissions: null });
    expect(result.warnings.some((w) => w.code === "BASELINE_EMISSIONS_MISSING")).toBe(true);
    expect(result.isEligible).toBe(false);
  });

  it("reports an unknown Scope 3 share as advisory only", () => {
    const result = validateTargetAgainstCriteria({
      ...base,
      scope1Emissions: null,
      scope2Emissions: null,
      scope3Emissions: 45_000,
    });
    expect(result.scope3Share).toBeNull();
    const warning = result.warnings.find((w) => w.code === "SCOPE3_SHARE_UNKNOWN");
    expect(warning?.severity).toBe("ADVISORY");
    expect(result.isEligible).toBe(true);
  });
});
