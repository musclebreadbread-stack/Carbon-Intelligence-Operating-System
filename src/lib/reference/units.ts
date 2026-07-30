/**
 * Canonical unit registry and conversion-factor table.
 *
 * Each conversion row has the same shape as the `UnitConversion` model
 * (`fromUnit` / `toUnit` / `factor` / `category`), so the table can be seeded
 * straight into the database and read back without translation.
 *
 * `factor` semantics: `value_in_toUnit = value_in_fromUnit * factor`.
 *
 * Only the edges to each dimension's canonical unit are declared; every other
 * pair is derived at runtime by inverting a factor or pivoting through the
 * canonical unit (see `src/lib/domain/units/convert.ts`). Keeping the table
 * minimal is what stops it drifting into internal inconsistency.
 *
 * Pure TypeScript — no framework, database or network imports.
 */

export const UNIT_DIMENSIONS = [
  "ENERGY",
  "VOLUME",
  "MASS",
  "DISTANCE",
  "FREIGHT",
  "PASSENGER",
  "AREA",
  "CURRENCY",
  "COUNT",
] as const;
export type UnitDimension = (typeof UNIT_DIMENSIONS)[number];

export type UnitDefinition = {
  /** Canonical symbol, matching the strings stored in `ActivityDataEntry.unit`. */
  readonly unit: string;
  readonly label: string;
  readonly dimension: UnitDimension;
  /**
   * Extra spellings accepted on input and normalised to `unit`. Lookups are
   * case-insensitive, so casing variants (`kwh`, `KWH`) never need listing.
   */
  readonly aliases: readonly string[];
};

export const UNIT_REGISTRY: readonly UnitDefinition[] = [
  // Energy — canonical kWh
  { unit: "kWh", label: "Kilowatt hour", dimension: "ENERGY", aliases: [] },
  { unit: "MWh", label: "Megawatt hour", dimension: "ENERGY", aliases: [] },
  { unit: "GWh", label: "Gigawatt hour", dimension: "ENERGY", aliases: [] },
  { unit: "GJ", label: "Gigajoule", dimension: "ENERGY", aliases: [] },
  { unit: "MJ", label: "Megajoule", dimension: "ENERGY", aliases: [] },
  { unit: "TJ", label: "Terajoule", dimension: "ENERGY", aliases: [] },
  { unit: "therm", label: "Therm", dimension: "ENERGY", aliases: ["therms", "thm"] },
  // Volume — canonical L
  { unit: "L", label: "Litre", dimension: "VOLUME", aliases: ["liter", "litre", "ltr"] },
  { unit: "m3", label: "Cubic metre", dimension: "VOLUME", aliases: ["m³", "cbm"] },
  { unit: "gal", label: "US gallon", dimension: "VOLUME", aliases: ["gallon", "usgal"] },
  { unit: "kL", label: "Kilolitre", dimension: "VOLUME", aliases: ["kilolitre"] },
  // Mass — canonical kg
  { unit: "kg", label: "Kilogram", dimension: "MASS", aliases: ["kgs"] },
  { unit: "t", label: "Metric tonne", dimension: "MASS", aliases: ["tonne", "tonnes", "MT"] },
  { unit: "g", label: "Gram", dimension: "MASS", aliases: ["gram", "grams"] },
  { unit: "lb", label: "Pound", dimension: "MASS", aliases: ["lbs", "pound", "pounds"] },
  // Distance — canonical km
  { unit: "km", label: "Kilometre", dimension: "DISTANCE", aliases: ["kilometre", "kilometer"] },
  { unit: "m", label: "Metre", dimension: "DISTANCE", aliases: ["metre", "meter"] },
  { unit: "mi", label: "Mile", dimension: "DISTANCE", aliases: ["mile", "miles"] },
  // Freight / passenger activity — canonical tkm / pkm
  { unit: "tkm", label: "Tonne-kilometre", dimension: "FREIGHT", aliases: ["t.km", "tonne-km"] },
  { unit: "tmi", label: "Tonne-mile", dimension: "FREIGHT", aliases: ["tonne-mile"] },
  { unit: "pkm", label: "Passenger-kilometre", dimension: "PASSENGER", aliases: ["p.km", "passenger-km"] },
  { unit: "pmi", label: "Passenger-mile", dimension: "PASSENGER", aliases: ["passenger-mile"] },
  // Area — canonical sqm
  { unit: "sqm", label: "Square metre", dimension: "AREA", aliases: ["m2", "m²"] },
  { unit: "sqft", label: "Square foot", dimension: "AREA", aliases: ["ft2", "ft²"] },
  // Spend / count
  { unit: "USD", label: "US dollar", dimension: "CURRENCY", aliases: ["$"] },
  { unit: "unit", label: "Unit", dimension: "COUNT", aliases: ["units", "ea", "each", "pcs"] },
];

