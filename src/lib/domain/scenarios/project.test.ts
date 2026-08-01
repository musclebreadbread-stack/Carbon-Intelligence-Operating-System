import { describe, expect, it } from "vitest";

import { SCENARIO_TYPES } from "@/lib/core/enums";
import { CalculationError } from "@/lib/core/errors";

import {
  SCENARIO_DEFAULT_LEVERS,
  SCENARIO_LEVERS,
  compareScenarios,
  isScenarioLever,
  projectScenario,
  resolveLevers,
  type ScenarioBaseline,
} from "./project";

const baseline: ScenarioBaseline = {
  year: 2024,
  scope1Emissions: 20_000,
  scope2Emissions: 30_000,
  scope3Emissions: 50_000,
  energyConsumption: 120_000,
  renewableShare: 0.2,
};

describe("lever definitions", () => {
  it("declares a full default lever set for every ScenarioType", () => {
    for (const type of SCENARIO_TYPES) {
      const levers = SCENARIO_DEFAULT_LEVERS[type];
      expect(Object.keys(levers).sort()).toEqual([...SCENARIO_LEVERS].sort());
      for (const lever of SCENARIO_LEVERS) {
        expect(Number.isFinite(levers[lever])).toBe(true);
      }
    }
  });

  it("gives BASELINE and CUSTOM an all-zero lever set", () => {
    for (const type of ["BASELINE", "CUSTOM"] as const) {
      expect(SCENARIO_LEVERS.every((lever) => SCENARIO_DEFAULT_LEVERS[type][lever] === 0)).toBe(
        true,
      );
    }
  });

  it("orders the IEA scenarios by ambition", () => {
    expect(SCENARIO_DEFAULT_LEVERS.IEA_NZE.abatementAmbition).toBeGreaterThan(
      SCENARIO_DEFAULT_LEVERS.IEA_APS.abatementAmbition,
    );
    expect(SCENARIO_DEFAULT_LEVERS.IEA_APS.abatementAmbition).toBeGreaterThan(
      SCENARIO_DEFAULT_LEVERS.IEA_STEPS.abatementAmbition,
    );
  });

  it("recognises only declared levers", () => {
    expect(isScenarioLever("activityGrowthRate")).toBe(true);
    expect(isScenarioLever("magicWand")).toBe(false);
  });
});

describe("resolveLevers", () => {
  it("overlays assumption rows on the type defaults", () => {
    const levers = resolveLevers("BAU", [
      { parameter: "activityGrowthRate", value: 0.06 },
    ]);
    expect(levers.activityGrowthRate).toBe(0.06);
    expect(levers.energyEfficiencyRate).toBe(
      SCENARIO_DEFAULT_LEVERS.BAU.energyEfficiencyRate,
    );
  });

  it("rejects an unknown lever rather than ignoring it", () => {
    expect(() =>
      resolveLevers("CUSTOM", [{ parameter: "vibes", value: 1 }]),
    ).toThrow(/Unknown scenario lever/);
  });

  it("range-checks fraction levers and the growth rate", () => {
    expect(() =>
      resolveLevers("CUSTOM", [{ parameter: "abatementAmbition", value: 1.5 }]),
    ).toThrow(/between 0 and 1/);
    expect(() =>
      resolveLevers("CUSTOM", [{ parameter: "activityGrowthRate", value: -1 }]),
    ).toThrow(/greater than −1/);
    expect(() =>
      resolveLevers("CUSTOM", [{ parameter: "carbonPrice", value: Number.NaN }]),
    ).toThrow(CalculationError);
  });
});

