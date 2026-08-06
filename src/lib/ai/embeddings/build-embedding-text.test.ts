import { describe, expect, it } from "vitest";

import type { EmissionFactorLike } from "@/lib/domain/factors/types";

import { buildEmbeddingText } from "./build-embedding-text";

const BASE: EmissionFactorLike = {
  id: "ef-1",
  name: "Diesel — mobile combustion",
  value: 2.68,
  unit: "KG_CO2E_PER_LITER",
  gasType: "CO2e",
};

describe("buildEmbeddingText", () => {
  it("includes the name, gas and unit for a minimal factor", () => {
    const text = buildEmbeddingText(BASE);
    expect(text).toContain("diesel");
    expect(text).toContain("gas: co2e");
    expect(text).toContain("unit: kg_co2e_per_liter");
  });

  it("includes sector, scope, category, region and country when present", () => {
    const text = buildEmbeddingText({
      ...BASE,
      sector: "Transport",
      scope: "SCOPE_1",
      scope3Category: "CAT_4_UPSTREAM_TRANSPORT",
      region: "Asia",
      country: "KR",
    });
    expect(text).toContain("sector: transport");
    expect(text).toContain("scope: scope_1");
    expect(text).toContain("category: cat_4_upstream_transport");
    expect(text).toContain("region: asia");
    expect(text).toContain("country: kr");
  });

  it("omits fields that are null or absent, rather than printing 'null'", () => {
    const text = buildEmbeddingText(BASE);
    expect(text).not.toContain("null");
    expect(text).not.toContain("sector:");
    expect(text).not.toContain("scope:");
    expect(text).not.toContain("region:");
    expect(text).not.toContain("country:");
  });

  it("is stable and lowercased regardless of input casing", () => {
    const upper = buildEmbeddingText({ ...BASE, name: "DIESEL — Mobile Combustion" });
    const lower = buildEmbeddingText({ ...BASE, name: "diesel — mobile combustion" });
    expect(upper).toBe(lower);
  });

  it("produces two factors with the same normalised text as identical strings", () => {
    const a = buildEmbeddingText({ ...BASE, id: "ef-1" });
    const b = buildEmbeddingText({ ...BASE, id: "ef-2" });
    expect(a).toBe(b);
  });
});
