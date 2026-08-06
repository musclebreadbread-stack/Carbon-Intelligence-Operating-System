import { describe, expect, it } from "vitest";

import { CalculationError, NotFoundError } from "@/lib/core/errors";
import { sum } from "@/lib/core/number";
import { calendarYear } from "@/lib/core/period";

import type { EmissionFactorLike } from "../factors/types";

import {
  factorSetFromFactors,
  resultIdFor,
  runCalculation,
  type CalculationEntry,
  type CalculationRequest,
} from "./orchestrator";

const period = calendarYear(2024);

const factors: readonly EmissionFactorLike[] = [
  {
    id: "ef-gas-co2",
    name: "Natural gas CO2",
    value: 2.0,
    unit: "KG_CO2E_PER_M3",
    gasType: "CO2",
    scope: "SCOPE_1",
    country: "KR",
    validFrom: new Date("2024-01-01T00:00:00.000Z"),
    isActive: true,
    uncertainty: 0.03,
    dataQuality: "HIGH",
  },
  {
    id: "ef-gas-ch4",
    name: "Natural gas CH4",
    value: 0.0001,
    unit: "KG_CO2E_PER_M3",
    gasType: "CH4_FOSSIL",
    scope: "SCOPE_1",
    country: "KR",
    validFrom: new Date("2024-01-01T00:00:00.000Z"),
    isActive: true,
    uncertainty: 0.05,
  },
  {
    id: "ef-grid-kr",
    name: "Korea grid average",
    value: 0.4,
    unit: "KG_CO2E_PER_KWH",
    gasType: "CO2e",
    scope: "SCOPE_2_LOCATION",
    country: "KR",
    validFrom: new Date("2024-01-01T00:00:00.000Z"),
    isActive: true,
    uncertainty: 0.04,
  },
  {
    id: "ef-eeio-purchased",
    name: "EEIO purchased goods",
    value: 0.25,
    unit: "KG_CO2E_PER_USD",
    gasType: "CO2e",
    scope: "SCOPE_3",
    scope3Category: "CAT_1_PURCHASED_GOODS",
    isActive: true,
    uncertainty: 0.3,
  },
  {
    id: "ef-travel-air",
    name: "Air travel",
    value: 0.15,
    unit: "KG_CO2E_PER_PKM",
    gasType: "CO2e",
    scope: "SCOPE_3",
    scope3Category: "CAT_6_BUSINESS_TRAVEL",
    isActive: true,
    uncertainty: 0.1,
  },
];

const entries: readonly CalculationEntry[] = [
  {
    id: "entry-gas",
    name: "Boiler natural gas",
    quantity: 1000,
    unit: "m3",
    scope: "SCOPE_1",
    scope1SourceType: "STATIONARY",
    gasTypes: ["CO2", "CH4_FOSSIL"],
    country: "KR",
    facilityId: "fac-1",
    businessUnitId: "bu-a",
    emissionSourceId: "src-boiler",
    measurementType: "METERED",
    hasEvidence: true,
    activityDataUncertainty: 2,
  },
  {
    id: "entry-electricity",
    name: "Purchased electricity",
    quantity: 1_000_000,
    unit: "kWh",
    scope: "SCOPE_2_LOCATION",
    country: "KR",
    facilityId: "fac-1",
    businessUnitId: "bu-a",
    emissionSourceId: "src-meter",
    measurementType: "INVOICED",
    hasEvidence: true,
    activityDataUncertainty: 1,
  },
  {
    id: "entry-purchased",
    name: "Purchased goods",
    quantity: 1_000_000,
    unit: "USD",
    scope: "SCOPE_3",
    scope3Category: "CAT_1_PURCHASED_GOODS",
    approach: "SPEND_BASED",
    businessUnitId: "bu-b",
    measurementType: "ESTIMATED",
    hasEvidence: false,
    activityDataUncertainty: 15,
  },
  {
    id: "entry-travel",
    name: "Business travel",
    quantity: 200_000,
    unit: "pkm",
    scope: "SCOPE_3",
    scope3Category: "CAT_6_BUSINESS_TRAVEL",
    approach: "ACTIVITY_BASED",
    businessUnitId: "bu-b",
    measurementType: "CALCULATED",
    activityDataUncertainty: 8,
  },
];