describe("projectScenario", () => {
  it("holds a BASELINE scenario flat at the base-year inventory", () => {
    const projection = projectScenario({ type: "BASELINE", baseline, targetYear: 2030 });
    expect(projection.points).toHaveLength(7);
    expect(projection.baselineEmissions).toBe(100_000);
    for (const point of projection.points) {
      expect(point.totalEmissions).toBeCloseTo(100_000, 6);
      expect(point.reductionFromBaseline).toBeCloseTo(0, 6);
    }
    expect(projection.targetReduction).toBeCloseTo(0, 12);
  });

  it("brings NET_ZERO to approximately zero in its target year", () => {
    const projection = projectScenario({ type: "NET_ZERO", baseline, targetYear: 2050 });
    expect(projection.targetEmissions).toBeCloseTo(0, 6);
    expect(projection.targetReduction).toBeCloseTo(1, 9);
    const last = projection.points[projection.points.length - 1];
    expect(last.year).toBe(2050);
    expect(last.scope1Emissions).toBeCloseTo(0, 6);
    expect(last.scope2Emissions).toBeCloseTo(0, 6);
    expect(last.scope3Emissions).toBeCloseTo(0, 6);
    expect(last.metadata.abatementRamp).toBeCloseTo(0, 12);
  });

  it("decreases NET_ZERO monotonically", () => {
    const totals = projectScenario({
      type: "NET_ZERO",
      baseline,
      targetYear: 2050,
    }).points.map((point) => point.totalEmissions);
    expect(totals).toEqual([...totals].sort((a, b) => b - a));
  });

  it("rises monotonically for BAU with a positive growth lever", () => {
    const projection = projectScenario({
      type: "BAU",
      baseline,
      targetYear: 2040,
      assumptions: [
        { parameter: "activityGrowthRate", value: 0.03 },
        { parameter: "energyEfficiencyRate", value: 0 },
      ],
    });
    const totals = projection.points.map((point) => point.totalEmissions);
    expect(totals).toEqual([...totals].sort((a, b) => a - b));
    expect(new Set(totals).size).toBe(totals.length);
    expect(projection.targetEmissions).toBeCloseTo(100_000 * 1.03 ** 16, 4);
    expect(projection.targetReduction).toBeLessThan(0);
  });

  it("stops NET_ZERO at its residual floor when one is set", () => {
    const projection = projectScenario({
      type: "NET_ZERO",
      baseline,
      targetYear: 2050,
      assumptions: [
        { parameter: "residualFloor", value: 0.1 },
        { parameter: "activityGrowthRate", value: 0 },
        { parameter: "energyEfficiencyRate", value: 0 },
        { parameter: "fuelSwitchRate", value: 0 },
        { parameter: "supplyChainEngagementRate", value: 0 },
        { parameter: "renewableShareTarget", value: 0.2 },
      ],
    });
    // Only the abatement ramp bites: 1 − 1×(1 − 0.1) = 0.1 of the base year.
    expect(projection.targetEmissions).toBeCloseTo(10_000, 6);
  });

  it("applies the compound structural levers exactly", () => {
    const projection = projectScenario({
      type: "CUSTOM",
      baseline,
      targetYear: 2034,
      assumptions: [
        { parameter: "activityGrowthRate", value: 0.02 },
        { parameter: "energyEfficiencyRate", value: 0.03 },
        { parameter: "fuelSwitchRate", value: 0.04 },
        { parameter: "supplyChainEngagementRate", value: 0.05 },
      ],
    });
    const point = projection.points[10]; // 2034, t = 10
    expect(point.metadata.activityIndex).toBeCloseTo(1.02 ** 10, 12);
    expect(point.scope1Emissions).toBeCloseTo(
      20_000 * 1.02 ** 10 * 0.97 ** 10 * 0.96 ** 10,
      6,
    );
    expect(point.scope3Emissions).toBeCloseTo(50_000 * 1.02 ** 10 * 0.95 ** 10, 6);
    // No abatement ramp in CUSTOM by default.
    expect(point.metadata.abatementRamp).toBe(1);
  });

  it("ramps the renewable share linearly and scales Scope 2 by the residual grid share", () => {
    const projection = projectScenario({
      type: "CUSTOM",
      baseline,
      targetYear: 2034,
      assumptions: [{ parameter: "renewableShareTarget", value: 0.6 }],
    });
    expect(projection.points[0].renewableShare).toBeCloseTo(0.2, 12);
    expect(projection.points[5].renewableShare).toBeCloseTo(0.4, 12);
    expect(projection.points[10].renewableShare).toBeCloseTo(0.6, 12);
    // (1 − 0.4)/(1 − 0.2) = 0.75 of the base-year Scope 2.
    expect(projection.points[5].scope2Emissions).toBeCloseTo(30_000 * 0.75, 6);
    expect(projection.points[10].scope2Emissions).toBeCloseTo(30_000 * 0.5, 6);
  });

  it("never lets a lower renewable target increase Scope 2", () => {
    const projection = projectScenario({
      type: "CUSTOM",
      baseline,
      targetYear: 2030,
      assumptions: [{ parameter: "renewableShareTarget", value: 0.05 }],
    });
    expect(projection.points[6].renewableShare).toBeCloseTo(0.2, 12);
    expect(projection.points[6].scope2Emissions).toBeCloseTo(30_000, 6);
  });

  it("projects energy consumption with growth and efficiency", () => {
    const projection = projectScenario({
      type: "CUSTOM",
      baseline,
      targetYear: 2029,
      assumptions: [
        { parameter: "activityGrowthRate", value: 0.02 },
        { parameter: "energyEfficiencyRate", value: 0.05 },
      ],
    });
    expect(projection.points[5].energyConsumption).toBeCloseTo(
      120_000 * 1.02 ** 5 * 0.95 ** 5,
      6,
    );
  });

  it("reports null energy and renewable share when the baseline omits them", () => {
    const projection = projectScenario({
      type: "BAU",
      baseline: {
        year: 2024,
        scope1Emissions: 10,
        scope2Emissions: 10,
        scope3Emissions: 10,
      },
      targetYear: 2030,
    });
    expect(projection.points[0].energyConsumption).toBeNull();
    expect(projection.points[0].renewableShare).toBeNull();
  });

  it("prices carbon and abatement into costImplication", () => {
    const projection = projectScenario({
      type: "CUSTOM",
      baseline,
      targetYear: 2029,
      assumptions: [
        { parameter: "carbonPrice", value: 50 },
        { parameter: "carbonPriceGrowthRate", value: 0.1 },
        { parameter: "abatementAmbition", value: 1 },
        { parameter: "abatementCostPerTonne", value: 20 },
      ],
    });
    const point = projection.points[5];
    expect(point.metadata.carbonPrice).toBeCloseTo(50 * 1.1 ** 5, 9);
    expect(point.totalEmissions).toBeCloseTo(0, 6);
    expect(point.metadata.abatedEmissions).toBeCloseTo(100_000, 6);
    expect(point.metadata.abatementCost).toBeCloseTo(2_000_000, 6);
    expect(point.costImplication).toBeCloseTo(2_000_000, 6);
    expect(projection.cumulativeCost).toBeGreaterThan(0);
  });

  it("records the applied assumption provenance", () => {
    const projection = projectScenario({
      type: "BAU",
      baseline,
      targetYear: 2030,
      assumptions: [{ parameter: "activityGrowthRate", value: 0.04 }],
    });
    expect(projection.assumptions).toHaveLength(SCENARIO_LEVERS.length);
    const growth = projection.assumptions.find((a) => a.parameter === "activityGrowthRate");
    expect(growth).toMatchObject({ value: 0.04, source: "user" });
    const efficiency = projection.assumptions.find(
      (a) => a.parameter === "energyEfficiencyRate",
    );
    expect(efficiency?.source).toBe("default:BAU");
    expect(projection.methodology).toContain("BAU");
  });

  it("sums cumulative emissions over the projected years", () => {
    const projection = projectScenario({ type: "BASELINE", baseline, targetYear: 2030 });
    expect(projection.cumulativeEmissions).toBeCloseTo(700_000, 3);
  });

  it("validates its inputs", () => {
    expect(() =>
      projectScenario({ type: "BAU", baseline, targetYear: 2024 }),
    ).toThrow(/after its baseline year/);
    expect(() =>
      projectScenario({
        type: "BAU",
        baseline: { ...baseline, scope1Emissions: -1 },
        targetYear: 2030,
      }),
    ).toThrow(/non-negative/);
    expect(() =>
      projectScenario({ type: "BAU", baseline: { ...baseline, year: 2024.5 }, targetYear: 2030 }),
    ).toThrow(/integers/);
  });
});

