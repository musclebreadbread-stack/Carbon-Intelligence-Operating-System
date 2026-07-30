import { describe, expect, it } from "vitest";

import { NotFoundError } from "@/lib/core/errors";

import { factorDenominatorUnit, resolveFactor, tryResolveFactor } from "./resolve-factor";
import type { EmissionFactorLike, FactorCriteria } from "./types";

const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

const baseFactor = (overrides: Partial<EmissionFactorLike> & { id: string }): EmissionFactorLike => ({
  name: `factor-${overrides.id}`,
  value: 0.4,
  unit: "KG_CO2E_PER_KWH",
  gasType: "CO2e",
  scope: "SCOPE_2_LOCATION",
  isActive: true,
  ...overrides,
});

const criteria: FactorCriteria = {
  date: utc("2024-06-15"),
  scope: "SCOPE_2_LOCATION",
  country: "KR",
  region: "APAC",
  sector: "Manufacturing",
  organizationId: "org-1",
  unit: "kWh",
};

describe("resolveFactor validity windows", () => {
  it("excludes an expired factor and picks the current one", () => {
    const expired = baseFactor({
      id: "expired",
      value: 0.5,
      validFrom: utc("2020-01-01"),
      validTo: utc("2023-12-31"),
    });
    const current = baseFactor({
      id: "current",
      value: 0.42,
      validFrom: utc("2024-01-01"),
      validTo: utc("2024-12-31"),
    });

    const selection = resolveFactor([expired, current], criteria);
    expect(selection.factor.id).toBe("current");
    expect(selection.rejected).toEqual([
      { factorId: "expired", reason: expect.stringContaining("expired at") },
    ]);
  });

  it("excludes a factor that is not yet valid", () => {
    const future = baseFactor({ id: "future", validFrom: utc("2025-01-01") });
    const open = baseFactor({ id: "open" });
    const selection = resolveFactor([future, open], criteria);
    expect(selection.factor.id).toBe("open");
    expect(selection.rejected[0].reason).toMatch(/not yet valid/);
  });

  it("treats null validFrom/validTo as open-ended", () => {
    const selection = resolveFactor([baseFactor({ id: "open", validFrom: null, validTo: null })], criteria);
    expect(selection.factor.id).toBe("open");
    expect(selection.selectionRationale.some((line) => line.includes("open to open"))).toBe(true);
  });

  it("excludes inactive factors unless explicitly included", () => {
    const inactive = baseFactor({ id: "inactive", isActive: false });
    expect(tryResolveFactor([inactive], criteria)).toBeNull();
    const selection = resolveFactor([inactive], { ...criteria, includeInactive: true });
    expect(selection.factor.id).toBe("inactive");
  });
});

describe("resolveFactor specificity ranking", () => {
  it("prefers an organization-specific factor over country and global", () => {
    const global = baseFactor({ id: "global" });
    const country = baseFactor({ id: "country", country: "KR" });
    const org = baseFactor({ id: "org", organizationId: "org-1" });

    const selection = resolveFactor([global, country, org], criteria);
    expect(selection.factor.id).toBe("org");
    expect(selection.specificity).toBe("ORGANIZATION_SPECIFIC");
    expect(selection.runnersUp.map((f) => f.id)).toEqual(["country", "global"]);
  });

  it("prefers a supplier-specific factor over a country average", () => {
    const country = baseFactor({ id: "country", country: "KR" });
    const supplier = baseFactor({ id: "supplier", supplierId: "sup-9" });
    const selection = resolveFactor([country, supplier], {
      ...criteria,
      supplierId: "sup-9",
    });
    expect(selection.factor.id).toBe("supplier");
    expect(selection.specificity).toBe("SUPPLIER_SPECIFIC");
  });

  it("prefers country over region and region over global", () => {
    const global = baseFactor({ id: "global" });
    const region = baseFactor({ id: "region", region: "APAC" });
    const country = baseFactor({ id: "country", country: "KR" });

    expect(resolveFactor([global, region, country], criteria).factor.id).toBe("country");
    expect(resolveFactor([global, region], criteria).specificity).toBe("REGION");
    expect(resolveFactor([global], criteria).specificity).toBe("GLOBAL");
  });

  it("falls back to the region factor when no country factor is available", () => {
    const region = baseFactor({ id: "region", region: "APAC", value: 0.55 });
    const otherCountry = baseFactor({ id: "jp", country: "JP", value: 0.45 });
    const selection = resolveFactor([region, otherCountry], criteria);
    expect(selection.factor.id).toBe("region");
    expect(selection.rejected[0]).toEqual({
      factorId: "jp",
      reason: expect.stringContaining("country JP does not match KR"),
    });
  });

  it("uses the sector bonus only inside the same specificity tier", () => {
    const generic = baseFactor({ id: "generic", country: "KR" });
    const sectoral = baseFactor({ id: "sectoral", country: "KR", sector: "Manufacturing" });
    const orgWideNoSector = baseFactor({ id: "org", organizationId: "org-1" });

    expect(resolveFactor([generic, sectoral], criteria).factor.id).toBe("sectoral");
    // The sector bonus must not promote a country factor above an org factor.
    expect(resolveFactor([sectoral, orgWideNoSector], criteria).factor.id).toBe("org");
  });
});

