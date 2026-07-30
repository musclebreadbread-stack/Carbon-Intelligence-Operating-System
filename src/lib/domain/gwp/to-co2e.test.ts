import { describe, expect, it } from "vitest";

import { CalculationError } from "@/lib/core/errors";

import { co2eOnly, gasesToCo2e, mergeCo2e } from "./to-co2e";

describe("gasesToCo2e", () => {
  it("returns zeros for an empty breakdown", () => {
    const result = gasesToCo2e({}, "AR6");
    expect(result.totalCO2e).toBe(0);
    expect(result.biogenicCO2).toBe(0);
    expect(result.byGas).toEqual([]);
  });

  it("uses the AR5 methane GWP of 28 and the AR6 value of 27.9", () => {
    expect(gasesToCo2e({ CH4: 10 }, "AR5").totalCO2e).toBeCloseTo(280, 10);
    expect(gasesToCo2e({ CH4: 10 }, "AR6").totalCO2e).toBeCloseTo(279, 10);
    expect(gasesToCo2e({ CH4: 10 }, "AR4").totalCO2e).toBeCloseTo(250, 10);
  });

  it("differentiates fossil from non-fossil methane in AR6", () => {
    expect(gasesToCo2e({ CH4_FOSSIL: 1 }, "AR6").totalCO2e).toBeCloseTo(29.8, 10);
    expect(gasesToCo2e({ CH4_BIOGENIC: 1 }, "AR6").totalCO2e).toBeCloseTo(27, 10);
  });

  it("sums a multi-gas combustion breakdown", () => {
    // AR6: 1000*1 + 0.05*29.8 + 0.01*273 = 1000 + 1.49 + 2.73 = 1004.22
    const result = gasesToCo2e({ CO2: 1000, CH4_FOSSIL: 0.05, N2O: 0.01 }, "AR6");
    expect(result.totalCO2e).toBeCloseTo(1004.22, 8);
    expect(result.byGas).toHaveLength(3);
  });

  it("tracks biogenic CO2 separately and excludes it from the total", () => {
    const result = gasesToCo2e({ CO2: 100, CO2_BIOGENIC: 40 }, "AR6");
    expect(result.totalCO2e).toBeCloseTo(100, 10);
    expect(result.biogenicCO2).toBeCloseTo(40, 10);
    expect(result.byColumn.co2Emissions).toBeCloseTo(100, 10);
  });

  it("rolls contributions onto the EmissionResult gas columns", () => {
    const result = gasesToCo2e(
      { CO2: 10, CH4: 1, N2O: 1, HFC_134A: 0.001, PFC_14: 0.001, SF6: 0.0001, NF3: 0.0001 },
      "AR5",
    );
    expect(result.byColumn.co2Emissions).toBeCloseTo(10, 10);
    expect(result.byColumn.ch4Emissions).toBeCloseTo(28, 10);
    expect(result.byColumn.n2oEmissions).toBeCloseTo(265, 10);
    expect(result.byColumn.hfcEmissions).toBeCloseTo(1.3, 10);
    expect(result.byColumn.pfcEmissions).toBeCloseTo(6.63, 10);
    expect(result.byColumn.sf6Emissions).toBeCloseTo(2.35, 10);
    expect(result.byColumn.nf3Emissions).toBeCloseTo(1.61, 10);
    // The columns must reconstruct the total exactly.
    const columnSum = Object.values(result.byColumn).reduce((a, b) => a + b, 0);
    expect(columnSum).toBeCloseTo(result.totalCO2e, 8);
  });

  it("aggregates several species into one HFC column", () => {
    // R-410A split: 0.5 kg HFC-32 + 0.5 kg HFC-125 at AR5 → 1923.5
    const result = gasesToCo2e({ HFC_32: 0.5, HFC_125: 0.5 }, "AR5");
    expect(result.byColumn.hfcEmissions).toBeCloseTo(1923.5, 8);
    expect(result.byGas.map((g) => g.column)).toEqual(["hfcEmissions", "hfcEmissions"]);
  });

  it("rejects an unknown gas key and a non-finite mass", () => {
    expect(() => gasesToCo2e({ CO: 1 } as never, "AR6")).toThrow(CalculationError);
    expect(() => gasesToCo2e({ CO2: Number.NaN }, "AR6")).toThrow(/Non-finite/);
  });
});

describe("mergeCo2e", () => {
  it("adds totals, biogenic CO2 and columns", () => {
    const a = gasesToCo2e({ CO2: 100, CO2_BIOGENIC: 5 }, "AR6");
    const b = gasesToCo2e({ CH4_FOSSIL: 1 }, "AR6");
    const merged = mergeCo2e(a, b);
    expect(merged.totalCO2e).toBeCloseTo(129.8, 8);
    expect(merged.biogenicCO2).toBeCloseTo(5, 10);
    expect(merged.byGas).toHaveLength(3);
    expect(merged.byColumn.ch4Emissions).toBeCloseTo(29.8, 8);
  });

  it("refuses to mix GWP versions", () => {
    const a = gasesToCo2e({ CO2: 1 }, "AR5");
    const b = gasesToCo2e({ CO2: 1 }, "AR6");
    expect(() => mergeCo2e(a, b)).toThrow(CalculationError);
  });
});

describe("co2eOnly", () => {
  it("passes a pre-aggregated CO2e value straight through", () => {
    const result = co2eOnly(42.5, "AR6");
    expect(result.totalCO2e).toBe(42.5);
    expect(result.byColumn.co2Emissions).toBe(42.5);
  });
});
