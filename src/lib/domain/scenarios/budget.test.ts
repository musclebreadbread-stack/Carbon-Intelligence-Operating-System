import { describe, expect, it } from "vitest";

import { CalculationError } from "@/lib/core/errors";

import { budgetFromPathway, consumeBudget, type CarbonBudgetLike } from "./budget";
import { projectScenario } from "./project";

const budget: CarbonBudgetLike = {
  name: "1.5 °C corporate budget",
  totalBudget: 500,
  startYear: 2024,
  endYear: 2033,
  temperature: 1.5,
};

describe("consumeBudget", () => {
  it("accumulates usage and reports the remaining allowance", () => {
    const result = consumeBudget(budget, [
      { year: 2024, emissions: 100 },
      { year: 2025, emissions: 90 },
      { year: 2026, emissions: 80 },
    ]);
    expect(result.usedBudget).toBe(270);
    expect(result.remainingBudget).toBe(230);
    expect(result.utilisation).toBeCloseTo(0.54, 12);
    expect(result.status).toBe("active");
    expect(result.overshootYear).toBeNull();
    expect(result.overshootAmount).toBe(0);
    expect(result.unit).toBe("tCO2e");
    expect(result.methodology).toContain("1.5 °C");
  });

  it("detects the overshoot in the right year", () => {
    const result = consumeBudget(budget, [
      { year: 2024, emissions: 200 },
      { year: 2025, emissions: 200 },
      // Cumulative 500 exactly — still inside the budget.
      { year: 2026, emissions: 100 },
      // Cumulative 560 — the first overshoot.
      { year: 2027, emissions: 60 },
      { year: 2028, emissions: 10 },
    ]);
    expect(result.years[2].cumulativeEmissions).toBe(500);
    expect(result.years[2].isOvershoot).toBe(false);
    expect(result.overshootYear).toBe(2027);
    expect(result.overshootAmount).toBe(70);
    expect(result.remainingBudget).toBe(-70);
    expect(result.status).toBe("exhausted");
    expect(result.remainingAnnualAllowance).toBeNull();
  });

  it("reports per-year cumulative, remaining and utilisation figures", () => {
    const result = consumeBudget(budget, [
      { year: 2024, emissions: 50 },
      { year: 2025, emissions: 50 },
    ]);
    expect(result.years).toHaveLength(2);
    expect(result.years[1]).toMatchObject({
      year: 2025,
      emissions: 50,
      cumulativeEmissions: 100,
      remainingBudget: 400,
      isOvershoot: false,
    });
    expect(result.years[1].utilisation).toBeCloseTo(0.2, 12);
    expect(result.years[1].linearAllowance).toBe(50);
  });

  it("lists the budget years with no data and the series years outside the period", () => {
    const result = consumeBudget(budget, [
      { year: 2023, emissions: 999 },
      { year: 2024, emissions: 10 },
      { year: 2034, emissions: 999 },
    ]);
    expect(result.excludedYears).toEqual([2023, 2034]);
    expect(result.usedBudget).toBe(10);
    expect(result.missingYears).toEqual([
      2025, 2026, 2027, 2028, 2029, 2030, 2031, 2032, 2033,
    ]);
  });

  it("spreads the remaining budget evenly over the years still to come", () => {
    const result = consumeBudget(budget, [
      { year: 2024, emissions: 100 },
      { year: 2025, emissions: 100 },
    ]);
    // 300 left over 2026–2033, i.e. 8 years.
    expect(result.remainingAnnualAllowance).toBeCloseTo(37.5, 12);
  });

  it("handles an empty series", () => {
    const result = consumeBudget(budget, []);
    expect(result.usedBudget).toBe(0);
    expect(result.years).toEqual([]);
    expect(result.missingYears).toHaveLength(10);
    expect(result.remainingAnnualAllowance).toBeCloseTo(50, 12);
  });

  it("sorts an out-of-order series before accumulating", () => {
    const result = consumeBudget(budget, [
      { year: 2026, emissions: 300 },
      { year: 2024, emissions: 150 },
      { year: 2025, emissions: 100 },
    ]);
    expect(result.years.map((year) => year.year)).toEqual([2024, 2025, 2026]);
    expect(result.overshootYear).toBe(2026);
  });

  it("rejects duplicate years and invalid inputs", () => {
    expect(() =>
      consumeBudget(budget, [
        { year: 2024, emissions: 1 },
        { year: 2024, emissions: 2 },
      ]),
    ).toThrow(/Duplicate budget series entry/);
    expect(() => consumeBudget(budget, [{ year: 2024, emissions: -1 }])).toThrow(
      /non-negative/,
    );
    expect(() => consumeBudget({ ...budget, endYear: 2020 }, [])).toThrow(
      /precedes its start year/,
    );
    expect(() => consumeBudget({ ...budget, totalBudget: -1 }, [])).toThrow(
      CalculationError,
    );
    expect(() => consumeBudget({ ...budget, startYear: 2024.5 }, [])).toThrow(/integers/);
  });

  it("accepts a projected scenario series directly", () => {
    const projection = projectScenario({
      type: "CUSTOM",
      baseline: {
        year: 2024,
        scope1Emissions: 40,
        scope2Emissions: 30,
        scope3Emissions: 30,
      },
      targetYear: 2033,
      assumptions: [{ parameter: "abatementAmbition", value: 1 }],
    });
    const result = consumeBudget(
      budget,
      projection.points.map((point) => ({
        year: point.year,
        emissions: point.totalEmissions,
      })),
    );
    // A linear ramp from 100 to 0 over 10 points sums to 500.
    expect(result.usedBudget).toBeCloseTo(500, 6);
    expect(result.overshootYear).toBeNull();
    expect(result.missingYears).toEqual([]);
  });
});

describe("budgetFromPathway", () => {
  it("integrates a linear pathway trapezoidally", () => {
    const derived = budgetFromPathway({
      startYear: 2024,
      endYear: 2033,
      startEmissions: 100,
      endEmissions: 58,
      temperature: 1.5,
    });
    expect(derived.totalBudget).toBeCloseTo(790, 9);
    expect(derived.startYear).toBe(2024);
    expect(derived.endYear).toBe(2033);
    expect(derived.temperature).toBe(1.5);
    expect(derived.methodology).toContain("Trapezoidal");
  });

  it("grants exactly what the pathway itself allows", () => {
    const derived = budgetFromPathway({
      startYear: 2024,
      endYear: 2033,
      startEmissions: 100,
      endEmissions: 0,
    });
    const series = Array.from({ length: 10 }, (_, index) => ({
      year: 2024 + index,
      emissions: 100 - (100 * index) / 9,
    }));
    const result = consumeBudget(derived, series);
    expect(result.usedBudget).toBeCloseTo(derived.totalBudget, 6);
    expect(result.overshootYear).toBeNull();
  });

  it("rejects an inverted period", () => {
    expect(() =>
      budgetFromPathway({
        startYear: 2033,
        endYear: 2024,
        startEmissions: 1,
        endEmissions: 1,
      }),
    ).toThrow(CalculationError);
  });
});