const request: CalculationRequest = {
  organizationId: "org-1",
  name: "FY2024 corporate inventory",
  reportingYear: 2024,
  period,
  gwpVersion: "AR6",
  candidateFactors: factors,
  entries,
  facilities: [{ id: "fac-1", operationalControl: true, equityShare: 100 }],
};

// Hand-computed expectations:
//   gas         1000 m3 × (2.0 CO2 + 0.0001 CH4) → 2000 + 0.1×29.8 = 2002.98 kg = 2.00298 t
//   electricity 1,000,000 kWh × 0.4 = 400,000 kg = 400 t
//   purchased   1,000,000 USD × 0.25 = 250,000 kg = 250 t
//   travel      200,000 pkm × 0.15 = 30,000 kg = 30 t
const EXPECTED = {
  gas: 2.00298,
  electricity: 400,
  purchased: 250,
  travel: 30,
} as const;
const EXPECTED_TOTAL =
  EXPECTED.gas + EXPECTED.electricity + EXPECTED.purchased + EXPECTED.travel;

describe("factorSetFromFactors", () => {
  it("merges per-gas factors into one factor set", () => {
    const set = factorSetFromFactors([factors[0], factors[1]]);
    expect(set.denominatorUnit).toBe("m3");
    expect(set.perGasKg).toEqual({ CO2: 2.0, CH4_FOSSIL: 0.0001 });
    expect(set.co2eKgPerUnit).toBeUndefined();
    // The worst stated factor uncertainty governs the set.
    expect(set.uncertainty).toBe(0.05);
  });

  it("treats a CO2e factor as pre-aggregated", () => {
    const set = factorSetFromFactors([factors[2]]);
    expect(set.co2eKgPerUnit).toBe(0.4);
    expect(set.perGasKg).toBeUndefined();
    expect(set.denominatorUnit).toBe("kWh");
  });

  it("rejects an empty set and mixed denominators", () => {
    expect(() => factorSetFromFactors([])).toThrow(CalculationError);
    expect(() => factorSetFromFactors([factors[0], factors[2]])).toThrow(
      /share a known denominator unit/,
    );
  });
});

