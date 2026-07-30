import { describe, expect, it } from "vitest";

import { CalculationError } from "@/lib/core/errors";

import { conversionFactor, convert, isConvertible, toCanonical } from "./convert";

describe("convert", () => {
  it("is the identity for the same unit and for aliases of it", () => {
    expect(convert(123.45, "kWh", "kWh")).toBe(123.45);
    expect(convert(123.45, "kwh", "kWh")).toBe(123.45);
    expect(convert(5, "tonne", "t")).toBe(5);
  });

  it("applies a direct table factor", () => {
    expect(convert(2, "MWh", "kWh")).toBe(2000);
    expect(convert(3, "t", "kg")).toBe(3000);
    expect(convert(1, "mi", "km")).toBeCloseTo(1.609344, 10);
    expect(convert(1, "gal", "L")).toBeCloseTo(3.785411784, 10);
  });

  it("applies an inverted table factor", () => {
    expect(convert(2000, "kWh", "MWh")).toBeCloseTo(2, 10);
    expect(convert(1.609344, "km", "mi")).toBeCloseTo(1, 10);
  });

  it("pivots through the canonical unit when no direct row exists", () => {
    // 1 MWh = 3600 MJ = 3.6 GJ; neither pair is in the table directly.
    expect(convert(1, "MWh", "GJ")).toBeCloseTo(3.6, 10);
    expect(convert(3.6, "GJ", "MWh")).toBeCloseTo(1, 10);
    expect(convert(1, "GJ", "MJ")).toBeCloseTo(1000, 10);
    expect(convert(1, "t", "lb")).toBeCloseTo(2204.62262, 5);
    expect(convert(1, "m3", "gal")).toBeCloseTo(264.172052, 5);
  });

  it("round-trips to the original value", () => {
    const pairs: ReadonlyArray<readonly [string, string]> = [
      ["MWh", "GJ"],
      ["therm", "kWh"],
      ["gal", "m3"],
      ["lb", "t"],
      ["mi", "m"],
      ["tmi", "tkm"],
      ["sqft", "sqm"],
    ];
    for (const [a, b] of pairs) {
      const original = 1234.5678;
      expect(convert(convert(original, a, b), b, a), `${a}<->${b}`).toBeCloseTo(
        original,
        8,
      );
    }
  });

  it("rejects a conversion across dimensions", () => {
    expect(() => convert(1, "L", "kWh")).toThrow(CalculationError);
    expect(() => convert(1, "kg", "km")).toThrow(/incompatible dimensions/);
  });

  it("rejects an unknown unit", () => {
    expect(() => convert(1, "smoots", "km")).toThrow(CalculationError);
    expect(() => convert(1, "km", "smoots")).toThrow(/Unknown unit/);
  });

  it("rejects a non-finite value", () => {
    expect(() => convert(Number.POSITIVE_INFINITY, "kWh", "MWh")).toThrow(
      CalculationError,
    );
  });
});

describe("conversionFactor", () => {
  it("returns the multiplier without applying it", () => {
    expect(conversionFactor("MWh", "kWh")).toBe(1000);
    expect(conversionFactor("kWh", "kWh")).toBe(1);
  });

  it("is reciprocal in both directions", () => {
    expect(conversionFactor("GJ", "kWh") * conversionFactor("kWh", "GJ")).toBeCloseTo(
      1,
      10,
    );
  });
});

describe("isConvertible", () => {
  it("reports dimension compatibility without throwing", () => {
    expect(isConvertible("MWh", "GJ")).toBe(true);
    expect(isConvertible("L", "kWh")).toBe(false);
    expect(isConvertible("nonsense", "kWh")).toBe(false);
  });
});

describe("toCanonical", () => {
  it("normalises to the dimension's canonical unit", () => {
    expect(toCanonical(2, "MWh")).toEqual({ value: 2000, unit: "kWh" });
    expect(toCanonical(1, "m3")).toEqual({ value: 1000, unit: "L" });
    expect(toCanonical(1500, "g")).toEqual({ value: 1.5, unit: "kg" });
  });
});
