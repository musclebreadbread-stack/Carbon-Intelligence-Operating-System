import { describe, expect, it } from "vitest";

import { CalculationError } from "@/lib/core/errors";
import { sum } from "@/lib/core/number";

import {
  buildMaccCurve,
  marginalCostAt,
  selectPortfolio,
  type AbatementTechnologyLike,
} from "./macc";

const technologies: readonly AbatementTechnologyLike[] = [
  { id: "ccs", name: "Carbon capture", abatementPotential: 5_000, costPerTonne: 120, technologyReadiness: 6 },
  { id: "led", name: "LED lighting", abatementPotential: 500, costPerTonne: -40, technologyReadiness: 9 },
  { id: "hp", name: "Heat pumps", abatementPotential: 2_000, costPerTonne: 35, technologyReadiness: 9 },
  { id: "pv", name: "Rooftop solar", abatementPotential: 1_500, costPerTonne: -10, technologyReadiness: 9 },
  { id: "h2", name: "Green hydrogen", abatementPotential: 3_000, costPerTonne: 250, technologyReadiness: 4 },
];

describe("buildMaccCurve", () => {
  const curve = buildMaccCurve(technologies, 2030, { currency: "USD", region: "KR" });

  it("sorts steps by ascending marginal cost", () => {
    expect(curve.points.map((point) => point.technologyId)).toEqual([
      "led",
      "pv",
      "hp",
      "ccs",
      "h2",
    ]);
    const costs = curve.points.map((point) => point.marginalCost);
    expect(costs).toEqual([...costs].sort((a, b) => a - b));
    expect(curve.points.map((point) => point.rank)).toEqual([1, 2, 3, 4, 5]);
  });

  it("accumulates abatement monotonically and shapes points to MACCCurve", () => {
    const cumulative = curve.points.map((point) => point.cumulativeAbatement);
    expect(cumulative).toEqual([500, 2_000, 4_000, 9_000, 12_000]);
    expect(cumulative).toEqual([...cumulative].sort((a, b) => a - b));
    expect(curve.points[0]).toMatchObject({
      technologyId: "led",
      name: "LED lighting",
      abatementPotential: 500,
      marginalCost: -40,
      cumulativeAbatement: 500,
      cumulativeAbatementStart: 0,
      year: 2030,
      region: "KR",
      currency: "USD",
    });
    expect(curve.points[2].cumulativeAbatementStart).toBe(2_000);
  });

  it("reports curve-level totals", () => {
    expect(curve.totalAbatementPotential).toBe(12_000);
    expect(curve.negativeCostAbatement).toBe(2_000);
    // −20 000 − 15 000 + 70 000 + 600 000 + 750 000
    expect(curve.totalCost).toBeCloseTo(1_385_000, 6);
    expect(curve.averageCost).toBeCloseTo(1_385_000 / 12_000, 9);
    expect(curve.points[curve.points.length - 1].cumulativeCost).toBeCloseTo(
      curve.totalCost,
      6,
    );
  });

  it("filters by technology readiness", () => {
    const mature = buildMaccCurve(technologies, 2030, { minTechnologyReadiness: 8 });
    expect(mature.points.map((point) => point.technologyId)).toEqual(["led", "pv", "hp"]);
    expect(mature.totalAbatementPotential).toBe(4_000);
  });

  it("is deterministic regardless of the input order", () => {
    const shuffled = buildMaccCurve([...technologies].reverse(), 2030, {
      currency: "USD",
      region: "KR",
    });
    expect(shuffled.points).toEqual(curve.points);
  });

  it("breaks cost ties by the larger potential, then by id", () => {
    const tied = buildMaccCurve(
      [
        { id: "b", name: "B", abatementPotential: 100, costPerTonne: 10 },
        { id: "a", name: "A", abatementPotential: 100, costPerTonne: 10 },
        { id: "c", name: "C", abatementPotential: 300, costPerTonne: 10 },
      ],
      2030,
    );
    expect(tied.points.map((point) => point.technologyId)).toEqual(["c", "a", "b"]);
  });

  it("handles an empty technology list", () => {
    const empty = buildMaccCurve([], 2030);
    expect(empty.points).toEqual([]);
    expect(empty.totalAbatementPotential).toBe(0);
    expect(empty.averageCost).toBe(0);
  });

  it("validates its inputs", () => {
    expect(() =>
      buildMaccCurve([{ id: "x", name: "X", abatementPotential: 0, costPerTonne: 1 }], 2030),
    ).toThrow(/greater than zero/);
    expect(() =>
      buildMaccCurve(
        [{ id: "x", name: "X", abatementPotential: 1, costPerTonne: Number.NaN }],
        2030,
      ),
    ).toThrow(/finite/);
    expect(() => buildMaccCurve(technologies, 2030.5)).toThrow(CalculationError);
  });
});

