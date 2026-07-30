import { describe, expect, it } from "vitest";

import {
  DATA_QUALITY_LEVELS,
  DATA_SOURCE_TYPES,
  GHG_SCOPES,
  SCOPE3_CATEGORIES,
} from "@/lib/core/enums";

import {
  activityDataEntryInputSchema,
  activityDataEntryUpdateSchema,
  activityDataInputSchema,
  activityDataQuerySchema,
  meterReadingInputSchema,
} from "./activity-data";
import { fieldErrors } from "./common";

const validEntry = {
  activityDataId: "ad-1",
  quantity: 1200,
  unit: "kWh",
  startDate: "2024-01-01",
  endDate: "2024-01-31",
};

/** Collects the dotted paths of every issue on a failed parse. */
function paths(result: { success: boolean; error?: { issues: { path: (string | number)[] }[] } }) {
  return (result.error?.issues ?? []).map((issue) => issue.path.join("."));
}

describe("activityDataEntryInputSchema", () => {
  it("parses a valid entry and coerces the dates", () => {
    const result = activityDataEntryInputSchema.safeParse(validEntry);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.quantity).toBe(1200);
    expect(result.data.startDate).toBeInstanceOf(Date);
    expect(result.data.endDate.getTime()).toBeGreaterThan(result.data.startDate.getTime());
    expect(result.data.isEstimated).toBe(false);
  });

  it("rejects a zero or negative quantity on the quantity path", () => {
    for (const quantity of [0, -1]) {
      const result = activityDataEntryInputSchema.safeParse({ ...validEntry, quantity });
      expect(result.success).toBe(false);
      expect(paths(result)).toContain("quantity");
    }
  });

  it("rejects endDate before startDate on the endDate path", () => {
    const result = activityDataEntryInputSchema.safeParse({
      ...validEntry,
      startDate: "2024-03-01",
      endDate: "2024-02-01",
    });
    expect(result.success).toBe(false);
    expect(paths(result)).toEqual(["endDate"]);
    expect(fieldErrors(result.error!).endDate?.[0]).toMatch(/on or after startDate/);
  });

  it("accepts an instantaneous period where endDate equals startDate", () => {
    const result = activityDataEntryInputSchema.safeParse({
      ...validEntry,
      startDate: "2024-01-01",
      endDate: "2024-01-01",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a unit that is not in the reference registry", () => {
    const result = activityDataEntryInputSchema.safeParse({ ...validEntry, unit: "bananas" });
    expect(result.success).toBe(false);
    expect(paths(result)).toContain("unit");
    expect(fieldErrors(result.error!).unit?.[0]).toMatch(/not in the unit registry/);
  });

  it("normalises a registry unit to its canonical spelling", () => {
    const result = activityDataEntryInputSchema.safeParse({ ...validEntry, unit: "kwh" });
    expect(result.success).toBe(true);
    expect(result.data?.unit).toBe("kWh");
  });

  it("rejects an out-of-range uncertainty fraction", () => {
    const result = activityDataEntryInputSchema.safeParse({ ...validEntry, uncertainty: 1.5 });
    expect(result.success).toBe(false);
    expect(paths(result)).toContain("uncertainty");
  });

  it("accepts master-data references and leaves them optional", () => {
    const result = activityDataEntryInputSchema.safeParse({
      ...validEntry,
      fuelId: "fuel-diesel",
      emissionSourceId: "src-boiler-1",
    });
    expect(result.success).toBe(true);
    expect(result.data?.fuelId).toBe("fuel-diesel");
    expect(result.data?.supplierId).toBeUndefined();
  });
});

describe("activityDataEntryUpdateSchema", () => {
  it("accepts a partial update carrying only the id and one field", () => {
    const result = activityDataEntryUpdateSchema.safeParse({ id: "e-1", quantity: 42 });
    expect(result.success).toBe(true);
    expect(result.data?.unit).toBeUndefined();
  });

  it("still enforces date ordering when both dates are supplied", () => {
    const result = activityDataEntryUpdateSchema.safeParse({
      id: "e-1",
      startDate: "2024-05-01",
      endDate: "2024-04-01",
    });
    expect(result.success).toBe(false);
    expect(paths(result)).toEqual(["endDate"]);
  });

  it("skips the ordering rule when only one date is supplied", () => {
    const result = activityDataEntryUpdateSchema.safeParse({ id: "e-1", endDate: "2024-04-01" });
    expect(result.success).toBe(true);
  });

  it("requires the id", () => {
    const result = activityDataEntryUpdateSchema.safeParse({ quantity: 1 });
    expect(result.success).toBe(false);
    expect(paths(result)).toContain("id");
  });
});

describe("activityDataInputSchema", () => {
  const base = {
    organizationId: "org-1",
    name: "2024 grid electricity",
    scope: "SCOPE_2_LOCATION" as const,
    reportingYear: 2024,
  };

  it("applies the documented defaults", () => {
    const result = activityDataInputSchema.safeParse(base);
    expect(result.success).toBe(true);
    expect(result.data?.dataSource).toBe("MANUAL_ENTRY");
    expect(result.data?.dataQuality).toBe("MEDIUM");
    expect(result.data?.isVerified).toBe(false);
  });

  it("requires a scope3Category on a Scope 3 set", () => {
    const result = activityDataInputSchema.safeParse({ ...base, scope: "SCOPE_3" });
    expect(result.success).toBe(false);
    expect(paths(result)).toEqual(["scope3Category"]);
  });

  it("rejects a scope3Category on a non-Scope-3 set", () => {
    const result = activityDataInputSchema.safeParse({
      ...base,
      scope3Category: "CAT_1_PURCHASED_GOODS",
    });
    expect(result.success).toBe(false);
    expect(paths(result)).toEqual(["scope3Category"]);
  });

  it("accepts every Scope 3 category the Prisma enum declares", () => {
    for (const category of SCOPE3_CATEGORIES) {
      const result = activityDataInputSchema.safeParse({
        ...base,
        scope: "SCOPE_3",
        scope3Category: category,
      });
      expect(result.success, category).toBe(true);
    }
  });

  it("accepts every GHGScope, DataSourceType and DataQualityLevel member", () => {
    for (const scope of GHG_SCOPES) {
      const payload =
        scope === "SCOPE_3"
          ? { ...base, scope, scope3Category: "CAT_1_PURCHASED_GOODS" }
          : { ...base, scope };
      expect(activityDataInputSchema.safeParse(payload).success, scope).toBe(true);
    }
    for (const dataSource of DATA_SOURCE_TYPES) {
      expect(activityDataInputSchema.safeParse({ ...base, dataSource }).success, dataSource).toBe(
        true,
      );
    }
    for (const dataQuality of DATA_QUALITY_LEVELS) {
      expect(
        activityDataInputSchema.safeParse({ ...base, dataQuality }).success,
        dataQuality,
      ).toBe(true);
    }
  });

  it("rejects an unknown enum member", () => {
    const result = activityDataInputSchema.safeParse({ ...base, scope: "SCOPE_4" });
    expect(result.success).toBe(false);
    expect(paths(result)).toContain("scope");
  });

  it("rejects a reporting year outside the supported window", () => {
    expect(activityDataInputSchema.safeParse({ ...base, reportingYear: 1899 }).success).toBe(false);
    expect(activityDataInputSchema.safeParse({ ...base, reportingYear: 2101 }).success).toBe(false);
  });
});

describe("activityDataQuerySchema", () => {
  it("coerces a string reportingYear, as arriving from a URL query", () => {
    const result = activityDataQuerySchema.safeParse({
      organizationId: "org-1",
      reportingYear: "2024",
    });
    expect(result.success).toBe(true);
    expect(result.data?.reportingYear).toBe(2024);
  });

  it("requires the organizationId so no query can cross tenants by omission", () => {
    const result = activityDataQuerySchema.safeParse({});
    expect(result.success).toBe(false);
    expect(paths(result)).toContain("organizationId");
  });
});

describe("meterReadingInputSchema", () => {
  const base = {
    facilityId: "fac-1",
    meterId: "M-001",
    meterType: "electricity",
    readingDate: "2024-01-31",
    currentReading: 5000,
    consumption: 1200,
    unit: "kWh",
  };

  it("parses a valid reading", () => {
    expect(meterReadingInputSchema.safeParse(base).success).toBe(true);
  });

  it("rejects a rollback where the current reading is below the previous one", () => {
    const result = meterReadingInputSchema.safeParse({
      ...base,
      previousReading: 6000,
    });
    expect(result.success).toBe(false);
    expect(paths(result)).toEqual(["currentReading"]);
  });

  it("accepts an unknown previous reading", () => {
    expect(meterReadingInputSchema.safeParse({ ...base, previousReading: null }).success).toBe(true);
  });
});