describe("runCalculation end to end", () => {
  const outcome = runCalculation(request);

  it("produces one EmissionResult per activity entry", () => {
    expect(outcome.results).toHaveLength(entries.length);
    expect(outcome.results.map((r) => r.activityDataEntryId)).toEqual(
      entries.map((e) => e.id),
    );
    expect(outcome.results.map((r) => r.id)).toEqual(entries.map(resultIdFor));
  });

  it("computes the expected total from Scope 1, Scope 2 and two Scope 3 categories", () => {
    expect(outcome.results[0].totalCO2e).toBeCloseTo(EXPECTED.gas, 9);
    expect(outcome.results[1].totalCO2e).toBeCloseTo(EXPECTED.electricity, 9);
    expect(outcome.results[2].totalCO2e).toBeCloseTo(EXPECTED.purchased, 9);
    expect(outcome.results[3].totalCO2e).toBeCloseTo(EXPECTED.travel, 9);

    expect(outcome.inventory.scope1Total).toBeCloseTo(EXPECTED.gas, 9);
    expect(outcome.inventory.scope2Location).toBeCloseTo(EXPECTED.electricity, 9);
    expect(outcome.inventory.scope3Total).toBeCloseTo(EXPECTED.purchased + EXPECTED.travel, 9);
    expect(outcome.inventory.totalEmissions).toBeCloseTo(EXPECTED_TOTAL, 9);
    expect(outcome.inventory.scope3ByCategory).toEqual({
      CAT_1_PURCHASED_GOODS: EXPECTED.purchased,
      CAT_6_BUSINESS_TRAVEL: EXPECTED.travel,
    });
  });

  it("populates the gas columns for per-gas factors and leaves them zero for CO2e factors", () => {
    expect(outcome.results[0].co2Emissions).toBeCloseTo(2.0, 9);
    expect(outcome.results[0].ch4Emissions).toBeCloseTo(0.00298, 9);
    // The grid factor is pre-aggregated, so no gas column is attributable.
    expect(outcome.results[1].co2Emissions).toBe(0);
    expect(outcome.results[1].totalCO2e).toBeCloseTo(400, 9);
  });

  it("emits a non-empty trace for every result whose last step is the total", () => {
    expect(outcome.traces).toHaveLength(entries.length);
    for (const trace of outcome.traces) {
      expect(trace.steps.length).toBeGreaterThan(0);
      trace.steps.forEach((step, index) => expect(step.orderIndex).toBe(index));
      const result = outcome.results.find((r) => r.id === trace.resultId);
      expect(result).toBeDefined();
      expect(trace.steps[trace.steps.length - 1].output).toBeCloseTo(
        result?.totalCO2e ?? Number.NaN,
        6,
      );
    }
  });

  it("emits a lineage edge from every activity entry to its result", () => {
    for (const entry of entries) {
      const edge = outcome.lineage.edges.find(
        (e) => e.sourceKey === `activity:${entry.id}` && e.relationship === "INPUT_TO",
      );
      expect(edge, entry.id).toBeDefined();
      expect(edge?.targetKey).toBe(`result:${resultIdFor(entry)}`);
      expect(edge?.transformation?.type).toBe("emission-calculation");
      expect(edge?.transformation?.logic?.length).toBeGreaterThan(0);
    }
  });

  it("emits a node for every activity entry, factor and result plus the calculation", () => {
    const types = outcome.lineage.nodes.map((n) => n.type);
    expect(types.filter((t) => t === "ACTIVITY_DATA")).toHaveLength(entries.length);
    expect(types.filter((t) => t === "EMISSION_RESULT")).toHaveLength(entries.length);
    expect(types.filter((t) => t === "CALCULATION")).toHaveLength(1);
    // Five factors exist but only four distinct ones are used; the gas entry uses two.
    expect(new Set(types.filter((t) => t === "EMISSION_FACTOR")).size).toBe(1);
    const factorNodes = outcome.lineage.nodes.filter((n) => n.type === "EMISSION_FACTOR");
    expect(factorNodes.map((n) => n.entityId).sort()).toEqual([
      "ef-eeio-purchased",
      "ef-gas-ch4",
      "ef-gas-co2",
      "ef-grid-kr",
      "ef-travel-air",
    ]);
    // Every node key is unique.
    expect(new Set(outcome.lineage.nodes.map((n) => n.key)).size).toBe(
      outcome.lineage.nodes.length,
    );
  });

  it("links each result into the calculation node", () => {
    const aggregated = outcome.lineage.edges.filter(
      (e) => e.relationship === "AGGREGATED_INTO",
    );
    expect(aggregated).toHaveLength(entries.length);
    expect(new Set(aggregated.map((e) => e.targetKey)).size).toBe(1);
  });

  it("records a factor-selection rationale for every entry", () => {
    for (const entry of entries) {
      expect(outcome.factorSelections[entry.id].length).toBeGreaterThan(0);
    }
    expect(outcome.factorSelections["entry-gas"].join(" ")).toContain("Selected");
  });

  it("scores data quality per entry and aggregates it by emissions", () => {
    expect(outcome.quality.records).toHaveLength(entries.length);
    expect(outcome.quality.byResultId[resultIdFor(entries[0])].level).toBe("HIGH");
    // The spend-based estimate is the weakest entry.
    const purchased = outcome.quality.byResultId[resultIdFor(entries[2])];
    expect(purchased.overallScore).toBeLessThan(
      outcome.quality.byResultId[resultIdFor(entries[0])].overallScore,
    );
    expect(outcome.quality.aggregate.entryCount).toBe(entries.length);
    expect(sum(Object.values(outcome.quality.aggregate.levelDistribution))).toBeCloseTo(1, 9);
    expect(outcome.results[0].dataQuality).toBe("HIGH");
  });

  it("propagates uncertainty analytically and omits Monte Carlo unless asked", () => {
    expect(outcome.uncertainty.overallUncertainty).toBeGreaterThan(0);
    expect(outcome.uncertainty.monteCarloIterations).toBeNull();
    expect(outcome.uncertainty.methodology).toContain("Approach 1");
    expect(outcome.uncertainty.lowerBound).toBeLessThan(EXPECTED_TOTAL);
    expect(outcome.uncertainty.upperBound).toBeGreaterThan(EXPECTED_TOTAL);
  });

  it("shapes the calculation header and one record per scope", () => {
    expect(outcome.calculation).toMatchObject({
      organizationId: "org-1",
      name: "FY2024 corporate inventory",
      reportingYear: 2024,
      status: "COMPLETED",
      unit: "tCO2e",
    });
    expect(outcome.calculation.totalEmissions).toBeCloseTo(EXPECTED_TOTAL, 9);
    // Scope 2 (400 t) is the largest single scope; Scope 3 sums to 280 t.
    expect(outcome.calculation.scope).toBe("SCOPE_2_LOCATION");
    expect(outcome.calculation.calculatedAt).toEqual(period.end);

    expect(outcome.calculationsByScope).toHaveLength(3);
    const byScope = new Map(outcome.calculationsByScope.map((c) => [c.scope, c]));
    expect(byScope.get("SCOPE_1")?.totalEmissions).toBeCloseTo(EXPECTED.gas, 9);
    expect(byScope.get("SCOPE_3")?.totalEmissions).toBeCloseTo(
      EXPECTED.purchased + EXPECTED.travel,
      9,
    );
    // Two different Scope 3 categories, so the header cannot name one.
    expect(byScope.get("SCOPE_3")?.scope3Category).toBeNull();
    expect(byScope.get("SCOPE_1")?.scope3Category).toBeNull();
  });

  it("is deterministic: the same request produces an identical outcome", () => {
    const again = runCalculation(request);
    expect(JSON.stringify(again)).toBe(JSON.stringify(outcome));
  });
});

