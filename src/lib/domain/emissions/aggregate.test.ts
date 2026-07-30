import { describe, expect, it } from "vitest";

import { CalculationError } from "@/lib/core/errors";
import { sum } from "@/lib/core/number";

import {
  ROLLUP_DIMENSIONS,
  addInventories,
  allocate,
  applyConsolidation,
  buildInventory,
  intensity,
  rollUp,
  rollUpAllLevels,
  type EmissionResultLike,
  type FacilityConsolidationLike,
} from "./aggregate";

const results: readonly EmissionResultLike[] = [
  {
    id: "r1",
    scope: "SCOPE_1",
    totalCO2e: 1000,
    biogenicCO2: 50,
    organizationId: "org-1",
    businessUnitId: "bu-a",
    facilityId: "fac-1",
    buildingId: "bld-1",
    emissionSourceId: "src-1",
  },
  {
    id: "r2",
    scope: "SCOPE_2_LOCATION",
    totalCO2e: 400,
    organizationId: "org-1",
    businessUnitId: "bu-a",
    facilityId: "fac-1",
    buildingId: "bld-1",
    emissionSourceId: "src-2",
  },
  {
    id: "r3",
    scope: "SCOPE_2_MARKET",
    totalCO2e: 150,
    organizationId: "org-1",
    businessUnitId: "bu-a",
    facilityId: "fac-1",
    emissionSourceId: "src-2",
  },
  {
    id: "r4",
    scope: "SCOPE_1",
    totalCO2e: 600,
    organizationId: "org-1",
    businessUnitId: "bu-b",
    facilityId: "fac-2",
    emissionSourceId: "src-3",
  },
  {
    id: "r5",
    scope: "SCOPE_3",
    scope3Category: "CAT_1_PURCHASED_GOODS",
    totalCO2e: 2500,
    organizationId: "org-1",
    businessUnitId: "bu-a",
  },
  {
    id: "r6",
    scope: "SCOPE_3",
    scope3Category: "CAT_6_BUSINESS_TRAVEL",
    totalCO2e: 300,
    organizationId: "org-1",
    businessUnitId: "bu-b",
  },
  {
    id: "r7",
    scope: "SCOPE_3",
    scope3Category: "CAT_1_PURCHASED_GOODS",
    totalCO2e: 500,
    organizationId: "org-1",
  },
];

describe("buildInventory", () => {
  it("sums each scope into the EmissionInventory columns", () => {
    const inventory = buildInventory(results);
    expect(inventory.scope1Total).toBe(1600);
    expect(inventory.scope2Location).toBe(400);
    expect(inventory.scope2Market).toBe(150);
    expect(inventory.scope3Total).toBe(3300);
    expect(inventory.scope3ByCategory).toEqual({
      CAT_1_PURCHASED_GOODS: 3000,
      CAT_6_BUSINESS_TRAVEL: 300,
    });
    expect(inventory.biogenicCO2).toBe(50);
    expect(inventory.unit).toBe("tCO2e");
    expect(inventory.resultCount).toBe(7);
  });

  it("uses the location-based Scope 2 figure in the total by default", () => {
    const inventory = buildInventory(results);
    expect(inventory.scope2Basis).toBe("LOCATION");
    expect(inventory.totalEmissions).toBe(1600 + 400 + 3300);
    expect(inventory.totalEmissions).toBe(
      inventory.scope1Total + inventory.scope2Location + inventory.scope3Total,
    );
  });

  it("can total on the market-based Scope 2 basis instead", () => {
    const inventory = buildInventory(results, { scope2Basis: "MARKET" });
    expect(inventory.scope2Basis).toBe("MARKET");
    expect(inventory.totalEmissions).toBe(1600 + 150 + 3300);
  });

  it("returns zeros for an empty result set", () => {
    const inventory = buildInventory([]);
    expect(inventory.totalEmissions).toBe(0);
    expect(inventory.scope3ByCategory).toEqual({});
    expect(inventory.resultCount).toBe(0);
  });

  it("rejects a non-finite total", () => {
    expect(() => buildInventory([{ scope: "SCOPE_1", totalCO2e: Number.NaN }])).toThrow(
      CalculationError,
    );
  });

  it("ignores uncategorised Scope 3 in the category split but not in the total", () => {
    const inventory = buildInventory([
      { scope: "SCOPE_3", totalCO2e: 100 },
      { scope: "SCOPE_3", scope3Category: "CAT_5_WASTE", totalCO2e: 40 },
    ]);
    expect(inventory.scope3Total).toBe(140);
    expect(inventory.scope3ByCategory).toEqual({ CAT_5_WASTE: 40 });
  });
});

