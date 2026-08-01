import { describe, expect, it } from "vitest";

import { RULE_OPERATORS, type RuleOperator } from "@/lib/core/enums";
import { CalculationError } from "@/lib/core/errors";

import {
  OPERATOR_HANDLERS,
  applyOperator,
  isNullish,
  parseList,
  parseRange,
  readField,
  toNumber,
  type RuleContextValue,
} from "./operators";

describe("operator coverage", () => {
  it("declares a handler for every RuleOperator enum member", () => {
    expect(Object.keys(OPERATOR_HANDLERS).sort()).toEqual([...RULE_OPERATORS].sort());
  });

  it("rejects an operator outside the enum", () => {
    expect(() => applyOperator("REGEX" as RuleOperator, "a", "b")).toThrow(CalculationError);
  });
});

describe("every operator, parameterised", () => {
  const cases: ReadonlyArray<{
    readonly operator: RuleOperator;
    readonly actual: RuleContextValue;
    readonly expected: string;
    readonly result: boolean;
  }> = [
    { operator: "EQUALS", actual: "SCOPE_1", expected: "SCOPE_1", result: true },
    { operator: "EQUALS", actual: "SCOPE_1", expected: "SCOPE_2", result: false },
    { operator: "NOT_EQUALS", actual: "SCOPE_1", expected: "SCOPE_2", result: true },
    { operator: "NOT_EQUALS", actual: 5, expected: "5", result: false },
    { operator: "GREATER_THAN", actual: 10, expected: "5", result: true },
    { operator: "GREATER_THAN", actual: 5, expected: "5", result: false },
    { operator: "LESS_THAN", actual: 3, expected: "5", result: true },
    { operator: "LESS_THAN", actual: 5, expected: "5", result: false },
    { operator: "GREATER_THAN_OR_EQUAL", actual: 5, expected: "5", result: true },
    { operator: "GREATER_THAN_OR_EQUAL", actual: 4.9, expected: "5", result: false },
    { operator: "LESS_THAN_OR_EQUAL", actual: 5, expected: "5", result: true },
    { operator: "LESS_THAN_OR_EQUAL", actual: 5.1, expected: "5", result: false },
    { operator: "CONTAINS", actual: "Seoul Plant 1", expected: "plant", result: true },
    { operator: "CONTAINS", actual: "Seoul Plant 1", expected: "busan", result: false },
    { operator: "NOT_CONTAINS", actual: "Seoul Plant 1", expected: "busan", result: true },
    { operator: "NOT_CONTAINS", actual: "Seoul Plant 1", expected: "seoul", result: false },
    { operator: "IN", actual: "KR", expected: "KR,JP,CN", result: true },
    { operator: "IN", actual: "US", expected: "KR,JP,CN", result: false },
    { operator: "NOT_IN", actual: "US", expected: "KR,JP,CN", result: true },
    { operator: "NOT_IN", actual: "KR", expected: "KR,JP,CN", result: false },
    { operator: "BETWEEN", actual: 50, expected: "10,100", result: true },
    { operator: "BETWEEN", actual: 150, expected: "10,100", result: false },
    { operator: "IS_NULL", actual: undefined, expected: "", result: true },
    { operator: "IS_NULL", actual: 0, expected: "", result: false },
    { operator: "IS_NOT_NULL", actual: 0, expected: "", result: true },
    { operator: "IS_NOT_NULL", actual: null, expected: "", result: false },
  ];

  it("covers all 13 operators", () => {
    expect(new Set(cases.map((c) => c.operator)).size).toBe(RULE_OPERATORS.length);
  });

  it.each(cases)(
    "$operator on $actual vs $expected is $result",
    ({ operator, actual, expected, result }) => {
      expect(applyOperator(operator, actual, expected)).toBe(result);
    },
  );
});

