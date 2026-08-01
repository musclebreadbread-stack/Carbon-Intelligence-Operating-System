import { describe, expect, it } from "vitest";

import { CalculationError } from "@/lib/core/errors";

import {
  calculateLocationBased,
  calculateMarketBased,
  calculateScope2DualReporting,
  scope2Totals,
  type ContractualInstrument,
} from "./scope2";
import type { ActivityFactorSet } from "./types";

const gridFactor: ActivityFactorSet = {
  denominatorUnit: "kWh",
  co2eKgPerUnit: 0.4,
  factorId: "ef-grid-kr",
  uncertainty: 0.03,
};

const residualMixFactor: ActivityFactorSet = {
  denominatorUnit: "kWh",
  co2eKgPerUnit: 0.5,
  factorId: "ef-residual-kr",
};

const rec = (quantity: number, unit = "kWh", id = "rec-1"): ContractualInstrument => ({
  id,
  type: "REC",
  quantity,
  unit,
  co2eKgPerUnit: 0,
});

describe("calculateLocationBased", () => {
  it("multiplies consumption by the grid average factor", () => {
    // 1,000,000 kWh × 0.4 kg/kWh = 400,000 kg = 400 tCO2e
    const result = calculateLocationBased({
      quantity: 1_000_000,
      unit: "kWh",
      gridFactor,
      gwpVersion: "AR6",
    });
    expect(result.scope).toBe("SCOPE_2_LOCATION");
    expect(result.method).toBe("location-based");
    expect(result.gases.totalCO2e).toBeCloseTo(400, 9);
    expect(result.factorId).toBe("ef-grid-kr");
    expect(result.trace.length).toBeGreaterThan(0);
  });

  it("normalises MWh consumption to the factor denominator", () => {
    const result = calculateLocationBased({
      quantity: 1000,
      unit: "MWh",
      gridFactor,
      gwpVersion: "AR6",
    });
    expect(result.gases.totalCO2e).toBeCloseTo(400, 9);
  });
});

describe("calculateMarketBased instrument hierarchy", () => {
  it("uses a supplier-specific rate ahead of certificates and the residual mix", () => {
    // 1,000,000 kWh × 0.1 kg/kWh = 100 tCO2e
    const result = calculateMarketBased({
      quantity: 1_000_000,
      unit: "kWh",
      gwpVersion: "AR6",
      supplierFactor: { denominatorUnit: "kWh", co2eKgPerUnit: 0.1, factorId: "ef-supplier" },
      instruments: [rec(1_000_000)],
      residualMixFactor,
    });
    expect(result.method).toBe("market-based-supplier-specific");
    expect(result.gases.totalCO2e).toBeCloseTo(100, 9);
    expect(result.trace[0].inputs.hierarchyStep).toBe(1);
    // Certificates are not double-counted on top of a supplier rate.
    expect(result.instrumentCoverage).toBe(0);
  });

  it("charges 100 % REC coverage at zero market-based emissions", () => {
    const result = calculateMarketBased({
      quantity: 1_000_000,
      unit: "kWh",
      gwpVersion: "AR6",
      instruments: [rec(1_000_000)],
      residualMixFactor,
    });
    expect(result.gases.totalCO2e).toBe(0);
    expect(result.instrumentCoverage).toBeCloseTo(1, 12);
    expect(result.uncoveredQuantity).toBe(0);
  });

  it("clamps over-procurement at zero instead of producing negative emissions", () => {
    const result = calculateMarketBased({
      quantity: 1_000_000,
      unit: "kWh",
      gwpVersion: "AR6",
      instruments: [rec(2_500_000)],
      residualMixFactor,
    });
    expect(result.gases.totalCO2e).toBe(0);
    expect(result.instrumentCoverage).toBeCloseTo(1, 12);
    const step = result.trace.find((s) => s.stepName.includes("apply REC"));
    expect(step?.inputs.surplus).toBeCloseTo(1_500_000, 6);
    expect(step?.notes).toMatch(/cannot create negative emissions/);
  });

  it("charges the uncovered remainder at the residual mix", () => {
    // 600,000 kWh covered by RECs; 400,000 kWh × 0.5 = 200,000 kg = 200 tCO2e
    const result = calculateMarketBased({
      quantity: 1_000_000,
      unit: "kWh",
      gwpVersion: "AR6",
      instruments: [rec(600_000)],
      residualMixFactor,
    });
    expect(result.gases.totalCO2e).toBeCloseTo(200, 9);
    expect(result.instrumentCoverage).toBeCloseTo(0.6, 12);
    expect(result.uncoveredQuantity).toBeCloseTo(400_000, 6);
    expect(result.usedGridFallback).toBe(false);
  });

  it("applies several instruments in order until consumption is covered", () => {
    const result = calculateMarketBased({
      quantity: 1_000_000,
      unit: "kWh",
      gwpVersion: "AR6",
      instruments: [rec(400_000, "kWh", "rec-a"), rec(400_000, "kWh", "rec-b"), rec(400_000, "kWh", "rec-c")],
      residualMixFactor,
    });
    expect(result.gases.totalCO2e).toBe(0);
    const applied = result.trace
      .filter((s) => s.stepName.includes("apply REC"))
      .map((s) => s.inputs.applied);
    expect(applied).toEqual([400_000, 400_000, 200_000]);
  });

  it("rebases an instrument's volume and rate when its unit differs", () => {
    // 600 MWh of a 0.05 kg/MWh green tariff against 1,000,000 kWh of load:
    // 600,000 kWh covered at 0.00005 kg/kWh = 30 kg; remainder 400,000 × 0.5 = 200,000 kg
    const result = calculateMarketBased({
      quantity: 1_000_000,
      unit: "kWh",
      gwpVersion: "AR6",
      instruments: [
        { id: "tariff-1", type: "GREEN_TARIFF", quantity: 600, unit: "MWh", co2eKgPerUnit: 0.05 },
      ],
      residualMixFactor,
    });
    expect(result.instrumentCoverage).toBeCloseTo(0.6, 12);
    expect(result.gases.totalCO2e).toBeCloseTo(200.03, 9);
  });

  it("falls back to the grid average when no residual mix exists, and flags it", () => {
    const result = calculateMarketBased({
      quantity: 1_000_000,
      unit: "kWh",
      gwpVersion: "AR6",
      instruments: [rec(600_000)],
      gridFactor,
    });
    // 400,000 kWh × 0.4 = 160,000 kg = 160 tCO2e
    expect(result.gases.totalCO2e).toBeCloseTo(160, 9);
    expect(result.usedGridFallback).toBe(true);
    const fallback = result.trace.find((s) => s.stepName.endsWith("residual-mix fallback"));
    expect(fallback?.output).toBeCloseTo(160_000, 6);
    expect(fallback?.notes).toMatch(/must be disclosed/);
  });

  it("requires a residual mix or grid factor for uncovered consumption", () => {
    expect(() =>
      calculateMarketBased({ quantity: 1000, unit: "kWh", gwpVersion: "AR6" }),
    ).toThrow(CalculationError);
  });

  it("rejects negative consumption and negative instrument volumes", () => {
    expect(() =>
      calculateMarketBased({ quantity: -1, unit: "kWh", gwpVersion: "AR6", residualMixFactor }),
    ).toThrow(/non-negative/);
    expect(() =>
      calculateMarketBased({
        quantity: 1000,
        unit: "kWh",
        gwpVersion: "AR6",
        instruments: [rec(-5)],
        residualMixFactor,
      }),
    ).toThrow(/cannot be negative/);
  });
});

