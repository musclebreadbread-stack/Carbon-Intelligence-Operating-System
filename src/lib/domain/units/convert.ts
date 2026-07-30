/**
 * Unit conversion.
 *
 * Resolution order:
 *  1. identity (same canonical unit)
 *  2. direct factor from the conversion table
 *  3. inverse of a direct factor
 *  4. one hop through the dimension's canonical unit
 *
 * Conversions across dimensions (e.g. litres → kWh) are rejected: they require a
 * fuel-specific net calorific value, which belongs to the emission factor, not
 * to a generic unit table.
 *
 * Pure TypeScript — no framework, database or network imports.
 */

import { CalculationError } from "@/lib/core/errors";
import {
  CANONICAL_UNITS,
  UNIT_CONVERSIONS,
  findUnit,
  type UnitDefinition,
} from "@/lib/reference/units";

const DIRECT_FACTORS: Map<string, number> = new Map(
  UNIT_CONVERSIONS.map((row) => [`${row.fromUnit}\u0000${row.toUnit}`, row.factor]),
);

function directFactor(from: string, to: string): number | undefined {
  return DIRECT_FACTORS.get(`${from}\u0000${to}`);
}

function resolveDefinition(unit: string, role: "from" | "to"): UnitDefinition {
  const definition = findUnit(unit);
  if (!definition) {
    throw new CalculationError(`Unknown unit '${unit}' (${role})`, { unit, role });
  }
  return definition;
}

/** Multiplier `m` such that `value_in_to = value_in_from * m`. */
export function conversionFactor(from: string, to: string): number {
  const fromDef = resolveDefinition(from, "from");
  const toDef = resolveDefinition(to, "to");

  if (fromDef.dimension !== toDef.dimension) {
    throw new CalculationError(
      `Cannot convert ${fromDef.unit} (${fromDef.dimension}) to ${toDef.unit} (${toDef.dimension}): incompatible dimensions`,
      {
        fromUnit: fromDef.unit,
        toUnit: toDef.unit,
        fromDimension: fromDef.dimension,
        toDimension: toDef.dimension,
      },
    );
  }

  if (fromDef.unit === toDef.unit) return 1;

  const direct = directFactor(fromDef.unit, toDef.unit);
  if (direct !== undefined) return direct;

  const inverse = directFactor(toDef.unit, fromDef.unit);
  if (inverse !== undefined) return 1 / inverse;

  // Pivot through the canonical unit of the shared dimension.
  const canonical = CANONICAL_UNITS[fromDef.dimension];
  const toCanonical =
    fromDef.unit === canonical ? 1 : directFactor(fromDef.unit, canonical);
  const canonicalToTarget =
    toDef.unit === canonical ? 1 : directFactor(toDef.unit, canonical);

  if (toCanonical === undefined || canonicalToTarget === undefined) {
    throw new CalculationError(
      `No conversion path from ${fromDef.unit} to ${toDef.unit}`,
      { fromUnit: fromDef.unit, toUnit: toDef.unit, pivot: canonical },
    );
  }

  return toCanonical / canonicalToTarget;
}

/** Converts `value` from one unit to another within the same dimension. */
export function convert(value: number, from: string, to: string): number {
  if (!Number.isFinite(value)) {
    throw new CalculationError("Cannot convert a non-finite value", { value, from, to });
  }
  return value * conversionFactor(from, to);
}

/** True when both units are known and share a dimension. */
export function isConvertible(from: string, to: string): boolean {
  const fromDef = findUnit(from);
  const toDef = findUnit(to);
  return Boolean(fromDef && toDef && fromDef.dimension === toDef.dimension);
}

/** Converts `value` into the canonical unit of its dimension. */
export function toCanonical(
  value: number,
  from: string,
): { readonly value: number; readonly unit: string } {
  const definition = resolveDefinition(from, "from");
  const canonical = CANONICAL_UNITS[definition.dimension];
  return { value: convert(value, definition.unit, canonical), unit: canonical };
}
