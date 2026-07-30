import { describe, expect, it } from "vitest";

import { CalculationError } from "@/lib/core/errors";

import {
  calculateFugitiveEmissions,
  calculateMobileCombustion,
  calculateProcessEmissions,
  calculateStationaryCombustion,
} from "./scope1";
import type { EmissionComputation } from "./types";

describe("calculateStationaryCombustion", () => {
  const naturalGas = {
    denominatorUnit: "m3",
    perGasKg: { CO2: 2.0, CH4_FOSSIL: 0.0001, N2O: 0.00001 },
    factorId: "ef-natgas",
    uncertainty: 0.05,
  } as const;

  it("multiplies fuel by the per-gas factors and applies GWP", () => {
    // 1000 m3 × (2.0 kg CO2 + 0.0001 kg CH4 + 0.00001 kg N2O)
    // = 2000 kg CO2e + 0.1 kg CH4 × 29.8 + 0.01 kg N2O × 273
    // = 2000 + 2.98 + 2.73 = 2005.71 kg = 2.00571 tCO2e
    const result = calculateStationaryCombustion({
      quantity: 1000,
      unit: "m3",
      factors: naturalGas,
      gwpVersion: "AR6",
      fuelName: "Natural gas",
    });

    expect(result.scope).toBe("SCOPE_1");
    expect(result.method).toBe("stationary-combustion");
    expect(result.gases.co2Emissions).toBeCloseTo(2.0, 9);
    expect(result.gases.ch4Emissions).toBeCloseTo(0.00298, 9);
    expect(result.gases.n2oEmissions).toBeCloseTo(0.00273, 9);
    expect(result.gases.totalCO2e).toBeCloseTo(2.00571, 9);
    expect(result.gases.unit).toBe("tCO2e");
    expect(result.factorId).toBe("ef-natgas");
    expect(result.factorUncertainty).toBe(0.05);
  });

  it("normalises the activity unit before applying the factor", () => {
    // 1,000,000 L = 1000 m3, so the answer must match the previous case.
    const result = calculateStationaryCombustion({
      quantity: 1_000_000,
      unit: "L",
      factors: naturalGas,
      gwpVersion: "AR6",
    });
    expect(result.gases.totalCO2e).toBeCloseTo(2.00571, 9);
    expect(result.trace[0].stepName).toContain("normalise activity unit");
    expect(result.trace[0].output).toBeCloseTo(1000, 9);
    expect(result.trace[0].unit).toBe("m3");
  });

  it("changes the answer with the GWP vintage", () => {
    const ar4 = calculateStationaryCombustion({
      quantity: 1000,
      unit: "m3",
      factors: naturalGas,
      gwpVersion: "AR4",
    });
    // AR4: 2000 + 0.1 × 25 + 0.01 × 298 = 2000 + 2.5 + 2.98 = 2005.48 kg
    expect(ar4.gases.totalCO2e).toBeCloseTo(2.00548, 9);
  });

  it("separates biogenic CO2 and excludes it from the total", () => {
    const result = calculateStationaryCombustion({
      quantity: 100,
      unit: "kg",
      factors: { denominatorUnit: "kg", perGasKg: { CO2: 1.5 }, biogenicFraction: 0.5 },
      gwpVersion: "AR6",
      fuelName: "Wood pellets",
    });
    // 150 kg CO2, half biogenic → 75 kg fossil (0.075 t), 75 kg biogenic.
    expect(result.gases.totalCO2e).toBeCloseTo(0.075, 9);
    expect(result.gases.biogenicCO2).toBeCloseTo(0.075, 9);
    expect(result.trace.some((step) => step.stepName.includes("separate biogenic CO2"))).toBe(true);
  });

  it("treats a fully biogenic fuel as zero scope 1 CO2e", () => {
    const result = calculateStationaryCombustion({
      quantity: 100,
      unit: "kg",
      factors: { denominatorUnit: "kg", perGasKg: { CO2: 1.5 }, biogenicFraction: 1 },
      gwpVersion: "AR6",
    });
    expect(result.gases.totalCO2e).toBe(0);
    expect(result.gases.biogenicCO2).toBeCloseTo(0.15, 9);
  });

  it("rejects an empty factor set, a bad biogenic fraction and a non-finite quantity", () => {
    expect(() =>
      calculateStationaryCombustion({
        quantity: 1,
        unit: "m3",
        factors: { denominatorUnit: "m3" },
        gwpVersion: "AR6",
      }),
    ).toThrow(CalculationError);

    expect(() =>
      calculateStationaryCombustion({
        quantity: 1,
        unit: "m3",
        factors: { ...naturalGas, biogenicFraction: 1.5 },
        gwpVersion: "AR6",
      }),
    ).toThrow(/biogenicFraction/);

    expect(() =>
      calculateStationaryCombustion({
        quantity: Number.NaN,
        unit: "m3",
        factors: naturalGas,
        gwpVersion: "AR6",
      }),
    ).toThrow(/finite/);
  });
});

