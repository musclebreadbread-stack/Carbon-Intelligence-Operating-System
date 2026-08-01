import { describe, expect, it } from "vitest";

import { EMISSION_FACTOR_UNITS, GHG_SCOPES, SCOPE3_CATEGORIES } from "@/lib/core/enums";
import { FACTOR_DENOMINATOR_UNIT } from "@/lib/reference/units";

import { fieldErrors } from "./common";
import {
  FACTOR_UNITS_WITH_DENOMINATOR,
  emissionFactorInputSchema,
  emissionFactorQuerySchema,
  emissionFactorSourceInputSchema,
  emissionFactorVersionInputSchema,
  factorResolutionCriteriaSchema,
  unitConversionInputSchema,
} from "./emission-factor";

const validFactor = {
  name: "UK grid electricity 2024",
  value: 0.20705,
  unit: "KG_CO2E_PER_KWH",
};

function paths(result: { error?: { issues: { path: (string | number)[] }[] } }) {
  return (result.error?.issues ?? []).map((issue) => issue.path.join("."));
}

describe("emissionFactorInputSchema", () => {
  it("parses a valid factor and applies the defaults", () => {
    const result = emissionFactorInputSchema.safeParse(validFactor);
    expect(result.success).toBe(true);
    expect(result.data?.gasType).toBe("CO2e");
    expect(result.data?.isActive).toBe(true);
  });

  it("accepts a zero factor for a zero-carbon tariff", () => {
    expect(emissionFactorInputSchema.safeParse({ ...validFactor, value: 0 }).success).toBe(true);
  });

  it("rejects a negative factor value", () => {
    const result = emissionFactorInputSchema.safeParse({ ...validFactor, value: -0.1 });
    expect(result.success).toBe(false);
    expect(paths(result)).toContain("value");
  });

  it("accepts every EmissionFactorUnit the Prisma enum declares", () => {
    for (const unit of EMISSION_FACTOR_UNITS) {
      expect(emissionFactorInputSchema.safeParse({ ...validFactor, unit }).success, unit).toBe(true);
    }
  });

  it("rejects a unit outside the EmissionFactorUnit enum", () => {
    const result = emissionFactorInputSchema.safeParse({
      ...validFactor,
      unit: "KG_CO2E_PER_BANANA",
    });
    expect(result.success).toBe(false);
    expect(paths(result)).toContain("unit");
  });

  it("rejects validTo on or before validFrom", () => {
    for (const validTo of ["2024-01-01", "2023-06-01"]) {
      const result = emissionFactorInputSchema.safeParse({
        ...validFactor,
        validFrom: "2024-01-01",
        validTo,
      });
      expect(result.success, validTo).toBe(false);
      expect(paths(result)).toEqual(["validTo"]);
      expect(fieldErrors(result.error!).validTo?.[0]).toMatch(/must be after validFrom/);
    }
  });

  it("accepts an open-ended validity window", () => {
    const result = emissionFactorInputSchema.safeParse({
      ...validFactor,
      validFrom: "2024-01-01",
      validTo: null,
    });
    expect(result.success).toBe(true);
    expect(result.data?.validTo).toBeNull();
  });

  it("accepts a well-ordered validity window and coerces the dates", () => {
    const result = emissionFactorInputSchema.safeParse({
      ...validFactor,
      validFrom: "2024-01-01",
      validTo: "2024-12-31",
    });
    expect(result.success).toBe(true);
    expect(result.data?.validFrom).toBeInstanceOf(Date);
  });

  it("requires a scope3Category on a Scope 3 factor", () => {
    const result = emissionFactorInputSchema.safeParse({ ...validFactor, scope: "SCOPE_3" });
    expect(result.success).toBe(false);
    expect(paths(result)).toEqual(["scope3Category"]);
  });

  it("rejects a scope3Category on a Scope 1 or Scope 2 factor", () => {
    for (const scope of GHG_SCOPES.filter((s) => s !== "SCOPE_3")) {
      const result = emissionFactorInputSchema.safeParse({
        ...validFactor,
        scope,
        scope3Category: SCOPE3_CATEGORIES[0],
      });
      expect(result.success, scope).toBe(false);
      expect(paths(result)).toEqual(["scope3Category"]);
    }
  });

  it("leaves scope3Category free on a factor with no declared scope", () => {
    const result = emissionFactorInputSchema.safeParse({
      ...validFactor,
      scope3Category: SCOPE3_CATEGORIES[0],
    });
    expect(result.success).toBe(true);
  });

  it("rejects an uncertainty outside the 0..1 fraction range", () => {
    expect(emissionFactorInputSchema.safeParse({ ...validFactor, uncertainty: 1.2 }).success).toBe(
      false,
    );
    expect(emissionFactorInputSchema.safeParse({ ...validFactor, uncertainty: 0.15 }).success).toBe(
      true,
    );
  });

  it("rejects a country code that is not two characters", () => {
    const result = emissionFactorInputSchema.safeParse({ ...validFactor, country: "GBR" });
    expect(result.success).toBe(false);
    expect(paths(result)).toContain("country");
  });
});

