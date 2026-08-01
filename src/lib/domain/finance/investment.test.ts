import { describe, expect, it } from "vitest";

import { CalculationError } from "@/lib/core/errors";

import {
  DEFAULT_DISCOUNT_RATE,
  analyseInvestment,
  irr,
  levelizedCostOfAbatement,
  npv,
  paybackPeriod,
  roi,
} from "./investment";

describe("npv", () => {
  it("matches a hand calculation", () => {
    // −1000 + 500/1.1 + 500/1.21 + 500/1.331
    //      = −1000 + 454.545454… + 413.223140… + 375.657400…
    //      = 243.425995…
    expect(npv([-1000, 500, 500, 500], 0.1)).toBeCloseTo(243.42599549, 8);
  });

  it("leaves the t=0 flow undiscounted", () => {
    expect(npv([-1000], 0.25)).toBe(-1000);
    expect(npv([100, 0, 0], 0.5)).toBe(100);
  });

  it("equals the plain sum at a zero discount rate", () => {
    expect(npv([-1000, 500, 500, 500], 0)).toBe(500);
  });

  it("falls as the discount rate rises", () => {
    const rates = [0, 0.05, 0.1, 0.2].map((rate) => npv([-1000, 500, 500, 500], rate));
    expect(rates).toEqual([...rates].sort((a, b) => b - a));
  });

  it("rejects empty series, non-finite flows and an impossible rate", () => {
    expect(() => npv([], 0.1)).toThrow(CalculationError);
    expect(() => npv([1, Number.NaN], 0.1)).toThrow(/finite/);
    expect(() => npv([1, 2], -1)).toThrow(/greater than −1/);
  });
});

describe("irr", () => {
  it("finds ≈23.4 % for [-1000, 500, 500, 500]", () => {
    const rate = irr([-1000, 500, 500, 500]);
    expect(rate).toBeCloseTo(0.233752, 6);
    expect(npv([-1000, 500, 500, 500], rate)).toBeCloseTo(0, 6);
  });

  it("returns the rate at which NPV is zero for other series too", () => {
    const rate = irr([-5000, 1200, 1400, 1600, 1800, 2000]);
    expect(npv([-5000, 1200, 1400, 1600, 1800, 2000], rate)).toBeCloseTo(0, 6);
    expect(rate).toBeGreaterThan(0.15);
    expect(rate).toBeLessThan(0.25);
  });

  it("handles a negative IRR", () => {
    const rate = irr([-1000, 300, 300, 300]);
    expect(rate).toBeLessThan(0);
    expect(npv([-1000, 300, 300, 300], rate)).toBeCloseTo(0, 6);
  });

  it("rejects a series with no sign change", () => {
    expect(() => irr([100, 200, 300])).toThrow(/positive and one negative/);
    expect(() => irr([-100, -200])).toThrow(/positive and one negative/);
  });

  it("reports non-convergence when the root lies outside the search bounds", () => {
    expect(() => irr([-1000, 500, 500, 500], { upperBound: 0.1 })).toThrow(
      /no sign change/,
    );
  });

  it("requires at least two cash flows", () => {
    expect(() => irr([-100])).toThrow(/at least two cash flows/);
  });
});

describe("paybackPeriod", () => {
  it("interpolates inside the payback year", () => {
    // Cumulative: −1000, −600, −200, 200. Payback lands a half-year into year 3.
    expect(paybackPeriod([-1000, 400, 400, 400])).toBeCloseTo(2.5, 9);
  });

  it("returns a whole number when the cumulative flow lands exactly on zero", () => {
    expect(paybackPeriod([-1000, 500, 500])).toBeCloseTo(2, 9);
  });

  it("returns null for a project that never pays back", () => {
    expect(paybackPeriod([-1000, 100, 100])).toBeNull();
  });

  it("returns 0 when there is no upfront outlay", () => {
    expect(paybackPeriod([0, 100])).toBe(0);
  });

  it("takes longer on a discounted basis", () => {
    const simple = paybackPeriod([-1000, 400, 400, 400, 400]);
    const discounted = paybackPeriod([-1000, 400, 400, 400, 400], { discountRate: 0.1 });
    expect(discounted).not.toBeNull();
    expect(discounted as number).toBeGreaterThan(simple as number);
  });

  it("requires at least one cash flow", () => {
    expect(() => paybackPeriod([])).toThrow(CalculationError);
  });
});