describe("numeric coercion", () => {
  it("coerces strings, booleans and dates", () => {
    expect(toNumber("42.5")).toBe(42.5);
    expect(toNumber(" 7 ")).toBe(7);
    expect(toNumber(true)).toBe(1);
    expect(toNumber(new Date("2024-01-01T00:00:00.000Z"))).toBe(1704067200000);
  });

  it("returns undefined for non-numeric input", () => {
    expect(toNumber("abc")).toBeUndefined();
    expect(toNumber("")).toBeUndefined();
    expect(toNumber(null)).toBeUndefined();
    expect(toNumber(Number.NaN)).toBeUndefined();
  });

  it("fails closed on ordering comparisons with non-numeric operands", () => {
    expect(applyOperator("GREATER_THAN", "abc", "5")).toBe(false);
    expect(applyOperator("LESS_THAN", 5, "abc")).toBe(false);
    expect(applyOperator("BETWEEN", "abc", "1,10")).toBe(false);
  });

  it("compares numerically when both sides are numeric strings", () => {
    expect(applyOperator("EQUALS", "0100", "100")).toBe(true);
    expect(applyOperator("GREATER_THAN", "9", "10")).toBe(false);
  });

  it("compares booleans against their text form", () => {
    expect(applyOperator("EQUALS", false, "false")).toBe(true);
    expect(applyOperator("EQUALS", true, "false")).toBe(false);
  });
});

describe("list parsing", () => {
  it("splits comma-separated lists and trims", () => {
    expect(parseList(" KR , JP ,CN ")).toEqual(["KR", "JP", "CN"]);
  });

  it("parses a JSON array", () => {
    expect(parseList('["KR", "JP"]')).toEqual(["KR", "JP"]);
    expect(parseList("[1, 2, 3]")).toEqual(["1", "2", "3"]);
  });

  it("falls back to comma splitting for malformed JSON", () => {
    expect(parseList("[KR,JP")).toEqual(["[KR", "JP"]);
  });

  it("matches list membership numerically and case-insensitively", () => {
    expect(applyOperator("IN", 2, "1,2,3")).toBe(true);
    expect(applyOperator("IN", "kr", "KR,JP")).toBe(true);
  });

  it("matches when the context value is an array", () => {
    expect(applyOperator("IN", ["JP", "US"], "KR,JP")).toBe(true);
    expect(applyOperator("NOT_IN", ["US"], "KR,JP")).toBe(true);
    expect(applyOperator("CONTAINS", ["KR", "JP"], "jp")).toBe(true);
  });
});

describe("range parsing", () => {
  it("accepts comma and dot-dot syntax", () => {
    expect(parseRange("10,100")).toEqual({ min: 10, max: 100 });
    expect(parseRange("10..100")).toEqual({ min: 10, max: 100 });
  });

  it("normalises reversed bounds", () => {
    expect(parseRange("100,10")).toEqual({ min: 10, max: 100 });
  });

  it("is inclusive at both ends", () => {
    expect(applyOperator("BETWEEN", 10, "10,100")).toBe(true);
    expect(applyOperator("BETWEEN", 100, "10,100")).toBe(true);
  });

  it("rejects malformed bounds", () => {
    expect(() => parseRange("10")).toThrow(/two bounds/);
    expect(() => parseRange("a,b")).toThrow(/numeric/);
    expect(() => applyOperator("BETWEEN", 5, "a,b")).toThrow(CalculationError);
  });
});

describe("null handling", () => {
  it("treats missing, null, undefined and empty string as null", () => {
    expect(isNullish(undefined)).toBe(true);
    expect(isNullish(null)).toBe(true);
    expect(isNullish("")).toBe(true);
    expect(isNullish(0)).toBe(false);
    expect(isNullish(false)).toBe(false);
  });

  it("ignores the stored value for IS_NULL and IS_NOT_NULL", () => {
    expect(applyOperator("IS_NULL", undefined, "anything")).toBe(true);
    expect(applyOperator("IS_NOT_NULL", "x", "anything")).toBe(true);
  });

  it("never matches CONTAINS or IN against a null value", () => {
    expect(applyOperator("CONTAINS", null, "x")).toBe(false);
    expect(applyOperator("IN", undefined, "x")).toBe(false);
    // …and the negations therefore hold.
    expect(applyOperator("NOT_CONTAINS", null, "x")).toBe(true);
    expect(applyOperator("NOT_IN", undefined, "x")).toBe(true);
  });
});

describe("readField", () => {
  const context = {
    scope: "SCOPE_1",
    "facility.country": "KR",
  };

  it("reads a flat key", () => {
    expect(readField(context, "scope")).toBe("SCOPE_1");
  });

  it("prefers an exact key over path traversal", () => {
    expect(readField(context, "facility.country")).toBe("KR");
  });

  it("traverses a dotted path into nested objects", () => {
    const nested = { facility: { country: "JP" } } as never;
    expect(readField(nested, "facility.country")).toBe("JP");
  });

  it("returns undefined for a missing key or path", () => {
    expect(readField(context, "missing")).toBeUndefined();
    expect(readField(context, "a.b.c")).toBeUndefined();
  });
});
