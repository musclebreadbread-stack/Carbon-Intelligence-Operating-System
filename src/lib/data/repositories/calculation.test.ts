import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const emissionResultFindMany = vi.fn();
const emissionCalculationFindMany = vi.fn();
const facilityFindMany = vi.fn();
const emissionSourceFindMany = vi.fn();
const activityDataEntryFindMany = vi.fn();
const emissionFactorFindMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    emissionResult: { findMany: (...args: unknown[]) => emissionResultFindMany(...args) },
    emissionCalculation: {
      findMany: (...args: unknown[]) => emissionCalculationFindMany(...args),
    },
    facility: { findMany: (...args: unknown[]) => facilityFindMany(...args) },
    emissionSource: { findMany: (...args: unknown[]) => emissionSourceFindMany(...args) },
    activityDataEntry: {
      findMany: (...args: unknown[]) => activityDataEntryFindMany(...args),
    },
    emissionFactor: { findMany: (...args: unknown[]) => emissionFactorFindMany(...args) },
  },
}));

import { buildInventory } from "@/lib/domain/emissions/aggregate";

import { getDataMode, resetDataMode } from "../db";
import {
  DEMO_CURRENT_YEAR,
  DEMO_EMISSION_FACTORS,
  DEMO_EXPECTED_ENTRY_COUNT,
  DEMO_FACILITY_CONSOLIDATION,
  DEMO_ORGANIZATION_ID,
  demoEntriesForYear,
  demoPeriodForYear,
} from "../demo";
import { runCalculation } from "@/lib/domain/emissions/orchestrator";

import {
  demoCalculationOutcome,
  getCalculationOutcome,
  getInventory,
  inventoryIntensity,
  listCalculations,
  listEmissionResults,
  resetDemoCalculationCache,
} from "./calculation";

const REAL_URL = "postgresql://app:s3cret@db.internal:5432/cios";
const ORIGINAL_URL = process.env.DATABASE_URL;

function p1001(): Error & { code: string } {
  const error = new Error("Can't reach database server") as Error & { code: string };
  error.code = "P1001";
  return error;
}

/** Makes every mocked Prisma delegate report the database as unreachable. */
function makeEverythingUnreachable(): void {
  for (const mock of [
    emissionResultFindMany,
    emissionCalculationFindMany,
    facilityFindMany,
    emissionSourceFindMany,
    activityDataEntryFindMany,
    emissionFactorFindMany,
  ]) {
    mock.mockRejectedValue(p1001());
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  resetDataMode();
  resetDemoCalculationCache();
  process.env.DATABASE_URL = REAL_URL;
});

afterEach(() => {
  if (ORIGINAL_URL === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = ORIGINAL_URL;
  resetDataMode();
  resetDemoCalculationCache();
});

describe("listEmissionResults against a database", () => {
  it("denormalises the deeper hierarchy ids from the source path", async () => {
    emissionSourceFindMany.mockResolvedValue([
      {
        id: "src-1",
        facilityId: "fac-1",
        buildingId: "bld-1",
        productionLineId: "line-1",
        equipmentId: "eq-1",
        facility: { businessUnitId: "bu-1" },
      },
    ]);
    emissionResultFindMany.mockResolvedValue([
      {
        id: "res-1",
        scope: "SCOPE_1",
        scope3Category: null,
        totalCO2e: 120.5,
        biogenicCO2: 0,
        unit: "tCO2e",
        businessUnitId: null,
        facilityId: null,
        emissionSourceId: "src-1",
      },
    ]);

    const results = await listEmissionResults("org-1", 2024);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      id: "res-1",
      organizationId: "org-1",
      businessUnitId: "bu-1",
      facilityId: "fac-1",
      buildingId: "bld-1",
      productionLineId: "line-1",
      equipmentId: "eq-1",
    });
    expect(getDataMode()).toBe("database");
  });
});

