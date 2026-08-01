import { describe, expect, it } from "vitest";

import { CalculationError } from "@/lib/core/errors";
import { sum } from "@/lib/core/number";

import { buildRoadmap, type RoadmapActionLike } from "./plan";

const endOf = (year: number) => new Date(Date.UTC(year, 11, 31));

const actions: readonly RoadmapActionLike[] = [
  {
    id: "a-led",
    name: "LED retrofit",
    category: "Energy efficiency",
    scope: "SCOPE_2_LOCATION",
    expectedReduction: 1_000,
    endDate: endOf(2026),
    costEstimate: 40_000,
    status: "completed",
    actualReduction: 900,
  },
  {
    id: "a-ppa",
    name: "Solar PPA",
    category: "Renewable electricity",
    scope: "SCOPE_2_MARKET",
    expectedReduction: 4_000,
    endDate: endOf(2028),
    costEstimate: 500_000,
  },
  {
    id: "a-heat",
    name: "Boiler electrification",
    category: "Fuel switching",
    scope: "SCOPE_1",
    expectedReduction: 2_500,
    endDate: endOf(2028),
    costEstimate: 250_000,
    priority: 5,
  },
  {
    id: "a-supplier",
    name: "Supplier engagement programme",
    category: "Value chain",
    scope: "SCOPE_3",
    expectedReduction: 3_000,
    endDate: endOf(2030),
    costEstimate: 120_000,
  },
];

