import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const findManyEntries = vi.fn();
const findManyActivityData = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    activityDataEntry: { findMany: (...args: unknown[]) => findManyEntries(...args) },
    activityData: { findMany: (...args: unknown[]) => findManyActivityData(...args) },
  },
}));

import { DEMO_ORGANIZATION_ID, DEMO_EXPECTED_ENTRY_COUNT } from "../demo";
import { getDataMode, resetDataMode } from "../db";
import {
  listActivityData,
  listActivityEntries,
  listCalculationEntries,
  listReportingYears,
  sectorForEntry,
} from "./activity-data";

const REAL_URL = "postgresql://app:s3cret@db.internal:5432/cios";
const ORIGINAL_URL = process.env.DATABASE_URL;

/** A Prisma-style connection failure. */
function p1001(): Error & { code: string } {
  const error = new Error("Can't reach database server at db.internal:5432") as Error & {
    code: string;
  };
  error.code = "P1001";
  return error;
}

beforeEach(() => {
  vi.clearAllMocks();
  resetDataMode();
  process.env.DATABASE_URL = REAL_URL;
});

afterEach(() => {
  if (ORIGINAL_URL === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = ORIGINAL_URL;
  resetDataMode();
});

describe("listActivityEntries against a database", () => {
  it("maps rows onto the entry shape and denormalises the header fields", async () => {
    findManyEntries.mockResolvedValue([
      {
        id: "row-1",
        activityDataId: "ad-1",
        emissionSourceId: "src-1",
        quantity: 1234.5,
        unit: "kWh",
        startDate: new Date(Date.UTC(2024, 0, 1)),
        endDate: new Date(Date.UTC(2024, 0, 31)),
        notes: "January electricity",
        evidenceUrl: "https://example.com/e.pdf",
        isEstimated: false,
        uncertainty: 0.02,
        productId: null,
        supplierId: null,
        vehicleId: null,
        fuelId: null,
        refrigerantId: null,
        rawMaterialId: null,
        logisticsRouteId: null,
        energySourceId: "energy-1",
        wasteTypeId: null,
        waterSourceId: null,
        activityData: {
          scope: "SCOPE_2_LOCATION",
          scope3Category: null,
          facilityId: "fac-1",
          reportingYear: 2024,
        },
      },
    ]);

    const rows = await listActivityEntries({ organizationId: "org-1" } as never);
    expect(findManyEntries).toHaveBeenCalledOnce();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "row-1",
      quantity: 1234.5,
      unit: "kWh",
      scope: "SCOPE_2_LOCATION",
      facilityId: "fac-1",
      reportingYear: 2024,
      energySourceId: "energy-1",
    });
    expect(getDataMode()).toBe("database");
  });

  it("passes the query filters through to Prisma", async () => {
    findManyEntries.mockResolvedValue([]);
    await listActivityEntries({
      organizationId: "org-1",
      scope: "SCOPE_1",
      reportingYear: 2024,
      facilityId: "fac-9",
    } as never);
    const args = findManyEntries.mock.calls[0][0] as {
      where: { activityData: Record<string, unknown> };
    };
    expect(args.where.activityData).toMatchObject({
      organizationId: "org-1",
      scope: "SCOPE_1",
      reportingYear: 2024,
      facilityId: "fac-9",
    });
  });
});

describe("listActivityEntries in demo mode", () => {
  it("returns fixture entries and flags demo mode when Prisma throws P1001", async () => {
    findManyEntries.mockRejectedValue(p1001());
    const rows = await listActivityEntries({ organizationId: DEMO_ORGANIZATION_ID } as never);
    expect(rows).toHaveLength(DEMO_EXPECTED_ENTRY_COUNT);
    expect(getDataMode()).toBe("demo");
  });

  it("still applies the query filters to the fixture rows", async () => {
    findManyEntries.mockRejectedValue(p1001());
    const rows = await listActivityEntries({
      organizationId: DEMO_ORGANIZATION_ID,
      scope: "SCOPE_1",
      reportingYear: 2024,
    } as never);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.scope).toBe("SCOPE_1");
      expect(row.reportingYear).toBe(2024);
    }
  });

  it("returns nothing for another tenant", async () => {
    findManyEntries.mockRejectedValue(p1001());
    const rows = await listActivityEntries({ organizationId: "someone-else" } as never);
    expect(rows).toEqual([]);
  });

  it("rethrows a genuine query error instead of masking it as demo mode", async () => {
    const queryError = new Error("Unknown argument `bogus`") as Error & { code: string };
    queryError.code = "P2009";
    findManyEntries.mockRejectedValue(queryError);
    await expect(
      listActivityEntries({ organizationId: DEMO_ORGANIZATION_ID } as never),
    ).rejects.toThrow(/Unknown argument/);
    expect(getDataMode()).toBe("database");
  });
});