describe("rollUp", () => {
  it("groups by business unit and preserves the grand total", () => {
    const nodes = rollUp(results, "businessUnitId");
    const keys = nodes.map((node) => node.key).sort();
    expect(keys).toEqual(["bu-a", "bu-b", null]);
    expect(nodes[0].tier).toBe("BUSINESS_UNIT");

    const buA = nodes.find((n) => n.key === "bu-a");
    expect(buA?.totals.scope1Total).toBe(1000);
    expect(buA?.totals.scope3Total).toBe(2500);
  });

  it("sums to the same grand total at every level", () => {
    const grandTotal = buildInventory(results).totalEmissions;
    for (const dimension of ROLLUP_DIMENSIONS) {
      const nodes = rollUp(results, dimension);
      const rolled = sum(nodes.map((node) => node.totals.totalEmissions));
      expect(rolled, dimension).toBeCloseTo(grandTotal, 9);
      const rolledCount = sum(nodes.map((node) => node.totals.resultCount));
      expect(rolledCount, dimension).toBe(results.length);
    }
  });

  it("buckets results with no value at that level under the null key", () => {
    const nodes = rollUp(results, "facilityId");
    const unassigned = nodes.find((node) => node.key === null);
    // r5, r6 and r7 have no facility.
    expect(unassigned?.totals.resultCount).toBe(3);
    expect(unassigned?.totals.scope3Total).toBe(3300);
  });

  it("maps each dimension to its OrganizationTier", () => {
    const all = rollUpAllLevels(results);
    expect(all.organizationId[0].tier).toBe("ENTERPRISE");
    expect(all.emissionSourceId[0].tier).toBe("SOURCE");
    expect(Object.keys(all)).toEqual([...ROLLUP_DIMENSIONS]);
  });
});

describe("applyConsolidation", () => {
  const facilities: readonly FacilityConsolidationLike[] = [
    { id: "fac-1", operationalControl: true, equityShare: 100 },
    { id: "fac-2", operationalControl: false, financialControl: true, equityShare: 50 },
  ];

  const twoFacilityResults: readonly EmissionResultLike[] = [
    { id: "a", scope: "SCOPE_1", totalCO2e: 1000, facilityId: "fac-1" },
    { id: "b", scope: "SCOPE_1", totalCO2e: 600, facilityId: "fac-2" },
    { id: "c", scope: "SCOPE_3", totalCO2e: 200 },
  ];

  it("excludes facilities the organisation does not operate under operational control", () => {
    const consolidated = applyConsolidation(twoFacilityResults, "OPERATIONAL_CONTROL", facilities);
    expect(consolidated.map((r) => r.totalCO2e)).toEqual([1000, 0, 200]);
    expect(consolidated[1].consolidationShare).toBe(0);
    expect(consolidated[1].grossCO2e).toBe(600);
  });

  it("includes financially controlled facilities under financial control", () => {
    const consolidated = applyConsolidation(twoFacilityResults, "FINANCIAL_CONTROL", facilities);
    expect(consolidated.map((r) => r.totalCO2e)).toEqual([1000, 600, 200]);
  });

  it("halves a facility's contribution at a 50 % equity share", () => {
    const consolidated = applyConsolidation(twoFacilityResults, "EQUITY_SHARE", facilities);
    expect(consolidated[0].totalCO2e).toBe(1000);
    expect(consolidated[1].totalCO2e).toBe(300);
    expect(consolidated[1].consolidationShare).toBe(0.5);
    expect(buildInventory(consolidated).scope1Total).toBe(1300);
  });

  it("scales biogenic CO2 with the same share", () => {
    const consolidated = applyConsolidation(
      [{ scope: "SCOPE_1", totalCO2e: 100, biogenicCO2: 20, facilityId: "fac-2" }],
      "EQUITY_SHARE",
      facilities,
    );
    expect(consolidated[0].biogenicCO2).toBe(10);
  });

  it("attributes corporate-level results with no facility in full", () => {
    const consolidated = applyConsolidation(twoFacilityResults, "EQUITY_SHARE", facilities);
    expect(consolidated[2].consolidationShare).toBe(1);
    expect(consolidated[2].totalCO2e).toBe(200);
  });

  it("defaults a missing equity share to 100 %", () => {
    const consolidated = applyConsolidation(
      [{ scope: "SCOPE_1", totalCO2e: 100, facilityId: "fac-3" }],
      "EQUITY_SHARE",
      [{ id: "fac-3" }],
    );
    expect(consolidated[0].totalCO2e).toBe(100);
  });

  it("fails loudly when a facility record is missing or its share is invalid", () => {
    expect(() =>
      applyConsolidation(
        [{ scope: "SCOPE_1", totalCO2e: 1, facilityId: "unknown" }],
        "EQUITY_SHARE",
        facilities,
      ),
    ).toThrow(/no facility record/);
    expect(() =>
      applyConsolidation(
        [{ scope: "SCOPE_1", totalCO2e: 1, facilityId: "fac-x" }],
        "EQUITY_SHARE",
        [{ id: "fac-x", equityShare: 120 }],
      ),
    ).toThrow(/equityShare/);
  });
});