describe("runCalculation options", () => {
  it("applies the equity-share consolidation approach", () => {
    const outcome = runCalculation({
      ...request,
      consolidationApproach: "EQUITY_SHARE",
      facilities: [{ id: "fac-1", operationalControl: true, equityShare: 50 }],
    });
    // Only the two fac-1 entries are halved; the Scope 3 entries have no facility.
    expect(outcome.results[0].totalCO2e).toBeCloseTo(EXPECTED.gas / 2, 9);
    expect(outcome.results[1].totalCO2e).toBeCloseTo(EXPECTED.electricity / 2, 9);
    expect(outcome.results[2].totalCO2e).toBeCloseTo(EXPECTED.purchased, 9);
    expect(outcome.inventory.totalEmissions).toBeCloseTo(
      EXPECTED.gas / 2 + EXPECTED.electricity / 2 + EXPECTED.purchased + EXPECTED.travel,
      9,
    );
  });

  it("excludes a non-operated facility under operational control", () => {
    const outcome = runCalculation({
      ...request,
      facilities: [{ id: "fac-1", operationalControl: false }],
    });
    expect(outcome.inventory.scope1Total).toBe(0);
    expect(outcome.inventory.scope2Location).toBe(0);
    expect(outcome.inventory.scope3Total).toBeCloseTo(EXPECTED.purchased + EXPECTED.travel, 9);
  });

  it("runs a reproducible Monte Carlo pass when requested", () => {
    const options = { iterations: 5000, seed: 20240101 };
    const a = runCalculation({ ...request, monteCarlo: options });
    const b = runCalculation({ ...request, monteCarlo: options });
    expect(a.uncertainty.monteCarloIterations).toBe(5000);
    expect(a.uncertainty.methodology).toContain("Approach 2");
    expect(a.uncertainty.notes).toContain("Analytical (Approach 1)");
    expect(a.uncertainty.lowerBound).toBe(b.uncertainty.lowerBound);
    expect(a.uncertainty.upperBound).toBe(b.uncertainty.upperBound);
  });

  it("computes fugitive emissions without resolving a factor", () => {
    const outcome = runCalculation({
      ...request,
      entries: [
        {
          id: "entry-refrigerant",
          name: "Chiller R-410A",
          quantity: 0,
          unit: "kg",
          scope: "SCOPE_1",
          scope1SourceType: "FUGITIVE",
          facilityId: "fac-1",
          fugitive: {
            method: "SCREENING",
            blend: "R-410A",
            inventoryChange: 10,
            purchases: 50,
            disposals: 5,
          },
        },
      ],
    });
    // 55 kg × AR6 R-410A GWP (0.5×771 + 0.5×3740 = 2255.5) = 124,052.5 kg
    expect(outcome.results[0].totalCO2e).toBeCloseTo(124.0525, 6);
    expect(outcome.results[0].emissionFactorId).toBeNull();
    expect(outcome.factorSelections["entry-refrigerant"][0]).toContain(
      "No emission factor required",
    );
    expect(
      outcome.lineage.nodes.some((n) => n.type === "EMISSION_FACTOR"),
    ).toBe(false);
  });

  it("computes market-based Scope 2 with certificates", () => {
    const outcome = runCalculation({
      ...request,
      scope2Basis: "MARKET",
      candidateFactors: [
        ...factors,
        {
          id: "ef-residual-kr",
          name: "Korea residual mix",
          value: 0.5,
          unit: "KG_CO2E_PER_KWH",
          gasType: "CO2e",
          scope: "SCOPE_2_MARKET",
          country: "KR",
          isActive: true,
        },
      ],
      entries: [
        {
          id: "entry-market",
          name: "Purchased electricity (market)",
          quantity: 1_000_000,
          unit: "kWh",
          scope: "SCOPE_2_MARKET",
          country: "KR",
          facilityId: "fac-1",
          market: {
            instruments: [
              { id: "rec-1", type: "REC", quantity: 600_000, unit: "kWh", co2eKgPerUnit: 0 },
            ],
          },
        },
      ],
    });
    // 400,000 kWh uncovered × 0.5 = 200,000 kg = 200 t
    expect(outcome.results[0].totalCO2e).toBeCloseTo(200, 9);
    expect(outcome.inventory.scope2Market).toBeCloseTo(200, 9);
    expect(outcome.inventory.totalEmissions).toBeCloseTo(200, 9);
  });

  it("applies purity and calcination for a process entry", () => {
    const outcome = runCalculation({
      ...request,
      candidateFactors: [
        {
          id: "ef-clinker",
          name: "Clinker calcination",
          value: 525,
          unit: "KG_CO2E_PER_TONNE",
          gasType: "CO2e",
          scope: "SCOPE_1",
          isActive: true,
        },
      ],
      entries: [
        {
          id: "entry-clinker",
          quantity: 1000,
          unit: "t",
          scope: "SCOPE_1",
          scope1SourceType: "PROCESS",
          process: { purity: 0.95, calcinationFraction: 0.98 },
        },
      ],
    });
    expect(outcome.results[0].totalCO2e).toBeCloseTo(488.775, 9);
    expect(outcome.results[0].method).toBe("process-emissions");
  });
});