describe("buildRoadmap", () => {
  const roadmap = buildRoadmap({
    baseline: { year: 2024, emissions: 30_000 },
    target: { year: 2030, emissions: 18_000 },
    actions,
  });

  it("computes the gap as the required reduction less the sum of action reductions", () => {
    expect(roadmap.requiredReduction).toBe(12_000);
    expect(roadmap.plannedReduction).toBe(10_500);
    expect(roadmap.plannedReduction).toBe(sum(actions.map((a) => a.expectedReduction)));
    expect(roadmap.residualGap).toBe(1_500);
    expect(roadmap.residualGapPercent).toBeCloseTo(12.5, 9);
    expect(roadmap.isFullyPlanned).toBe(false);
    expect(roadmap.roadmap.status).toBe("draft");
    expect(roadmap.warnings.some((w) => w.includes("short of"))).toBe(true);
  });

  it("closes the gap when the actions cover the target", () => {
    const complete = buildRoadmap({
      baseline: { year: 2024, emissions: 30_000 },
      target: { year: 2030, emissions: 19_500 },
      actions,
    });
    expect(complete.residualGap).toBe(0);
    expect(complete.isFullyPlanned).toBe(true);
    expect(complete.roadmap.status).toBe("planned");
    expect(complete.warnings.some((w) => w.includes("short of"))).toBe(false);
  });

  it("shapes the header to DecarbonizationRoadmap", () => {
    expect(roadmap.roadmap).toMatchObject({
      baselineYear: 2024,
      targetYear: 2030,
      baselineEmissions: 30_000,
      targetEmissions: 18_000,
      targetType: "absolute",
    });
    expect(roadmap.roadmap.reductionTarget).toBeCloseTo(40, 9);
    expect(roadmap.roadmap.name).toContain("2024–2030");
  });

  it("accepts a reduction percentage instead of an absolute target", () => {
    const byPercent = buildRoadmap({
      baseline: { year: 2024, emissions: 30_000 },
      target: { year: 2030, reductionPercent: 40 },
      actions,
    });
    expect(byPercent.roadmap.targetEmissions).toBeCloseTo(18_000, 6);
    expect(byPercent.requiredReduction).toBeCloseTo(12_000, 6);
  });

  it("sequences actions by completion year then priority then cost per tonne", () => {
    expect(roadmap.actions.map((action) => action.id)).toEqual([
      "a-led",
      "a-heat", // priority 5 beats the cheaper PPA within 2028
      "a-ppa",
      "a-supplier",
    ]);
    expect(roadmap.actions.map((action) => action.sequence)).toEqual([1, 2, 3, 4]);
    expect(roadmap.actions.map((action) => action.cumulativeReduction)).toEqual([
      1_000, 3_500, 7_500, 10_500,
    ]);
    expect(roadmap.actions[0].costPerTonne).toBeCloseTo(40, 9);
  });

  it("groups actions into one milestone per completion year", () => {
    expect(roadmap.milestones.map((milestone) => milestone.targetYear)).toEqual([
      2026, 2028, 2030,
    ]);
    expect(roadmap.milestones[1]).toMatchObject({
      targetYear: 2028,
      incrementalReduction: 6_500,
      targetReduction: 7_500,
      status: "pending",
    });
    expect(roadmap.milestones[1].actionIds).toEqual(["a-heat", "a-ppa"]);
    expect(roadmap.milestones[1].cost).toBe(750_000);
    expect(roadmap.milestones[1].dueDate.toISOString()).toBe("2028-12-31T00:00:00.000Z");
    expect(roadmap.milestones[1].completedAt).toBeNull();
  });

  it("marks a milestone whose actions are all delivered as completed", () => {
    const milestone = roadmap.milestones[0];
    expect(milestone.status).toBe("completed");
    expect(milestone.completedAt?.getUTCFullYear()).toBe(2026);
    // 900 of the 1 000 tCO2e the action promised.
    expect(milestone.currentProgress).toBeCloseTo(90, 9);
  });

  it("reports a partially delivered milestone as in progress", () => {
    const mixed = buildRoadmap({
      baseline: { year: 2024, emissions: 30_000 },
      target: { year: 2030, emissions: 18_000 },
      actions: [
        { id: "x", name: "X", expectedReduction: 100, endDate: endOf(2026), status: "completed" },
        { id: "y", name: "Y", expectedReduction: 300, endDate: endOf(2026), status: "in_progress" },
      ],
    });
    expect(mixed.milestones[0].status).toBe("in_progress");
    expect(mixed.milestones[0].currentProgress).toBeCloseTo(25, 9);
    expect(mixed.achievedReduction).toBe(100);
  });

  it("builds a year-by-year trajectory against the straight-line target", () => {
    expect(roadmap.trajectory.map((point) => point.year)).toEqual([
      2024, 2025, 2026, 2027, 2028, 2029, 2030,
    ]);
    expect(roadmap.trajectory[0]).toMatchObject({
      year: 2024,
      targetEmissions: 30_000,
      plannedEmissions: 30_000,
      cumulativeReduction: 0,
      gapToTarget: 0,
    });
    // 2026: target path 30 000 − 12 000×2/6 = 26 000; plan delivers 1 000.
    expect(roadmap.trajectory[2].targetEmissions).toBeCloseTo(26_000, 6);
    expect(roadmap.trajectory[2].plannedEmissions).toBe(29_000);
    expect(roadmap.trajectory[2].gapToTarget).toBeCloseTo(3_000, 6);
    // 2030: the plan lands 1 500 above the target, which is the residual gap.
    expect(roadmap.trajectory[6].plannedEmissions).toBe(19_500);
    expect(roadmap.trajectory[6].gapToTarget).toBeCloseTo(roadmap.residualGap, 6);
  });

  it("assigns actions with no end date to the target-year milestone and warns", () => {
    const undated = buildRoadmap({
      baseline: { year: 2024, emissions: 1_000 },
      target: { year: 2030, emissions: 500 },
      actions: [{ id: "u", name: "Unscheduled", expectedReduction: 500 }],
    });
    expect(undated.actions[0].completionYear).toBe(2030);
    expect(undated.actions[0].completionYearAssumed).toBe(true);
    expect(undated.milestones[0].targetYear).toBe(2030);
    expect(undated.warnings.some((w) => w.includes("no end date"))).toBe(true);
  });

  it("clamps actions that fall outside the roadmap window and warns", () => {
    const clamped = buildRoadmap({
      baseline: { year: 2024, emissions: 1_000 },
      target: { year: 2030, emissions: 500 },
      actions: [
        { id: "late", name: "Late", expectedReduction: 200, endDate: endOf(2035) },
        { id: "early", name: "Early", expectedReduction: 300, endDate: endOf(2020) },
      ],
    });
    expect(clamped.actions.map((a) => a.completionYear)).toEqual([2024, 2030]);
    expect(clamped.warnings.some((w) => w.includes("after the 2030 target year"))).toBe(true);
    expect(clamped.warnings.some((w) => w.includes("before the 2024 baseline year"))).toBe(
      true,
    );
  });

  it("totals cost and average cost per tonne", () => {
    expect(roadmap.totalCost).toBe(910_000);
    expect(roadmap.averageCostPerTonne).toBeCloseTo(910_000 / 10_500, 9);
    expect(roadmap.currency).toBe("USD");
    expect(roadmap.unit).toBe("tCO2e");
  });

  it("handles a roadmap with no actions at all", () => {
    const empty = buildRoadmap({
      baseline: { year: 2024, emissions: 1_000 },
      target: { year: 2030, emissions: 500 },
      actions: [],
    });
    expect(empty.plannedReduction).toBe(0);
    expect(empty.residualGap).toBe(500);
    expect(empty.milestones).toEqual([]);
    expect(empty.trajectory).toHaveLength(7);
    expect(empty.averageCostPerTonne).toBe(0);
  });

  it("validates its inputs", () => {
    expect(() =>
      buildRoadmap({
        baseline: { year: 2030, emissions: 100 },
        target: { year: 2030, emissions: 50 },
        actions: [],
      }),
    ).toThrow(/after its baseline year/);
    expect(() =>
      buildRoadmap({
        baseline: { year: 2024, emissions: 0 },
        target: { year: 2030, emissions: 0 },
        actions: [],
      }),
    ).toThrow(/greater than zero/);
    expect(() =>
      buildRoadmap({
        baseline: { year: 2024, emissions: 100 },
        target: { year: 2030 },
        actions: [],
      }),
    ).toThrow(/absolute emissions or a reduction percentage/);
    expect(() =>
      buildRoadmap({
        baseline: { year: 2024, emissions: 100 },
        target: { year: 2030, reductionPercent: 150 },
        actions: [],
      }),
    ).toThrow(/cannot be negative/);
    expect(() =>
      buildRoadmap({
        baseline: { year: 2024, emissions: 100 },
        target: { year: 2030, emissions: 50 },
        actions: [{ id: "bad", name: "Bad", expectedReduction: -1 }],
      }),
    ).toThrow(CalculationError);
  });
});