describe("listActivityData", () => {
  it("maps the entry count from the Prisma aggregate", async () => {
    findManyActivityData.mockResolvedValue([
      {
        id: "ad-1",
        organizationId: "org-1",
        facilityId: "fac-1",
        businessUnitId: "bu-1",
        name: "2024 electricity",
        description: null,
        scope: "SCOPE_2_LOCATION",
        scope3Category: null,
        reportingYear: 2024,
        dataSource: "METER_READING",
        dataQuality: "HIGH",
        isVerified: false,
        _count: { entries: 12 },
      },
    ]);
    const rows = await listActivityData({ organizationId: "org-1" } as never);
    expect(rows[0].entryCount).toBe(12);
  });

  it("computes the entry count from the fixtures in demo mode", async () => {
    findManyActivityData.mockRejectedValue(p1001());
    const rows = await listActivityData({ organizationId: DEMO_ORGANIZATION_ID } as never);
    expect(rows).toHaveLength(DEMO_EXPECTED_ENTRY_COUNT / 12);
    for (const row of rows) {
      expect(row.entryCount, row.id).toBe(12);
    }
  });
});

describe("listCalculationEntries", () => {
  it("projects Prisma rows onto the orchestrator input", async () => {
    findManyEntries.mockResolvedValue([
      {
        id: "row-1",
        activityDataId: "ad-1",
        emissionSourceId: "src-1",
        quantity: 900,
        unit: "L",
        startDate: new Date(Date.UTC(2024, 2, 1)),
        endDate: new Date(Date.UTC(2024, 2, 31)),
        notes: "March diesel",
        evidenceUrl: null,
        isEstimated: false,
        uncertainty: 0.05,
        supplierId: null,
        activityData: {
          scope: "SCOPE_1",
          scope3Category: null,
          facilityId: "fac-1",
          businessUnitId: "bu-1",
        },
        emissionSource: {
          id: "src-1",
          sourceType: "MOBILE",
          calculationApproach: "ACTIVITY_BASED",
          facilityId: "fac-1",
          buildingId: "bld-1",
          productionLineId: "line-1",
          equipmentId: "eq-1",
          facility: { businessUnitId: "bu-1", country: "KR" },
        },
        fuel: { name: "경유 (Diesel)" },
        refrigerant: null,
        supplier: null,
      },
    ]);

    const entries = await listCalculationEntries("org-1", 2024);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      id: "row-1",
      scope: "SCOPE_1",
      scope1SourceType: "MOBILE",
      mobileMethod: "FUEL",
      sector: "Diesel road transport",
      buildingId: "bld-1",
      productionLineId: "line-1",
      equipmentId: "eq-1",
      hasEvidence: false,
    });
    // Prisma stores uncertainty as a fraction; the engine wants per cent.
    expect(entries[0].activityDataUncertainty).toBeCloseTo(5, 10);
  });

  it("builds the fugitive balance for a fugitive source", async () => {
    findManyEntries.mockResolvedValue([
      {
        id: "row-f",
        activityDataId: "ad-f",
        emissionSourceId: "src-f",
        quantity: 14,
        unit: "kg",
        startDate: new Date(Date.UTC(2024, 6, 1)),
        endDate: new Date(Date.UTC(2024, 6, 31)),
        notes: null,
        evidenceUrl: null,
        isEstimated: false,
        uncertainty: null,
        supplierId: null,
        activityData: {
          scope: "SCOPE_1",
          scope3Category: null,
          facilityId: "fac-1",
          businessUnitId: "bu-1",
        },
        emissionSource: {
          id: "src-f",
          sourceType: "FUGITIVE",
          calculationApproach: "ACTIVITY_BASED",
          facilityId: "fac-1",
          buildingId: null,
          productionLineId: null,
          equipmentId: null,
          facility: { businessUnitId: "bu-1", country: "KR" },
        },
        fuel: null,
        refrigerant: { name: "R-410A" },
        supplier: null,
      },
    ]);

    const entries = await listCalculationEntries("org-1", 2024);
    expect(entries[0].fugitive).toEqual({
      method: "SCREENING",
      blend: "R-410A",
      inventoryChange: 0,
      purchases: 14,
      disposals: 0,
    });
  });

  it("falls back to the pre-projected fixture entries in demo mode", async () => {
    findManyEntries.mockRejectedValue(p1001());
    const entries = await listCalculationEntries(DEMO_ORGANIZATION_ID, 2024);
    expect(entries).toHaveLength(DEMO_EXPECTED_ENTRY_COUNT / 2);
    for (const entry of entries) {
      expect(entry.dataPeriod?.start.getUTCFullYear()).toBe(2024);
    }
  });

  it("applies the facility and scope filters after projection", async () => {
    findManyEntries.mockRejectedValue(p1001());
    const entries = await listCalculationEntries(DEMO_ORGANIZATION_ID, 2024, {
      facilityIds: ["demo-fac-ulsan"],
      scopes: ["SCOPE_1"],
    });
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(entry.facilityId).toBe("demo-fac-ulsan");
      expect(entry.scope).toBe("SCOPE_1");
    }
  });
});