describe("calculateMobileCombustion", () => {
  it("computes fuel-based emissions from a diesel fleet", () => {
    // 500 L × (2.68 CO2, 0.0001 CH4, 0.0002 N2O) at AR6
    // = 1340 kg CO2e + 0.05 × 29.8 + 0.1 × 273 = 1340 + 1.49 + 27.3 = 1368.79 kg
    const result = calculateMobileCombustion({
      method: "FUEL",
      quantity: 500,
      unit: "L",
      factors: {
        denominatorUnit: "L",
        perGasKg: { CO2: 2.68, CH4_FOSSIL: 0.0001, N2O: 0.0002 },
        factorId: "ef-diesel",
      },
      gwpVersion: "AR6",
      vehicleName: "Delivery fleet (diesel)",
    });
    expect(result.method).toBe("mobile-combustion-fuel");
    expect(result.gases.totalCO2e).toBeCloseTo(1.36879, 9);
    expect(result.trace[0].stepName).toContain("select method");
    expect(result.trace[0].notes).toBeUndefined();
  });

  it("computes distance-based emissions and warns about the higher uncertainty", () => {
    // 10,000 km × 0.17 kg CO2e/km = 1700 kg = 1.7 tCO2e
    const result = calculateMobileCombustion({
      method: "DISTANCE",
      quantity: 10_000,
      unit: "km",
      factors: { denominatorUnit: "km", co2eKgPerUnit: 0.17 },
      gwpVersion: "AR6",
    });
    expect(result.method).toBe("mobile-combustion-distance");
    expect(result.gases.totalCO2e).toBeCloseTo(1.7, 9);
    expect(result.trace[0].notes).toMatch(/higher uncertainty/);
    // A pre-aggregated CO2e factor is not attributed to a gas column.
    expect(result.gases.co2Emissions).toBe(0);
  });

  it("converts miles to kilometres before applying a per-km factor", () => {
    const result = calculateMobileCombustion({
      method: "DISTANCE",
      quantity: 100,
      unit: "mi",
      factors: { denominatorUnit: "km", co2eKgPerUnit: 0.17 },
      gwpVersion: "AR6",
    });
    // 100 mi = 160.9344 km × 0.17 = 27.358848 kg
    expect(result.gases.totalCO2e).toBeCloseTo(0.027358848, 12);
  });
});

describe("calculateProcessEmissions", () => {
  it("applies a Tier 1 output-based factor", () => {
    // 1000 t clinker × 525 kg CO2e/t = 525,000 kg = 525 tCO2e
    const result = calculateProcessEmissions({
      quantity: 1000,
      unit: "t",
      factors: { denominatorUnit: "t", co2eKgPerUnit: 525 },
      gwpVersion: "AR6",
      processName: "Clinker calcination",
    });
    expect(result.method).toBe("process-emissions");
    expect(result.gases.totalCO2e).toBeCloseTo(525, 9);
    expect(result.trace.some((s) => s.stepName.includes("adjust process input"))).toBe(false);
  });

  it("applies the Tier 2 purity and calcination refinements", () => {
    // 1000 t × 0.95 purity × 0.98 calcined = 931 t × 525 kg/t = 488,775 kg
    const result = calculateProcessEmissions({
      quantity: 1000,
      unit: "t",
      factors: { denominatorUnit: "t", co2eKgPerUnit: 525 },
      gwpVersion: "AR6",
      purity: 0.95,
      calcinationFraction: 0.98,
    });
    expect(result.gases.totalCO2e).toBeCloseTo(488.775, 9);
    const adjust = result.trace.find((s) => s.stepName.includes("adjust process input"));
    expect(adjust?.output).toBeCloseTo(931, 9);
    expect(adjust?.notes).toContain("Tier 2");
  });

  it("supports a per-gas process factor", () => {
    // 50 t adipic acid × 0.3 kg N2O/t = 15 kg N2O × 273 = 4095 kg = 4.095 t
    const result = calculateProcessEmissions({
      quantity: 50,
      unit: "t",
      factors: { denominatorUnit: "t", perGasKg: { N2O: 0.3 } },
      gwpVersion: "AR6",
    });
    expect(result.gases.n2oEmissions).toBeCloseTo(4.095, 9);
    expect(result.gases.totalCO2e).toBeCloseTo(4.095, 9);
  });

  it("rejects an out-of-range purity or calcination fraction", () => {
    const base = {
      quantity: 1,
      unit: "t",
      factors: { denominatorUnit: "t", co2eKgPerUnit: 1 },
      gwpVersion: "AR6",
    } as const;
    expect(() => calculateProcessEmissions({ ...base, purity: 1.2 })).toThrow(CalculationError);
    expect(() => calculateProcessEmissions({ ...base, calcinationFraction: -0.1 })).toThrow(
      /calcinationFraction/,
    );
  });
});