describe("calculateScope2DualReporting", () => {
  it("reports different location-based and market-based figures for a REC-covered site", () => {
    const result = calculateScope2DualReporting({
      quantity: 1_000_000,
      unit: "kWh",
      gridFactor,
      residualMixFactor,
      instruments: [rec(600_000)],
      gwpVersion: "AR6",
    });

    expect(result.locationBased.gases.totalCO2e).toBeCloseTo(400, 9);
    expect(result.marketBased.gases.totalCO2e).toBeCloseTo(200, 9);
    expect(result.locationBased.gases.totalCO2e).not.toBeCloseTo(
      result.marketBased.gases.totalCO2e,
      6,
    );
    expect(result.marketVsLocationDelta).toBeCloseTo(-200, 9);
    expect(result.locationBased.scope).toBe("SCOPE_2_LOCATION");
    expect(result.marketBased.scope).toBe("SCOPE_2_MARKET");
  });

  it("can report a market-based figure above the location-based one", () => {
    // No certificates: the whole load is charged at the dirtier residual mix.
    const result = calculateScope2DualReporting({
      quantity: 1_000_000,
      unit: "kWh",
      gridFactor,
      residualMixFactor,
      gwpVersion: "AR6",
    });
    expect(result.marketVsLocationDelta).toBeCloseTo(100, 9);
  });

  it("merges both traces and appends a dual-reporting step", () => {
    const result = calculateScope2DualReporting({
      quantity: 1000,
      unit: "kWh",
      gridFactor,
      residualMixFactor,
      gwpVersion: "AR6",
    });
    expect(result.trace.some((s) => s.stepName.startsWith("Location-based:"))).toBe(true);
    expect(result.trace.some((s) => s.stepName.startsWith("Market-based:"))).toBe(true);
    const last = result.trace[result.trace.length - 1];
    expect(last.stepName).toBe("Scope 2 dual reporting");
    expect(last.notes).toMatch(/both figures to be disclosed/);
    result.trace.forEach((step, index) => expect(step.orderIndex).toBe(index));
  });

  it("exposes both totals for disclosure", () => {
    const result = calculateScope2DualReporting({
      quantity: 1_000_000,
      unit: "kWh",
      gridFactor,
      residualMixFactor,
      instruments: [rec(1_000_000)],
      gwpVersion: "AR6",
    });
    expect(scope2Totals(result)).toEqual({
      locationBased: 400,
      marketBased: 0,
      unit: "tCO2e",
    });
  });
});