describe("roi", () => {
  it("expresses net benefit over cost", () => {
    expect(roi({ totalBenefit: 1500, totalCost: 1000 })).toBeCloseTo(0.5, 12);
    expect(roi({ totalBenefit: 500, totalCost: 1000 })).toBeCloseTo(-0.5, 12);
  });

  it("rejects a zero cost", () => {
    expect(() => roi({ totalBenefit: 1, totalCost: 0 })).toThrow(CalculationError);
  });
});

describe("levelizedCostOfAbatement", () => {
  it("divides the present value of the net cost by lifetime abatement", () => {
    const result = levelizedCostOfAbatement({
      capex: 100_000,
      annualOpex: 5_000,
      annualSavings: 0,
      annualAbatement: 1_000,
      projectLifeYears: 10,
      discountRate: 0,
    });
    // 100 000 + 10 × 5 000 = 150 000 over 10 000 tCO2e.
    expect(result.npvOfNetCost).toBeCloseTo(150_000, 6);
    expect(result.totalAbatement).toBe(10_000);
    expect(result.lcoa).toBeCloseTo(15, 9);
  });

  it("goes negative for a measure that saves more than it costs", () => {
    const result = levelizedCostOfAbatement({
      capex: 50_000,
      annualSavings: 20_000,
      annualAbatement: 500,
      projectLifeYears: 10,
      discountRate: 0,
    });
    expect(result.npvOfNetCost).toBeCloseTo(-150_000, 6);
    expect(result.lcoa).toBeCloseTo(-30, 9);
  });

  it("credits the salvage value in the final year", () => {
    const withSalvage = levelizedCostOfAbatement({
      capex: 100_000,
      annualAbatement: 1_000,
      projectLifeYears: 10,
      discountRate: 0,
      salvageValue: 20_000,
    });
    expect(withSalvage.npvOfNetCost).toBeCloseTo(80_000, 6);
  });

  it("raises the cost when abatement is discounted too", () => {
    const shared = {
      capex: 100_000,
      annualAbatement: 1_000,
      projectLifeYears: 10,
      discountRate: 0.08,
    } as const;
    const undiscounted = levelizedCostOfAbatement(shared);
    const discounted = levelizedCostOfAbatement({ ...shared, discountAbatement: true });
    expect(discounted.discountedAbatement).toBeLessThan(undiscounted.totalAbatement);
    expect(discounted.lcoa).toBeGreaterThan(undiscounted.lcoa);
    expect(discounted.methodology).toContain("discounted");
  });

  it("validates its inputs", () => {
    expect(() =>
      levelizedCostOfAbatement({ capex: 1, annualAbatement: 1, projectLifeYears: 0 }),
    ).toThrow(/positive integer/);
    expect(() =>
      levelizedCostOfAbatement({ capex: 1, annualAbatement: 0, projectLifeYears: 5 }),
    ).toThrow(/greater than zero/);
  });
});