describe("calculateFugitiveEmissions", () => {
  it("screens a refrigerant blend using the sales/inventory balance", () => {
    // leak = 10 + 50 − 5 = 55 kg; R-410A at AR5 = 0.5×677 + 0.5×3170 = 1923.5
    // 55 × 1923.5 = 105,792.5 kg = 105.7925 tCO2e
    const result = calculateFugitiveEmissions({
      method: "SCREENING",
      gwpVersion: "AR5",
      blend: "R-410A",
      inventoryChange: 10,
      purchases: 50,
      disposals: 5,
    });
    expect(result.scope).toBe("SCOPE_1");
    expect(result.method).toBe("fugitive-screening");
    expect(result.trace[0].output).toBeCloseTo(55, 9);
    expect(result.gases.totalCO2e).toBeCloseTo(105.7925, 8);
  });

  it("subtracts the installed-capacity change under the material-balance method", () => {
    // leak = 10 + 50 − 5 − 30 = 25 kg → 25 × 1923.5 = 48,087.5 kg
    const result = calculateFugitiveEmissions({
      method: "MATERIAL_BALANCE",
      gwpVersion: "AR5",
      blend: "R-410A",
      inventoryChange: 10,
      purchases: 50,
      disposals: 5,
      capacityChange: 30,
    });
    expect(result.method).toBe("fugitive-material-balance");
    expect(result.gases.totalCO2e).toBeCloseTo(48.0875, 8);
  });

  it("computes a single-gas leak and attributes it to the right gas column", () => {
    // 2 kg SF6 × 25,200 (AR6) = 50,400 kg = 50.4 tCO2e
    const result = calculateFugitiveEmissions({
      method: "SCREENING",
      gwpVersion: "AR6",
      gas: "SF6",
      inventoryChange: 2,
      purchases: 0,
      disposals: 0,
      sourceName: "HV switchgear",
    });
    expect(result.gases.sf6Emissions).toBeCloseTo(50.4, 8);
    expect(result.gases.totalCO2e).toBeCloseTo(50.4, 8);
    expect(result.gases.byGas[0].gas).toBe("SF6");
    expect(result.gases.byGas[0].mass).toBeCloseTo(0.002, 12);
  });

  it("clamps a physically impossible negative balance to zero and flags it", () => {
    const result = calculateFugitiveEmissions({
      method: "SCREENING",
      gwpVersion: "AR6",
      gas: "SF6",
      inventoryChange: -100,
      purchases: 0,
      disposals: 0,
    });
    expect(result.gases.totalCO2e).toBe(0);
    expect(result.trace[0].notes).toMatch(/physically impossible/);
  });

  it("validates its inputs", () => {
    const base = {
      method: "SCREENING",
      gwpVersion: "AR6",
      inventoryChange: 1,
      purchases: 0,
      disposals: 0,
    } as const;
    expect(() => calculateFugitiveEmissions(base)).toThrow(/either a gas or a blend/);
    expect(() =>
      calculateFugitiveEmissions({ ...base, gas: "SF6", blend: "R-410A" }),
    ).toThrow(/not both/);
    expect(() =>
      calculateFugitiveEmissions({ ...base, method: "MATERIAL_BALANCE", gas: "SF6" }),
    ).toThrow(/capacityChange/);
    expect(() =>
      calculateFugitiveEmissions({ ...base, blend: "R-000X" }),
    ).toThrow(/Unknown refrigerant blend/);
  });
});

describe("every scope 1 engine emits a usable trace", () => {
  const computations: ReadonlyArray<readonly [string, EmissionComputation]> = [
    [
      "stationary",
      calculateStationaryCombustion({
        quantity: 10,
        unit: "m3",
        factors: { denominatorUnit: "m3", perGasKg: { CO2: 2 } },
        gwpVersion: "AR6",
      }),
    ],
    [
      "mobile",
      calculateMobileCombustion({
        method: "FUEL",
        quantity: 10,
        unit: "L",
        factors: { denominatorUnit: "L", perGasKg: { CO2: 2.68 } },
        gwpVersion: "AR6",
      }),
    ],
    [
      "process",
      calculateProcessEmissions({
        quantity: 10,
        unit: "t",
        factors: { denominatorUnit: "t", co2eKgPerUnit: 525 },
        gwpVersion: "AR6",
      }),
    ],
    [
      "fugitive",
      calculateFugitiveEmissions({
        method: "SCREENING",
        gwpVersion: "AR6",
        gas: "HFC_134A",
        inventoryChange: 1,
        purchases: 0,
        disposals: 0,
      }),
    ],
  ];

  it.each(computations)("%s carries a non-empty, well-formed trace", (_name, computation) => {
    expect(computation.trace.length).toBeGreaterThan(0);
    computation.trace.forEach((step, index) => {
      expect(step.orderIndex).toBe(index);
      expect(step.stepName.length).toBeGreaterThan(0);
      expect(step.formula.length).toBeGreaterThan(0);
      expect(step.unit.length).toBeGreaterThan(0);
      expect(Number.isFinite(step.output)).toBe(true);
      expect(typeof step.inputs).toBe("object");
    });
    // The last step is always the tCO2e total.
    const last = computation.trace[computation.trace.length - 1];
    expect(last.stepName).toContain("total");
    expect(last.output).toBeCloseTo(computation.gases.totalCO2e, 9);
    expect(computation.scope).toBe("SCOPE_1");
  });
});
