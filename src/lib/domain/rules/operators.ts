/**
 * Rule operators.
 *
 * `RuleCondition.value` is a `String` column, so every comparison starts from
 * text. Coercion is therefore explicit and documented:
 *
 *  - numeric operators coerce both sides to numbers and fail closed (return
 *    `false`) if either side is not numeric
 *  - `IN` / `NOT_IN` split the stored value on commas, trimming each item, and
 *    also accept a JSON array
 *  - `BETWEEN` accepts `"min,max"` or `"min..max"`, inclusive at both ends
 *  - `CONTAINS` / `NOT_CONTAINS` are case-insensitive substring tests, and also
 *    match membership when the context value is an array
 *  - `IS_NULL` / `IS_NOT_NULL` treat a missing key, `null`, `undefined` and the
 *    empty string as null, and ignore the stored value entirely
 *
 * Pure TypeScript — no framework, database or network imports.
 */

import type { RuleOperator } from "@/lib/core/enums";
import { CalculationError } from "@/lib/core/errors";

/** Values a rule can be evaluated against. */
export type RuleContextValue =
  | string
  | number
  | boolean
  | Date
  | null
  | undefined
  | readonly (string | number)[];

export type RuleContext = Readonly<Record<string, RuleContextValue>>;

/** Reads a possibly dotted path out of the context. */
export function readField(context: RuleContext, field: string): RuleContextValue {
  if (Object.prototype.hasOwnProperty.call(context, field)) {
    return context[field];
  }
  if (!field.includes(".")) return undefined;

  let current: unknown = context;
  for (const segment of field.split(".")) {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current as RuleContextValue;
}

export function isNullish(value: RuleContextValue): boolean {
  return value === null || value === undefined || value === "";
}

/** Numeric coercion; returns `undefined` when the value is not numeric. */
export function toNumber(value: RuleContextValue): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return undefined;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function toComparableString(value: RuleContextValue): string {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.join(",");
  return String(value);
}

/** Parses a stored list value: a JSON array, or a comma-separated list. */
export function parseList(value: string): string[] {
  const trimmed = value.trim();
  if (trimmed.startsWith("[")) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed.map((item) => String(item).trim());
    } catch {
      // Fall through to comma splitting; a malformed JSON array is treated as text.
    }
  }
  return trimmed
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

/** Parses a `BETWEEN` bound pair from `"min,max"` or `"min..max"`. */
export function parseRange(value: string): { readonly min: number; readonly max: number } {
  const parts = value.includes("..") ? value.split("..") : value.split(",");
  if (parts.length !== 2) {
    throw new CalculationError(
      `BETWEEN requires two bounds, received "${value}"`,
      { value },
    );
  }
  const min = toNumber(parts[0]);
  const max = toNumber(parts[1]);
  if (min === undefined || max === undefined) {
    throw new CalculationError(`BETWEEN bounds must be numeric, received "${value}"`, {
      value,
    });
  }
  return min <= max ? { min, max } : { min: max, max: min };
}

/** Loose equality across the string/number/boolean/Date representations. */
function looseEquals(actual: RuleContextValue, expected: string): boolean {
  if (isNullish(actual)) return expected === "" || expected.toLowerCase() === "null";

  const actualNumber = toNumber(actual);
  const expectedNumber = toNumber(expected);
  if (actualNumber !== undefined && expectedNumber !== undefined) {
    return actualNumber === expectedNumber;
  }
  if (typeof actual === "boolean") {
    return actual === (expected.trim().toLowerCase() === "true");
  }
  return toComparableString(actual).trim().toLowerCase() === expected.trim().toLowerCase();
}

function compareNumeric(
  actual: RuleContextValue,
  expected: string,
  compare: (a: number, b: number) => boolean,
): boolean {
  const a = toNumber(actual);
  const b = toNumber(expected);
  // Fail closed: a non-numeric side never satisfies an ordering comparison.
  if (a === undefined || b === undefined) return false;
  return compare(a, b);
}

function containsValue(actual: RuleContextValue, expected: string): boolean {
  if (isNullish(actual)) return false;
  const needle = expected.trim().toLowerCase();
  if (Array.isArray(actual)) {
    return actual.some((item) => String(item).trim().toLowerCase() === needle);
  }
  return toComparableString(actual).toLowerCase().includes(needle);
}

function inList(actual: RuleContextValue, expected: string): boolean {
  if (isNullish(actual)) return false;
  const list = parseList(expected).map((item) => item.toLowerCase());
  if (Array.isArray(actual)) {
    return actual.some((item) => list.includes(String(item).trim().toLowerCase()));
  }
  const actualNumber = toNumber(actual);
  if (actualNumber !== undefined) {
    return list.some((item) => toNumber(item) === actualNumber);
  }
  return list.includes(toComparableString(actual).trim().toLowerCase());
}

export type OperatorHandler = (actual: RuleContextValue, expected: string) => boolean;

/** One handler per `RuleOperator` enum member. */
export const OPERATOR_HANDLERS: Readonly<Record<RuleOperator, OperatorHandler>> = {
  EQUALS: (actual, expected) => looseEquals(actual, expected),
  NOT_EQUALS: (actual, expected) => !looseEquals(actual, expected),
  GREATER_THAN: (actual, expected) => compareNumeric(actual, expected, (a, b) => a > b),
  LESS_THAN: (actual, expected) => compareNumeric(actual, expected, (a, b) => a < b),
  GREATER_THAN_OR_EQUAL: (actual, expected) =>
    compareNumeric(actual, expected, (a, b) => a >= b),
  LESS_THAN_OR_EQUAL: (actual, expected) =>
    compareNumeric(actual, expected, (a, b) => a <= b),
  CONTAINS: (actual, expected) => containsValue(actual, expected),
  NOT_CONTAINS: (actual, expected) => !containsValue(actual, expected),
  IN: (actual, expected) => inList(actual, expected),
  NOT_IN: (actual, expected) => !inList(actual, expected),
  BETWEEN: (actual, expected) => {
    const value = toNumber(actual);
    if (value === undefined) return false;
    const { min, max } = parseRange(expected);
    return value >= min && value <= max;
  },
  IS_NULL: (actual) => isNullish(actual),
  IS_NOT_NULL: (actual) => !isNullish(actual),
};

/** Applies one operator. Throws only for an operator that is not in the enum. */
export function applyOperator(
  operator: RuleOperator,
  actual: RuleContextValue,
  expected: string,
): boolean {
  const handler = OPERATOR_HANDLERS[operator];
  if (!handler) {
    throw new CalculationError(`Unsupported rule operator: ${operator}`, { operator });
  }
  return handler(actual, expected);
}