describe("getInventory", () => {
  it("aggregates persisted results with the aggregation engine", async () => {
    emissionSourceFindMany.mockResolvedValue([]);
    facilityFindMany.mockResolvedValue([
      {
        id: "fac-1",
        organizationId: "org-1",
        businessUnitId: "bu-1",
        name: "Plant",
        code: "P1",
        type: null,
        city: null,
        country: "KR",
        latitude: null,
        longitude: null,
        area: null,
        areaUnit: null,
        operationalControl: true,
        equityShare: 100,
        isActive: true,
      },
    ]);
    emissionResultFindMany.mockResolvedValue([
      {
        id: "r1",
        scope: "SCOPE_1",
        scope3Category: null,
        totalCO2e: 100,
        biogenicCO2: 0,
        unit: "tCO2e",
        businessUnitId: "bu-1",
        facilityId: "fac-1",
        emissionSourceId: null,
      },
      {
        id: "r2",
        scope: "SCOPE_2_LOCATION",
        scope3Category: null,
        totalCO2e: 250,
        biogenicCO2: 0,
        unit: "tCO2e",
        businessUnitId: "bu-1",
        facilityId: "fac-1",
        emissionSourceId: null,
      },
      {
        id: "r3",
        scope: "SCOPE_3",
        scope3Category: "CAT_1_PURCHASED_GOODS",
        totalCO2e: 400,
        biogenicCO2: 0,
        unit: "tCO2e",
        businessUnitId: "bu-1",
        facilityId: "fac-1",
        emissionSourceId: null,
      },
    ]);

    const view = await getInventory("org-1", 2024);
    expect(view.totals.scope1Total).toBe(100);
    expect(view.totals.scope2Location).toBe(250);
    expect(view.totals.scope3Total).toBe(400);
    expect(view.totals.totalEmissions).toBe(750);
    expect(view.byFacility).toHaveLength(1);
    expect(view.byFacility[0].key).toBe("fac-1");
    expect(view.consolidationApproach).toBe("OPERATIONAL_CONTROL");
  });

  it("halves a 50 % equity-share facility under equity-share consolidation", async () => {
    emissionSourceFindMany.mockResolvedValue([]);
    facilityFindMany.mockResolvedValue([
      {
        id: "fac-jv",
        organizationId: "org-1",
        businessUnitId: null,
        name: "JV",
        code: "JV",
        type: null,
        city: null,
        country: "KR",
        latitude: null,
        longitude: null,
        area: null,
        areaUnit: null,
        operationalControl: false,
        equityShare: 50,
        isActive: true,
      },
    ]);
    emissionResultFindMany.mockResolvedValue([
      {
        id: "r1",
        scope: "SCOPE_1",
        scope3Category: null,
        totalCO2e: 200,
        biogenicCO2: 0,
        unit: "tCO2e",
        businessUnitId: null,
        facilityId: "fac-jv",
        emissionSourceId: null,
      },
    ]);

    const view = await getInventory("org-1", 2024, {
      consolidationApproach: "EQUITY_SHARE",
    });
    expect(view.totals.scope1Total).toBe(200);
    expect(view.consolidated.scope1Total).toBe(100);
  });

  it("honours the market-based Scope 2 basis in the total", async () => {
    emissionSourceFindMany.mockResolvedValue([]);
    facilityFindMany.mockResolvedValue([]);
    emissionResultFindMany.mockResolvedValue([
      {
        id: "loc",
        scope: "SCOPE_2_LOCATION",
        scope3Category: null,
        totalCO2e: 300,
        biogenicCO2: 0,
        unit: "tCO2e",
        businessUnitId: null,
        facilityId: null,
        emissionSourceId: null,
      },
      {
        id: "mkt",
        scope: "SCOPE_2_MARKET",
        scope3Category: null,
        totalCO2e: 180,
        biogenicCO2: 0,
        unit: "tCO2e",
        businessUnitId: null,
        facilityId: null,
        emissionSourceId: null,
      },
    ]);

    const location = await getInventory("org-1", 2024, { scope2Basis: "LOCATION" });
    const market = await getInventory("org-1", 2024, { scope2Basis: "MARKET" });
    expect(location.totals.totalEmissions).toBe(300);
    expect(market.totals.totalEmissions).toBe(180);
  });
});

describe("getInventory in demo mode", () => {
  it("computes the inventory from the fixtures through the real orchestrator", async () => {
    makeEverythingUnreachable();
    const view = await getInventory(DEMO_ORGANIZATION_ID, DEMO_CURRENT_YEAR);
    expect(getDataMode()).toBe("demo");
    expect(view.results).toHaveLength(DEMO_EXPECTED_ENTRY_COUNT / 2);
    expect(view.computedFromFixtures).toBe(true);

    // The displayed numbers must equal a direct orchestrator run over the same
    // fixture data — that is the guarantee demo mode makes. `view.totals` is
    // gross of consolidation; `view.consolidated` is what the orchestrator
    // returns, because `runCalculation` consolidates its own output.
    const direct = runCalculation({
      organizationId: DEMO_ORGANIZATION_ID,
      name: `${DEMO_CURRENT_YEAR} 온실가스 인벤토리 (${DEMO_CURRENT_YEAR} GHG inventory)`,
      reportingYear: DEMO_CURRENT_YEAR,
      period: demoPeriodForYear(DEMO_CURRENT_YEAR),
      gwpVersion: "AR6",
      consolidationApproach: "OPERATIONAL_CONTROL",
      scope2Basis: "LOCATION",
      facilities: DEMO_FACILITY_CONSOLIDATION,
      candidateFactors: DEMO_EMISSION_FACTORS,
      entries: demoEntriesForYear(DEMO_CURRENT_YEAR),
    });
    expect(view.consolidated).toEqual(direct.inventory);
    expect(view.consolidated).toEqual(
      buildInventory(direct.results, { scope2Basis: "LOCATION" }),
    );
  });

  it("returns identical figures on repeated reads", async () => {
    makeEverythingUnreachable();
    const first = await getInventory(DEMO_ORGANIZATION_ID, DEMO_CURRENT_YEAR);
    const second = await getInventory(DEMO_ORGANIZATION_ID, DEMO_CURRENT_YEAR);
    expect(second.totals).toEqual(first.totals);
  });

  it("keeps the JV facility out of the operational-control consolidation", async () => {
    makeEverythingUnreachable();
    const view = await getInventory(DEMO_ORGANIZATION_ID, DEMO_CURRENT_YEAR);
    expect(view.consolidated.totalEmissions).toBeLessThan(view.totals.totalEmissions);
  });
});