describe("intensity", () => {
  it("computes revenue intensity", () => {
    const metric = intensity(5300, { type: "REVENUE", value: 1200, unit: "MUSD" });
    expect(metric.value).toBeCloseTo(4.4166667, 6);
    expect(metric.unit).toBe("tCO2e/MUSD");
    expect(metric.denominator).toBe("REVENUE");
  });

  it("computes production, area and FTE intensity", () => {
    expect(intensity(1000, { type: "PRODUCTION", value: 250, unit: "t" }).value).toBe(4);
    expect(intensity(1000, { type: "AREA", value: 20_000, unit: "sqm" }).value).toBe(0.05);
    expect(intensity(1000, { type: "FTE", value: 500, unit: "FTE" }).value).toBe(2);
  });

  it("returns 0 rather than Infinity for a zero denominator", () => {
    const metric = intensity(1000, { type: "REVENUE", value: 0, unit: "MUSD" });
    expect(metric.value).toBe(0);
    expect(metric.denominatorValue).toBe(0);
  });
});

describe("allocate", () => {
  const keys = [
    { targetEntity: "Product", targetEntityId: "p1", basis: 600 },
    { targetEntity: "Product", targetEntityId: "p2", basis: 300 },
    { targetEntity: "Product", targetEntityId: "p3", basis: 100 },
  ];

  it("splits the total in proportion to the basis", () => {
    const allocations = allocate(1000, "PHYSICAL", keys);
    expect(allocations.map((a) => a.allocationFactor)).toEqual([0.6, 0.3, 0.1]);
    expect(allocations.map((a) => a.allocatedAmount)).toEqual([600, 300, 100]);
    expect(allocations[0].allocationMethod).toBe("PHYSICAL");
    expect(allocations[0].targetEntityId).toBe("p1");
    expect(allocations[0].unit).toBe("tCO2e");
  });

  it("sums the allocated amounts back to the input total for every method", () => {
    for (const method of ["PHYSICAL", "ECONOMIC", "MASS", "ENERGY_CONTENT"] as const) {
      const allocations = allocate(1234.5678, method, [
        { targetEntity: "Product", targetEntityId: "a", basis: 7 },
        { targetEntity: "Product", targetEntityId: "b", basis: 11 },
        { targetEntity: "Product", targetEntityId: "c", basis: 13 },
      ]);
      expect(sum(allocations.map((a) => a.allocatedAmount)), method).toBeCloseTo(1234.5678, 9);
      expect(sum(allocations.map((a) => a.allocationFactor)), method).toBeCloseTo(1, 12);
    }
  });

  it("gives a zero-basis target a zero allocation", () => {
    const allocations = allocate(100, "ECONOMIC", [
      { targetEntity: "Product", targetEntityId: "a", basis: 100 },
      { targetEntity: "Product", targetEntityId: "b", basis: 0 },
    ]);
    expect(allocations[1].allocatedAmount).toBe(0);
    expect(allocations[0].allocatedAmount).toBe(100);
  });

  it("rejects empty, negative and all-zero bases", () => {
    expect(() => allocate(100, "MASS", [])).toThrow(/at least one target/);
    expect(() =>
      allocate(100, "MASS", [{ targetEntity: "Product", targetEntityId: "a", basis: -1 }]),
    ).toThrow(/non-negative/);
    expect(() =>
      allocate(100, "MASS", [{ targetEntity: "Product", targetEntityId: "a", basis: 0 }]),
    ).toThrow(/sums to zero/);
  });
});

describe("addInventories", () => {
  it("adds two inventories including the Scope 3 category split", () => {
    const a = buildInventory(results.slice(0, 4));
    const b = buildInventory(results.slice(4));
    const combined = addInventories(a, b);
    const direct = buildInventory(results);
    expect(combined.totalEmissions).toBeCloseTo(direct.totalEmissions, 9);
    expect(combined.scope3ByCategory).toEqual(direct.scope3ByCategory);
    expect(combined.resultCount).toBe(direct.resultCount);
  });

  it("refuses to mix Scope 2 bases", () => {
    const a = buildInventory(results, { scope2Basis: "LOCATION" });
    const b = buildInventory(results, { scope2Basis: "MARKET" });
    expect(() => addInventories(a, b)).toThrow(CalculationError);
  });
});