describe("analyseInvestment", () => {
  it("shapes a full appraisal to the InvestmentAnalysis columns", () => {
    const analysis = analyseInvestment({
      name: "LED retrofit",
      description: "Replace fluorescent lighting across three sites",
      capex: 1_000,
      opex: 0,
      annualSavings: 500,
      projectLifeYears: 3,
      discountRate: 0.1,
      currency: "KRW",
    });
    expect(analysis.cashflows).toEqual([-1000, 500, 500, 500]);
    expect(analysis.npv).toBeCloseTo(243.42599549, 8);
    expect(analysis.irr).toBeCloseTo(0.233752, 6);
    expect(analysis.paybackPeriod).toBeCloseTo(2, 9);
    expect(analysis.roi).toBeCloseTo(0.5, 12);
    expect(analysis.currency).toBe("KRW");
    expect(analysis.discountRate).toBe(0.1);
    expect(analysis.projectLifeYears).toBe(3);
    expect(analysis.abatementCost).toBeNull();
  });

  it("defaults the discount rate to the schema default", () => {
    const analysis = analyseInvestment({
      name: "Heat pump",
      capex: 100,
      annualSavings: 50,
      projectLifeYears: 5,
    });
    expect(analysis.discountRate).toBe(DEFAULT_DISCOUNT_RATE);
    expect(analysis.currency).toBe("USD");
  });

  it("monetises abatement at the internal carbon price", () => {
    const without = analyseInvestment({
      name: "Fuel switch",
      capex: 10_000,
      annualSavings: 500,
      projectLifeYears: 10,
      discountRate: 0.08,
      annualAbatement: 400,
    });
    const withPrice = analyseInvestment({
      name: "Fuel switch",
      capex: 10_000,
      annualSavings: 500,
      projectLifeYears: 10,
      discountRate: 0.08,
      annualAbatement: 400,
      carbonPrice: 50,
    });
    expect(without.npv).toBeLessThan(0);
    expect(withPrice.npv).toBeGreaterThan(0);
    expect(withPrice.assumptions.carbonPrice).toBe(50);
    // The abatement cost line ignores the carbon price: it is a cost measure.
    expect(withPrice.abatementCost?.lcoa).toBeCloseTo(
      without.abatementCost?.lcoa ?? Number.NaN,
      9,
    );
  });

  it("derives a risk level from the appraisal", () => {
    const low = analyseInvestment({
      name: "Quick win",
      capex: 1_000,
      annualSavings: 600,
      projectLifeYears: 10,
    });
    expect(low.riskLevel).toBe("LOW");
    expect(low.riskRationale).toContain("payback");

    const medium = analyseInvestment({
      name: "Slow burner",
      capex: 1_000,
      annualSavings: 150,
      projectLifeYears: 20,
    });
    expect(medium.riskLevel).toBe("MEDIUM");

    const high = analyseInvestment({
      name: "Loss maker",
      capex: 1_000,
      annualSavings: 50,
      projectLifeYears: 5,
    });
    expect(high.riskLevel).toBe("HIGH");
    expect(high.riskRationale).toContain("hurdle rate");
  });

  it("honours an analyst-supplied risk level", () => {
    const analysis = analyseInvestment({
      name: "CCS pilot",
      capex: 1_000,
      annualSavings: 600,
      projectLifeYears: 10,
      riskLevel: "HIGH",
    });
    expect(analysis.riskLevel).toBe("HIGH");
    expect(analysis.riskRationale).toContain("supplied by the analyst");
  });

  it("reports a null IRR instead of throwing when there is no sign change", () => {
    const analysis = analyseInvestment({
      name: "No-capex behaviour change",
      capex: 0,
      annualSavings: 100,
      projectLifeYears: 5,
    });
    expect(analysis.irr).toBeNull();
    expect(analysis.npv).toBeGreaterThan(0);
  });

  it("adds the salvage value to the final year", () => {
    const analysis = analyseInvestment({
      name: "Fleet electrification",
      capex: 1_000,
      annualSavings: 100,
      projectLifeYears: 3,
      salvageValue: 300,
    });
    expect(analysis.cashflows).toEqual([-1000, 100, 100, 400]);
  });

  it("preserves caller assumptions alongside the derived ones", () => {
    const analysis = analyseInvestment({
      name: "Solar PPA",
      capex: 5_000,
      annualSavings: 900,
      projectLifeYears: 15,
      assumptions: { gridPriceEscalation: 0.03, source: "vendor quote" },
    });
    expect(analysis.assumptions.gridPriceEscalation).toBe(0.03);
    expect(analysis.assumptions.source).toBe("vendor quote");
    expect(analysis.assumptions.annualNetCashflow).toBe(900);
  });

  it("validates its inputs", () => {
    expect(() =>
      analyseInvestment({ name: "x", capex: 1, projectLifeYears: 0 }),
    ).toThrow(/positive integer/);
    expect(() =>
      analyseInvestment({ name: "x", capex: Number.NaN, projectLifeYears: 5 }),
    ).toThrow(/capex must be finite/);
  });
});