describe("listCalculations", () => {
  it("maps persisted calculation rows with their result counts", async () => {
    emissionCalculationFindMany.mockResolvedValue([
      {
        id: "calc-1",
        organizationId: "org-1",
        name: "2024 inventory",
        reportingYear: 2024,
        scope: "SCOPE_1",
        status: "completed",
        totalEmissions: 4321,
        unit: "tCO2e",
        calculatedAt: new Date(Date.UTC(2025, 0, 5)),
        createdAt: new Date(Date.UTC(2025, 0, 5)),
        _count: { results: 96 },
      },
    ]);
    const rows = await listCalculations("org-1");
    expect(rows[0]).toMatchObject({ id: "calc-1", totalEmissions: 4321, resultCount: 96 });
  });

  it("synthesises one calculation per scope from the fixtures in demo mode", async () => {
    makeEverythingUnreachable();
    const rows = await listCalculations(DEMO_ORGANIZATION_ID, {
      reportingYear: DEMO_CURRENT_YEAR,
    });
    expect(rows.length).toBeGreaterThan(0);
    const scopes = new Set(rows.map((row) => row.scope));
    expect(scopes.has("SCOPE_1")).toBe(true);
    expect(scopes.has("SCOPE_3")).toBe(true);
    for (const row of rows) {
      expect(row.reportingYear).toBe(DEMO_CURRENT_YEAR);
      expect(row.totalEmissions).toBeGreaterThan(0);
      expect(row.resultCount).toBeGreaterThan(0);
    }
  });
});

describe("getCalculationOutcome", () => {
  it("runs the orchestrator over repository data in demo mode", async () => {
    makeEverythingUnreachable();
    const outcome = await getCalculationOutcome(DEMO_ORGANIZATION_ID, DEMO_CURRENT_YEAR);
    expect(outcome.results).toHaveLength(DEMO_EXPECTED_ENTRY_COUNT / 2);
    expect(outcome.traces).toHaveLength(outcome.results.length);
    expect(Object.keys(outcome.factorSelections)).toHaveLength(outcome.results.length);
    expect(outcome.quality.aggregate.overallScore).toBeGreaterThan(0);
  });
});

describe("demoCalculationOutcome", () => {
  it("memoises per option set and clears on reset", () => {
    const first = demoCalculationOutcome(DEMO_CURRENT_YEAR);
    expect(demoCalculationOutcome(DEMO_CURRENT_YEAR)).toBe(first);
    resetDemoCalculationCache();
    expect(demoCalculationOutcome(DEMO_CURRENT_YEAR)).not.toBe(first);
  });

  it("keys the cache on the Scope 2 basis", () => {
    const location = demoCalculationOutcome(DEMO_CURRENT_YEAR, { scope2Basis: "LOCATION" });
    const market = demoCalculationOutcome(DEMO_CURRENT_YEAR, { scope2Basis: "MARKET" });
    expect(market).not.toBe(location);
    expect(market.inventory.totalEmissions).toBeLessThan(location.inventory.totalEmissions);
  });
});

describe("inventoryIntensity", () => {
  it("divides the total by the denominator", async () => {
    makeEverythingUnreachable();
    const view = await getInventory(DEMO_ORGANIZATION_ID, DEMO_CURRENT_YEAR);
    const metric = inventoryIntensity(view.totals, {
      type: "REVENUE",
      value: 500,
      unit: "MUSD",
    });
    expect(metric.value).toBeCloseTo(view.totals.totalEmissions / 500, 6);
    expect(metric.unit).toBe("tCO2e/MUSD");
  });
});