/** The unit every other unit in a dimension converts through. */
export const CANONICAL_UNITS: Readonly<Record<UnitDimension, string>> = {
  ENERGY: "kWh",
  VOLUME: "L",
  MASS: "kg",
  DISTANCE: "km",
  FREIGHT: "tkm",
  PASSENGER: "pkm",
  AREA: "sqm",
  CURRENCY: "USD",
  COUNT: "unit",
};

export type UnitConversionRow = {
  readonly fromUnit: string;
  readonly toUnit: string;
  readonly factor: number;
  readonly category: UnitDimension;
  readonly description?: string;
};

export const UNIT_CONVERSIONS: readonly UnitConversionRow[] = [
  // Energy → kWh
  { fromUnit: "MWh", toUnit: "kWh", factor: 1000, category: "ENERGY" },
  { fromUnit: "GWh", toUnit: "kWh", factor: 1_000_000, category: "ENERGY" },
  { fromUnit: "GJ", toUnit: "kWh", factor: 1000 / 3.6, category: "ENERGY", description: "1 GJ = 277.7778 kWh" },
  { fromUnit: "MJ", toUnit: "kWh", factor: 1 / 3.6, category: "ENERGY" },
  { fromUnit: "TJ", toUnit: "kWh", factor: 1_000_000 / 3.6, category: "ENERGY" },
  { fromUnit: "therm", toUnit: "kWh", factor: 29.3071, category: "ENERGY", description: "1 therm = 105.5 MJ" },
  // Volume → L
  { fromUnit: "m3", toUnit: "L", factor: 1000, category: "VOLUME" },
  { fromUnit: "kL", toUnit: "L", factor: 1000, category: "VOLUME" },
  { fromUnit: "gal", toUnit: "L", factor: 3.785411784, category: "VOLUME", description: "US liquid gallon" },
  // Mass → kg
  { fromUnit: "t", toUnit: "kg", factor: 1000, category: "MASS" },
  { fromUnit: "g", toUnit: "kg", factor: 0.001, category: "MASS" },
  { fromUnit: "lb", toUnit: "kg", factor: 0.45359237, category: "MASS", description: "International avoirdupois pound" },
  // Distance → km
  { fromUnit: "m", toUnit: "km", factor: 0.001, category: "DISTANCE" },
  { fromUnit: "mi", toUnit: "km", factor: 1.609344, category: "DISTANCE", description: "International mile" },
  // Freight / passenger
  { fromUnit: "tmi", toUnit: "tkm", factor: 1.609344, category: "FREIGHT" },
  { fromUnit: "pmi", toUnit: "pkm", factor: 1.609344, category: "PASSENGER" },
  // Area
  { fromUnit: "sqft", toUnit: "sqm", factor: 0.09290304, category: "AREA" },
];

const UNIT_LOOKUP: Map<string, UnitDefinition> = (() => {
  const map = new Map<string, UnitDefinition>();
  for (const definition of UNIT_REGISTRY) {
    map.set(definition.unit.toLowerCase(), definition);
    for (const alias of definition.aliases) {
      map.set(alias.toLowerCase(), definition);
    }
  }
  return map;
})();

/** Resolves a unit symbol or alias to its registry entry, or `undefined`. */
export function findUnit(unit: string): UnitDefinition | undefined {
  return UNIT_LOOKUP.get(unit.trim().toLowerCase());
}

/** Normalises an input symbol to its canonical spelling, e.g. `kwh` → `kWh`. */
export function normalizeUnit(unit: string): string | undefined {
  return findUnit(unit)?.unit;
}

export function dimensionOf(unit: string): UnitDimension | undefined {
  return findUnit(unit)?.dimension;
}

/** Denominator unit implied by each `EmissionFactorUnit` enum member. */
export const FACTOR_DENOMINATOR_UNIT: Readonly<Record<string, string>> = {
  KG_CO2E_PER_KWH: "kWh",
  KG_CO2E_PER_LITER: "L",
  KG_CO2E_PER_KG: "kg",
  KG_CO2E_PER_TONNE: "t",
  KG_CO2E_PER_M3: "m3",
  KG_CO2E_PER_TKM: "tkm",
  KG_CO2E_PER_PKM: "pkm",
  KG_CO2E_PER_UNIT: "unit",
  KG_CO2E_PER_USD: "USD",
  KG_CO2E_PER_MJ: "MJ",
};