describe("selectPortfolio", () => {
  const curve = buildMaccCurve(technologies, 2030);

  it("takes the cheapest measures first to meet a target exactly", () => {
    const portfolio = selectPortfolio(curve, { abatementTarget: 3_000 });
    expect(portfolio.selections.map((s) => s.technologyId)).toEqual(["led", "pv", "hp"]);
    expect(portfolio.totalAbatement).toBeCloseTo(3_000, 9);
    expect(portfolio.meetsTarget).toBe(true);
    expect(portfolio.unmetAbatement).toBe(0);
    // 500×−40 + 1500×−10 + 1000×35 = −20 000 − 15 000 + 35 000 = 0
    expect(portfolio.totalCost).toBeCloseTo(0, 6);
    const partial = portfolio.selections[2];
    expect(partial.isPartial).toBe(true);
    expect(partial.selectedAbatement).toBeCloseTo(1_000, 9);
    expect(partial.availableAbatement).toBe(2_000);
  });

  it("skips the measures behind a met target", () => {
    const portfolio = selectPortfolio(curve, { abatementTarget: 2_000 });
    expect(portfolio.skipped.map((entry) => entry.technologyId)).toEqual([
      "hp",
      "ccs",
      "h2",
    ]);
    expect(portfolio.skipped[0].reason).toContain("already met");
  });

  it("takes whole measures only when partials are disallowed", () => {
    const portfolio = selectPortfolio(curve, {
      abatementTarget: 3_000,
      allowPartial: false,
    });
    expect(portfolio.selections.map((s) => s.technologyId)).toEqual(["led", "pv", "hp"]);
    expect(portfolio.totalAbatement).toBe(4_000);
    expect(portfolio.selections.every((s) => !s.isPartial)).toBe(true);
  });

  it("stops when the budget runs out", () => {
    const portfolio = selectPortfolio(curve, { budget: 100_000 });
    expect(portfolio.totalCost).toBeCloseTo(100_000, 6);
    expect(portfolio.budgetRemaining).toBeCloseTo(0, 6);
    // The negative-cost measures are free, then 35/t buys the rest.
    expect(portfolio.selections.map((s) => s.technologyId)).toEqual([
      "led",
      "pv",
      "hp",
      "ccs",
    ]);
    expect(portfolio.selections[3].isPartial).toBe(true);
  });

  it("records a reason when a whole measure will not fit the budget", () => {
    // Heat pumps cost 2 000 × 35 = 70 000, more than the 50 000 budget, and the
    // savings the negative-cost measures release do not expand it.
    const portfolio = selectPortfolio(curve, { budget: 50_000, allowPartial: false });
    expect(portfolio.selections.map((s) => s.technologyId)).toEqual(["led", "pv"]);
    const skippedHeatPumps = portfolio.skipped.find((entry) => entry.technologyId === "hp");
    expect(skippedHeatPumps?.reason).toContain("remains");
    expect(portfolio.skipped.map((entry) => entry.technologyId)).toEqual([
      "hp",
      "ccs",
      "h2",
    ]);
  });

  it("reports an unmet target when the curve cannot deliver it", () => {
    const portfolio = selectPortfolio(curve, { abatementTarget: 20_000 });
    expect(portfolio.totalAbatement).toBe(12_000);
    expect(portfolio.unmetAbatement).toBe(8_000);
    expect(portfolio.meetsTarget).toBe(false);
  });

  it("takes the whole curve when unconstrained", () => {
    const portfolio = selectPortfolio(curve);
    expect(portfolio.totalAbatement).toBe(curve.totalAbatementPotential);
    expect(portfolio.totalCost).toBeCloseTo(curve.totalCost, 6);
    expect(portfolio.budgetRemaining).toBeNull();
    expect(sum(portfolio.selections.map((s) => s.cost))).toBeCloseTo(curve.totalCost, 6);
  });

  it("validates its constraints", () => {
    expect(() => selectPortfolio(curve, { abatementTarget: -1 })).toThrow(
      /non-negative/,
    );
    expect(() => selectPortfolio(curve, { budget: Number.NaN })).toThrow(
      CalculationError,
    );
  });
});

describe("marginalCostAt", () => {
  const curve = buildMaccCurve(technologies, 2030);

  it("returns the height of the curve at a cumulative volume", () => {
    expect(marginalCostAt(curve, 400)).toBe(-40);
    expect(marginalCostAt(curve, 500)).toBe(-40);
    expect(marginalCostAt(curve, 501)).toBe(-10);
    expect(marginalCostAt(curve, 3_000)).toBe(35);
    expect(marginalCostAt(curve, 12_000)).toBe(250);
  });

  it("returns null outside the curve", () => {
    expect(marginalCostAt(curve, 0)).toBeNull();
    expect(marginalCostAt(curve, 20_000)).toBeNull();
  });
});
