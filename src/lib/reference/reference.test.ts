import { describe, expect, it } from "vitest";

import {
  GWP_VERSIONS,
  REPORTING_FRAMEWORKS,
  SCOPE3_CATEGORIES,
  CALCULATION_APPROACHES,
} from "@/lib/core/enums";
import { CalculationError } from "@/lib/core/errors";

import { FRAMEWORK_DEFINITIONS, frameworkDefinition, isReportingFramework } from "./frameworks";
import {
  GREENHOUSE_GASES,
  GWP_TABLE,
  REFRIGERANT_BLENDS,
  blendGwp,
  gwpOf,
  isGreenhouseGas,
} from "./gwp";
import {
  SCOPE3_CATEGORY_DEFINITIONS,
  downstreamCategories,
  isScope3Category,
  scope3Definition,
  upstreamCategories,
} from "./scope3-categories";
import {
  CANONICAL_UNITS,
  FACTOR_DENOMINATOR_UNIT,
  UNIT_CONVERSIONS,
  UNIT_REGISTRY,
  dimensionOf,
  findUnit,
  normalizeUnit,
} from "./units";

describe("GWP table", () => {
  it("has an entry for every declared gas, keyed consistently", () => {
    expect(Object.keys(GWP_TABLE)).toHaveLength(GREENHOUSE_GASES.length);
    for (const gas of GREENHOUSE_GASES) {
      expect(GWP_TABLE[gas].gas).toBe(gas);
    }
  });

  it("defines every GWP version for every gas as a finite non-negative number", () => {
    for (const gas of GREENHOUSE_GASES) {
      for (const version of GWP_VERSIONS) {
        const value = GWP_TABLE[gas].gwp[version];
        expect(Number.isFinite(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("anchors CO2 at 1 and biogenic CO2 at 0 in every version", () => {
    for (const version of GWP_VERSIONS) {
      expect(gwpOf("CO2", version)).toBe(1);
      expect(gwpOf("CO2_BIOGENIC", version)).toBe(0);
    }
  });

  it("uses the AR5 and AR6 methane values", () => {
    expect(gwpOf("CH4", "AR4")).toBe(25);
    expect(gwpOf("CH4", "AR5")).toBe(28);
    expect(gwpOf("CH4", "AR6")).toBe(27.9);
    expect(gwpOf("CH4_FOSSIL", "AR5")).toBe(30);
    expect(gwpOf("CH4_FOSSIL", "AR6")).toBe(29.8);
  });

  it("maps every species onto an EmissionResult gas column", () => {
    const columns = new Set(
      GREENHOUSE_GASES.map((gas) => GWP_TABLE[gas].column),
    );
    expect([...columns].sort()).toEqual([
      "ch4Emissions",
      "co2Emissions",
      "hfcEmissions",
      "n2oEmissions",
      "nf3Emissions",
      "pfcEmissions",
      "sf6Emissions",
    ]);
  });

  it("rejects an unknown gas", () => {
    expect(isGreenhouseGas("CO2")).toBe(true);
    expect(isGreenhouseGas("CO")).toBe(false);
    expect(() => gwpOf("CO" as never, "AR6")).toThrow(CalculationError);
  });
});

describe("refrigerant blends", () => {
  it("has compositions summing to 1", () => {
    for (const [blend, composition] of Object.entries(REFRIGERANT_BLENDS)) {
      const total = Object.values(composition).reduce((s, f) => s + (f ?? 0), 0);
      expect(total, blend).toBeCloseTo(1, 10);
    }
  });

  it("mass-weights R-410A across HFC-32 and HFC-125", () => {
    // AR5: 0.5 * 677 + 0.5 * 3170 = 1923.5
    expect(blendGwp("R-410A", "AR5")).toBeCloseTo(1923.5, 6);
  });

  it("rejects an unknown blend", () => {
    expect(() => blendGwp("R-999Z", "AR6")).toThrow(CalculationError);
  });
});

describe("unit registry", () => {
  it("has no duplicate canonical symbols", () => {
    const symbols = UNIT_REGISTRY.map((u) => u.unit);
    expect(new Set(symbols).size).toBe(symbols.length);
  });

  it("has no alias colliding with another unit's symbol or alias", () => {
    const seen = new Set<string>();
    for (const definition of UNIT_REGISTRY) {
      for (const key of [definition.unit, ...definition.aliases]) {
        const normalized = key.toLowerCase();
        expect(seen.has(normalized), `duplicate unit key: ${key}`).toBe(false);
        seen.add(normalized);
      }
    }
  });

  it("declares a canonical unit that exists in the registry for every dimension", () => {
    for (const [dimension, unit] of Object.entries(CANONICAL_UNITS)) {
      const definition = findUnit(unit);
      expect(definition, `${dimension} canonical unit ${unit}`).toBeDefined();
      expect(definition?.dimension).toBe(dimension);
    }
  });

  it("normalises casing, whitespace and aliases to canonical spellings", () => {
    expect(normalizeUnit("kwh")).toBe("kWh");
    expect(normalizeUnit("KWH")).toBe("kWh");
    expect(normalizeUnit(" TONNE ")).toBe("t");
    expect(normalizeUnit("m³")).toBe("m3");
    expect(normalizeUnit("m²")).toBe("sqm");
    expect(normalizeUnit("not-a-unit")).toBeUndefined();
  });

  it("resolves dimensions", () => {
    expect(dimensionOf("MWh")).toBe("ENERGY");
    expect(dimensionOf("gal")).toBe("VOLUME");
    expect(dimensionOf("lb")).toBe("MASS");
    expect(dimensionOf("nonsense")).toBeUndefined();
  });
});

describe("unit conversion table", () => {
  it("has a strictly positive finite factor on every row", () => {
    for (const row of UNIT_CONVERSIONS) {
      expect(Number.isFinite(row.factor), `${row.fromUnit}->${row.toUnit}`).toBe(true);
      expect(row.factor, `${row.fromUnit}->${row.toUnit}`).toBeGreaterThan(0);
    }
  });

  it("only references registered units, within one dimension per row", () => {
    for (const row of UNIT_CONVERSIONS) {
      const from = findUnit(row.fromUnit);
      const to = findUnit(row.toUnit);
      expect(from, row.fromUnit).toBeDefined();
      expect(to, row.toUnit).toBeDefined();
      expect(from?.dimension).toBe(row.category);
      expect(to?.dimension).toBe(row.category);
    }
  });

  it("always converts into the dimension's canonical unit", () => {
    for (const row of UNIT_CONVERSIONS) {
      expect(row.toUnit, `${row.fromUnit}->${row.toUnit}`).toBe(CANONICAL_UNITS[row.category]);
    }
  });

  it("has no duplicate from/to pair", () => {
    const keys = UNIT_CONVERSIONS.map((row) => `${row.fromUnit}->${row.toUnit}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("maps every EmissionFactorUnit denominator onto a registered unit", () => {
    for (const [factorUnit, denominator] of Object.entries(FACTOR_DENOMINATOR_UNIT)) {
      expect(findUnit(denominator), `${factorUnit} -> ${denominator}`).toBeDefined();
    }
  });
});

describe("Scope 3 category table", () => {
  it("contains every Scope3Category enum member exactly once", () => {
    const categories = SCOPE3_CATEGORY_DEFINITIONS.map((d) => d.category);
    expect(categories).toHaveLength(SCOPE3_CATEGORIES.length);
    expect(new Set(categories).size).toBe(SCOPE3_CATEGORIES.length);
    for (const category of SCOPE3_CATEGORIES) {
      expect(categories).toContain(category);
    }
  });

  it("numbers the categories 1..15 in order", () => {
    expect(SCOPE3_CATEGORY_DEFINITIONS.map((d) => d.number)).toEqual(
      Array.from({ length: 15 }, (_, index) => index + 1),
    );
  });

  it("declares a default approach that is among the supported approaches", () => {
    for (const definition of SCOPE3_CATEGORY_DEFINITIONS) {
      expect(CALCULATION_APPROACHES).toContain(definition.defaultApproach);
      expect(definition.supportedApproaches, definition.category).toContain(
        definition.defaultApproach,
      );
    }
  });

  it("declares Korean and English names plus at least one required field", () => {
    for (const definition of SCOPE3_CATEGORY_DEFINITIONS) {
      expect(definition.nameEn.length).toBeGreaterThan(0);
      expect(definition.nameKo.length).toBeGreaterThan(0);
      expect(definition.descriptionKo.length).toBeGreaterThan(0);
      expect(definition.requiredFields.length).toBeGreaterThan(0);
    }
  });

  it("splits into 8 upstream and 7 downstream categories", () => {
    expect(upstreamCategories()).toHaveLength(8);
    expect(downstreamCategories()).toHaveLength(7);
  });

  it("looks up definitions and guards unknown values", () => {
    expect(scope3Definition("CAT_6_BUSINESS_TRAVEL").number).toBe(6);
    expect(isScope3Category("CAT_1_PURCHASED_GOODS")).toBe(true);
    expect(isScope3Category("CAT_16_SOMETHING")).toBe(false);
  });
});

describe("framework table", () => {
  it("contains every ReportingFramework enum member exactly once", () => {
    const frameworks = FRAMEWORK_DEFINITIONS.map((d) => d.framework);
    expect(frameworks).toHaveLength(REPORTING_FRAMEWORKS.length);
    expect(new Set(frameworks).size).toBe(REPORTING_FRAMEWORKS.length);
    for (const framework of REPORTING_FRAMEWORKS) {
      expect(frameworks).toContain(framework);
    }
  });

  it("declares a publisher, version and at least one requirement group", () => {
    for (const definition of FRAMEWORK_DEFINITIONS) {
      expect(definition.publisher.length, definition.framework).toBeGreaterThan(0);
      expect(definition.version.length, definition.framework).toBeGreaterThan(0);
      expect(definition.requirementGroups.length, definition.framework).toBeGreaterThan(0);
    }
  });

  it("uses globally unique requirement-group codes", () => {
    const codes = FRAMEWORK_DEFINITIONS.flatMap((d) =>
      d.requirementGroups.map((g) => g.code),
    );
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("looks up definitions and guards unknown values", () => {
    expect(frameworkDefinition("ESRS").publisher).toBe("EFRAG");
    expect(isReportingFramework("CDP")).toBe(true);
    expect(isReportingFramework("NOT_A_FRAMEWORK")).toBe(false);
  });
});