describe("runCalculation validation", () => {
  it("requires at least one entry", () => {
    expect(() => runCalculation({ ...request, entries: [] })).toThrow(
      /at least one activity entry/,
    );
  });

  it("requires a Scope 1 source type", () => {
    expect(() =>
      runCalculation({
        ...request,
        entries: [{ id: "e", quantity: 1, unit: "m3", scope: "SCOPE_1", country: "KR" }],
      }),
    ).toThrow(/no scope1SourceType/);
  });

  it("requires a Scope 3 category", () => {
    expect(() =>
      runCalculation({
        ...request,
        entries: [{ id: "e", quantity: 1, unit: "USD", scope: "SCOPE_3" }],
      }),
    ).toThrow(/no scope3Category/);
  });

  it("requires a fugitive balance for a fugitive source", () => {
    expect(() =>
      runCalculation({
        ...request,
        entries: [
          { id: "e", quantity: 0, unit: "kg", scope: "SCOPE_1", scope1SourceType: "FUGITIVE" },
        ],
      }),
    ).toThrow(/no fugitive balance/);
  });

  it("surfaces a missing emission factor as NotFoundError", () => {
    expect(() =>
      runCalculation({
        ...request,
        candidateFactors: [],
        entries: [entries[1]],
      }),
    ).toThrow(NotFoundError);
  });
});