describe("compareScenarios", () => {
  const bau = {
    name: "BAU",
    projection: projectScenario({
      type: "CUSTOM",
      baseline,
      targetYear: 2034,
      assumptions: [{ parameter: "activityGrowthRate", value: 0 }],
    }),
  };
  const netZero = {
    name: "Net zero",
    projection: projectScenario({
      type: "CUSTOM",
      baseline,
      targetYear: 2034,
      assumptions: [
        { parameter: "activityGrowthRate", value: 0 },
        { parameter: "abatementAmbition", value: 1 },
      ],
    }),
  };

  it("computes the difference and percent change against scenario A", () => {
    const [total] = compareScenarios(bau, netZero, ["totalEmissions"]);
    expect(total).toMatchObject({
      metric: "totalEmissions",
      scenarioAValue: 100_000,
      scenarioBValue: 0,
      difference: -100_000,
      percentChange: -100,
    });
    expect(total.name).toBe("BAU vs Net zero");
    expect(total.notes).toContain("below");
  });

  it("compares cumulative metrics without needing a year", () => {
    const [cumulative] = compareScenarios(bau, netZero, ["cumulativeEmissions"]);
    // BAU: 11 flat years. Net zero: a linear ramp from 100 000 to 0.
    expect(cumulative.scenarioAValue).toBeCloseTo(1_100_000, 3);
    expect(cumulative.scenarioBValue).toBeCloseTo(550_000, 3);
    expect(cumulative.difference).toBeCloseTo(-550_000, 3);
    expect(cumulative.percentChange).toBeCloseTo(-50, 9);
  });

  it("reads point metrics at an explicit year", () => {
    const [mid] = compareScenarios(bau, netZero, ["totalEmissions"], { year: 2029 });
    expect(mid.scenarioBValue).toBeCloseTo(50_000, 6);
    expect(mid.percentChange).toBeCloseTo(-50, 9);
  });

  it("reports reductionPercent and scope-level metrics", () => {
    const rows = compareScenarios(
      bau,
      netZero,
      ["reductionPercent", "scope1Emissions", "scope3Emissions"],
      { year: 2029 },
    );
    expect(rows.map((row) => row.metric)).toEqual([
      "reductionPercent",
      "scope1Emissions",
      "scope3Emissions",
    ]);
    expect(rows[0].scenarioBValue).toBeCloseTo(50, 6);
    expect(rows[1].scenarioBValue).toBeCloseTo(10_000, 6);
    expect(rows[2].scenarioBValue).toBeCloseTo(25_000, 6);
  });

  it("returns nulls for a year neither scenario covers", () => {
    const [row] = compareScenarios(bau, netZero, ["totalEmissions"], { year: 2100 });
    expect(row.scenarioAValue).toBeNull();
    expect(row.difference).toBeNull();
    expect(row.percentChange).toBeNull();
    expect(row.notes).toContain("not available");
  });

  it("guards a zero denominator when computing percentChange", () => {
    const [row] = compareScenarios(netZero, bau, ["totalEmissions"]);
    expect(row.scenarioAValue).toBeCloseTo(0, 6);
    expect(row.percentChange).toBeNull();
  });

  it("requires at least one metric", () => {
    expect(() => compareScenarios(bau, netZero, [])).toThrow(CalculationError);
  });
});