describe("resolveFactor tie-breaking", () => {
  it("breaks a tie by the newest validFrom", () => {
    const older = baseFactor({ id: "older", country: "KR", validFrom: utc("2022-01-01"), value: 0.5 });
    const newer = baseFactor({ id: "newer", country: "KR", validFrom: utc("2024-01-01"), value: 0.4 });
    const selection = resolveFactor([older, newer], criteria);
    expect(selection.factor.id).toBe("newer");
    expect(selection.runnersUp.map((f) => f.id)).toEqual(["older"]);
  });

  it("ranks a dated factor above one with no validFrom", () => {
    const undated = baseFactor({ id: "undated", country: "KR" });
    const dated = baseFactor({ id: "dated", country: "KR", validFrom: utc("2021-01-01") });
    expect(resolveFactor([undated, dated], criteria).factor.id).toBe("dated");
  });

  it("breaks a remaining tie by data quality, then deterministically by id", () => {
    const low = baseFactor({ id: "b-low", country: "KR", validFrom: utc("2024-01-01"), dataQuality: "LOW" });
    const high = baseFactor({ id: "c-high", country: "KR", validFrom: utc("2024-01-01"), dataQuality: "HIGH" });
    expect(resolveFactor([low, high], criteria).factor.id).toBe("c-high");

    const first = baseFactor({ id: "a", country: "KR", validFrom: utc("2024-01-01") });
    const second = baseFactor({ id: "z", country: "KR", validFrom: utc("2024-01-01") });
    expect(resolveFactor([second, first], criteria).factor.id).toBe("a");
    expect(resolveFactor([first, second], criteria).factor.id).toBe("a");
  });
});

describe("resolveFactor dimension and scope filters", () => {
  it("rejects a factor whose denominator is not convertible from the activity unit", () => {
    const perLitre = baseFactor({ id: "litres", unit: "KG_CO2E_PER_LITER" });
    expect(tryResolveFactor([perLitre], criteria)).toBeNull();
    // The same factor is fine for a litre-denominated activity.
    const selection = resolveFactor([perLitre], { ...criteria, unit: "L" });
    expect(selection.factor.id).toBe("litres");
  });

  it("accepts a denominator that only needs a conversion", () => {
    const perMj = baseFactor({ id: "mj", unit: "KG_CO2E_PER_MJ" });
    expect(resolveFactor([perMj], criteria).factor.id).toBe("mj");
  });

  it("filters on scope and Scope 3 category", () => {
    const scope1 = baseFactor({ id: "s1", scope: "SCOPE_1" });
    const cat6 = baseFactor({
      id: "cat6",
      scope: "SCOPE_3",
      scope3Category: "CAT_6_BUSINESS_TRAVEL",
      unit: "KG_CO2E_PER_PKM",
    });
    const cat1 = baseFactor({
      id: "cat1",
      scope: "SCOPE_3",
      scope3Category: "CAT_1_PURCHASED_GOODS",
      unit: "KG_CO2E_PER_PKM",
    });

    expect(tryResolveFactor([scope1], criteria)).toBeNull();
    const selection = resolveFactor([cat1, cat6], {
      date: utc("2024-06-15"),
      scope: "SCOPE_3",
      scope3Category: "CAT_6_BUSINESS_TRAVEL",
      unit: "pkm",
    });
    expect(selection.factor.id).toBe("cat6");
  });

  it("filters on required source and gas", () => {
    const defra = baseFactor({ id: "defra", sourceId: "src-defra" });
    const ipcc = baseFactor({ id: "ipcc", sourceId: "src-ipcc" });
    expect(
      resolveFactor([defra, ipcc], { ...criteria, sourceId: "src-ipcc" }).factor.id,
    ).toBe("ipcc");

    const ch4 = baseFactor({ id: "ch4", gasType: "CH4" });
    expect(tryResolveFactor([ch4], { ...criteria, gasType: "N2O" })).toBeNull();
    expect(resolveFactor([ch4], { ...criteria, gasType: "CH4" }).factor.id).toBe("ch4");
  });

  it("never uses another organization's private factor", () => {
    const otherOrg = baseFactor({ id: "other", organizationId: "org-2" });
    expect(tryResolveFactor([otherOrg], criteria)).toBeNull();
  });
});

describe("resolveFactor rationale and errors", () => {
  it("returns an audit-ready rationale", () => {
    const selection = resolveFactor(
      [baseFactor({ id: "kr", country: "KR", value: 0.4594, dataQuality: "HIGH", validFrom: utc("2024-01-01") })],
      criteria,
    );
    expect(selection.selectionRationale.length).toBeGreaterThanOrEqual(4);
    expect(selection.selectionRationale[0]).toContain("Evaluated 1 candidate factor(s)");
    expect(selection.selectionRationale[1]).toContain("COUNTRY specificity");
    expect(selection.selectionRationale[3]).toContain("0.4594 KG_CO2E_PER_KWH");
    expect(selection.selectionRationale[3]).toContain("data quality HIGH");
  });

  it("throws NotFoundError when nothing matches", () => {
    expect(() => resolveFactor([], criteria)).toThrow(NotFoundError);
    expect(() => resolveFactor([], criteria)).toThrow(/No applicable emission factor/);
  });

  it("returns null from tryResolveFactor instead of throwing", () => {
    expect(tryResolveFactor([], criteria)).toBeNull();
  });
});

describe("factorDenominatorUnit", () => {
  it("maps EmissionFactorUnit members to activity units", () => {
    expect(factorDenominatorUnit(baseFactor({ id: "a", unit: "KG_CO2E_PER_TONNE" }))).toBe("t");
    expect(factorDenominatorUnit(baseFactor({ id: "b", unit: "KG_CO2E_PER_USD" }))).toBe("USD");
  });
});