describe("listReportingYears", () => {
  it("reads distinct years from the database", async () => {
    findManyActivityData.mockResolvedValue([
      { reportingYear: 2024 },
      { reportingYear: 2023 },
    ]);
    await expect(listReportingYears("org-1")).resolves.toEqual([2024, 2023]);
  });

  it("returns the fixture years newest first in demo mode", async () => {
    findManyActivityData.mockRejectedValue(p1001());
    await expect(listReportingYears(DEMO_ORGANIZATION_ID)).resolves.toEqual([2024, 2023]);
  });
});

describe("sectorForEntry", () => {
  it("separates stationary from mobile diesel so the wrong factor cannot win", () => {
    expect(
      sectorForEntry({
        scope: "SCOPE_1",
        scope3Category: null,
        sourceType: "STATIONARY",
        fuelName: "Diesel",
      }),
    ).toBe("Diesel stationary combustion");
    expect(
      sectorForEntry({
        scope: "SCOPE_1",
        scope3Category: null,
        sourceType: "MOBILE",
        fuelName: "Diesel",
      }),
    ).toBe("Diesel road transport");
  });

  it("distinguishes every Scope 1 fuel it knows", () => {
    const cases: readonly [string, string][] = [
      ["Natural gas", "Natural gas stationary combustion"],
      ["LPG", "LPG stationary combustion"],
      ["Fuel oil", "Fuel oil stationary combustion"],
      ["Anthracite", "Anthracite stationary combustion"],
    ];
    for (const [fuelName, expected] of cases) {
      expect(
        sectorForEntry({
          scope: "SCOPE_1",
          scope3Category: null,
          sourceType: "STATIONARY",
          fuelName,
        }),
        fuelName,
      ).toBe(expected);
    }
  });

  it("recognises the Korean fuel names the master data uses", () => {
    expect(
      sectorForEntry({
        scope: "SCOPE_1",
        scope3Category: null,
        sourceType: "STATIONARY",
        fuelName: "천연가스 (Natural gas)",
      }),
    ).toBe("Natural gas stationary combustion");
  });

  it("maps each Scope 3 category to its own sector", () => {
    expect(
      sectorForEntry({
        scope: "SCOPE_3",
        scope3Category: "CAT_4_UPSTREAM_TRANSPORT",
        sourceType: null,
        fuelName: null,
      }),
    ).toBe("Road freight");
    expect(
      sectorForEntry({
        scope: "SCOPE_3",
        scope3Category: "CAT_6_BUSINESS_TRAVEL",
        sourceType: null,
        fuelName: null,
      }),
    ).toBe("Air travel");
    expect(
      sectorForEntry({
        scope: "SCOPE_3",
        scope3Category: "CAT_7_EMPLOYEE_COMMUTING",
        sourceType: null,
        fuelName: null,
      }),
    ).toBe("Commuting");
  });

  it("leaves Scope 2 unsectored so the generic grid factor applies", () => {
    expect(
      sectorForEntry({
        scope: "SCOPE_2_LOCATION",
        scope3Category: null,
        sourceType: "PURCHASED_ELECTRICITY",
        fuelName: null,
      }),
    ).toBeNull();
  });
});