describe("EmissionFactorUnit / denominator registry alignment", () => {
  it("registers a denominator unit for every EmissionFactorUnit member", () => {
    const missing = EMISSION_FACTOR_UNITS.filter(
      (unit) => FACTOR_DENOMINATOR_UNIT[unit] === undefined,
    );
    expect(missing).toEqual([]);
    expect(FACTOR_UNITS_WITH_DENOMINATOR).toHaveLength(EMISSION_FACTOR_UNITS.length);
  });
});

describe("emissionFactorSourceInputSchema", () => {
  it("requires a publisher and a citable url", () => {
    const result = emissionFactorSourceInputSchema.safeParse({ name: "DEFRA 2024" });
    expect(result.success).toBe(false);
    expect(paths(result)).toEqual(expect.arrayContaining(["publisher", "url"]));
  });

  it("parses a fully cited source", () => {
    const result = emissionFactorSourceInputSchema.safeParse({
      name: "UK Government GHG Conversion Factors 2024",
      publisher: "UK Department for Energy Security and Net Zero",
      url: "https://www.gov.uk/government/collections/government-conversion-factors-for-company-reporting",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a non-url source reference", () => {
    const result = emissionFactorSourceInputSchema.safeParse({
      name: "Internal",
      publisher: "Us",
      url: "not-a-url",
    });
    expect(result.success).toBe(false);
    expect(paths(result)).toContain("url");
  });
});

describe("emissionFactorVersionInputSchema", () => {
  it("parses a version and defaults isLatest to false", () => {
    const result = emissionFactorVersionInputSchema.safeParse({
      sourceId: "src-1",
      version: "2024.1",
    });
    expect(result.success).toBe(true);
    expect(result.data?.isLatest).toBe(false);
  });
});

describe("factorResolutionCriteriaSchema", () => {
  it("parses the criteria resolveFactor expects", () => {
    const result = factorResolutionCriteriaSchema.safeParse({
      date: "2024-06-15",
      scope: "SCOPE_2_LOCATION",
      region: "UK",
      country: "GB",
      unit: "kwh",
    });
    expect(result.success).toBe(true);
    expect(result.data?.unit).toBe("kWh");
    expect(result.data?.date).toBeInstanceOf(Date);
  });

  it("rejects a unit outside the reference registry", () => {
    const result = factorResolutionCriteriaSchema.safeParse({
      date: "2024-06-15",
      scope: "SCOPE_1",
      unit: "furlongs",
    });
    expect(result.success).toBe(false);
    expect(paths(result)).toContain("unit");
  });
});

describe("emissionFactorQuerySchema", () => {
  it("coerces includeInactive from a query string", () => {
    const result = emissionFactorQuerySchema.safeParse({ includeInactive: "true" });
    expect(result.success).toBe(true);
    expect(result.data?.includeInactive).toBe(true);
  });

  it("defaults includeInactive to false", () => {
    expect(emissionFactorQuerySchema.safeParse({}).data?.includeInactive).toBe(false);
  });
});

describe("unitConversionInputSchema", () => {
  it("parses a positive conversion between two registry units", () => {
    const result = unitConversionInputSchema.safeParse({
      fromUnit: "MWh",
      toUnit: "GJ",
      factor: 3.6,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a non-positive factor", () => {
    const result = unitConversionInputSchema.safeParse({
      fromUnit: "MWh",
      toUnit: "GJ",
      factor: 0,
    });
    expect(result.success).toBe(false);
    expect(paths(result)).toContain("factor");
  });

  it("rejects an identity conversion", () => {
    const result = unitConversionInputSchema.safeParse({
      fromUnit: "kWh",
      toUnit: "kwh",
      factor: 1,
    });
    expect(result.success).toBe(false);
    expect(paths(result)).toEqual(["toUnit"]);
  });
});
