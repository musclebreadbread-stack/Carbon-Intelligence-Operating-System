import { describe, expect, it } from "vitest";

import { SCOPE3_CATEGORIES, type Scope3Category } from "@/lib/core/enums";
import { CalculationError } from "@/lib/core/errors";

import {
  calculateCat1PurchasedGoods,
  calculateCat2CapitalGoods,
  calculateCat3FuelEnergy,
  calculateCat4UpstreamTransport,
  calculateCat5Waste,
  calculateCat6BusinessTravel,
  calculateCat7EmployeeCommuting,
  calculateCat8UpstreamLeased,
  calculateCat9DownstreamTransport,
  calculateCat10Processing,
  calculateCat11UseOfSold,
  calculateCat12EndOfLife,
  calculateCat13DownstreamLeased,
  calculateCat14Franchises,
  calculateCat15Investments,
  calculateScope3Category,
  type Scope3CategoryInput,
} from "./scope3";
import type { ActivityFactorSet } from "./types";

const gwpVersion = "AR6" as const;

const perUsd = (value: number): ActivityFactorSet => ({
  denominatorUnit: "USD",
  co2eKgPerUnit: value,
  factorId: "ef-eeio",
});
const perTonne = (value: number): ActivityFactorSet => ({
  denominatorUnit: "t",
  co2eKgPerUnit: value,
});
const perKwh = (value: number): ActivityFactorSet => ({
  denominatorUnit: "kWh",
  co2eKgPerUnit: value,
});
const perTkm = (value: number): ActivityFactorSet => ({
  denominatorUnit: "tkm",
  co2eKgPerUnit: value,
});
const perPkm = (value: number): ActivityFactorSet => ({
  denominatorUnit: "pkm",
  co2eKgPerUnit: value,
});

describe("Category 1 — purchased goods and services", () => {
  it("computes spend-based emissions", () => {
    // 1,000,000 USD × 0.25 kg CO2e/USD = 250,000 kg = 250 tCO2e
    const result = calculateCat1PurchasedGoods({
      quantity: 1_000_000,
      unit: "USD",
      factors: perUsd(0.25),
      gwpVersion,
    });
    expect(result.scope).toBe("SCOPE_3");
    expect(result.scope3Category).toBe("CAT_1_PURCHASED_GOODS");
    expect(result.method).toBe("scope3-cat1-spend-based");
    expect(result.gases.totalCO2e).toBeCloseTo(250, 9);
    expect(result.trace[0].notes).toMatch(/highest uncertainty/);
  });

  it("computes average-data emissions from physical quantities", () => {
    // 500 t steel × 1800 kg CO2e/t = 900,000 kg = 900 tCO2e
    const result = calculateCat1PurchasedGoods({
      quantity: 500,
      unit: "t",
      factors: perTonne(1800),
      gwpVersion,
      approach: "AVERAGE_DATA",
    });
    expect(result.gases.totalCO2e).toBeCloseTo(900, 9);
    expect(result.method).toBe("scope3-cat1-average-data");
  });

  it("uses a supplier-reported figure directly", () => {
    const result = calculateCat1PurchasedGoods({
      quantity: 0,
      unit: "USD",
      factors: perUsd(0.25),
      gwpVersion,
      approach: "SUPPLIER_SPECIFIC",
      supplierReportedTCO2e: 123.4,
    });
    expect(result.gases.totalCO2e).toBeCloseTo(123.4, 9);
    expect(result.method).toBe("scope3-cat1-supplier-specific");
  });

  it("adds supplier data to the factor-based residual under the hybrid method", () => {
    // 200,000 USD × 0.25 = 50 tCO2e residual + 100 tCO2e supplier-reported
    const result = calculateCat1PurchasedGoods({
      quantity: 200_000,
      unit: "USD",
      factors: perUsd(0.25),
      gwpVersion,
      approach: "HYBRID",
      supplierReportedTCO2e: 100,
    });
    expect(result.gases.totalCO2e).toBeCloseTo(150, 9);
    expect(result.method).toBe("scope3-cat1-hybrid");
  });

  it("rejects an approach the category does not support", () => {
    expect(() =>
      calculateCat1PurchasedGoods({
        quantity: 1,
        unit: "t",
        factors: perTonne(1),
        gwpVersion,
        approach: "ACTIVITY_BASED",
      }),
    ).toThrow(/not a supported approach/);
  });

  it("requires supplier data for the supplier-specific approach", () => {
    expect(() =>
      calculateCat1PurchasedGoods({
        quantity: 1,
        unit: "USD",
        factors: perUsd(1),
        gwpVersion,
        approach: "SUPPLIER_SPECIFIC",
      }),
    ).toThrow(/requires supplierReportedTCO2e/);
  });
});

describe("Category 2 — capital goods", () => {
  it("computes spend-based emissions in the year of acquisition", () => {
    // 2,000,000 USD × 0.3 = 600,000 kg = 600 tCO2e
    const result = calculateCat2CapitalGoods({
      quantity: 2_000_000,
      unit: "USD",
      factors: perUsd(0.3),
      gwpVersion,
    });
    expect(result.gases.totalCO2e).toBeCloseTo(600, 9);
    expect(result.scope3Category).toBe("CAT_2_CAPITAL_GOODS");
  });
});

describe("Category 3 — fuel and energy related activities", () => {
  it("derives WTT emissions from Scope 1 fuel and grid losses from Scope 2", () => {
    // WTT: 100,000 m3 × 0.35 = 35,000 kg = 35 tCO2e
    // T&D: 1,000,000 kWh delivered at a 4 % gross-generation loss rate
    //      → 1,000,000 × 0.04/0.96 = 41,666.667 kWh × 0.4 = 16,666.667 kg
    const result = calculateCat3FuelEnergy({
      gwpVersion,
      fuels: [
        {
          name: "Natural gas",
          quantity: 100_000,
          unit: "m3",
          factors: { denominatorUnit: "m3", co2eKgPerUnit: 0.35 },
        },
      ],
      electricity: [
        { name: "Grid", quantity: 1_000_000, unit: "kWh", lossRate: 0.04, factors: perKwh(0.4) },
      ],
    });
    expect(result.scope3Category).toBe("CAT_3_FUEL_ENERGY");
    expect(result.gases.totalCO2e).toBeCloseTo(51.6666667, 6);
    const grossUp = result.trace.find((s) => s.stepName.includes("gross up"));
    expect(grossUp?.output).toBeCloseTo(41_666.6667, 3);
  });

  it("applies a per-kWh-delivered T&D factor when no loss rate is given", () => {
    // 1,000,000 kWh × 0.03 kg/kWh = 30,000 kg = 30 tCO2e
    const result = calculateCat3FuelEnergy({
      gwpVersion,
      electricity: [{ quantity: 1_000_000, unit: "kWh", factors: perKwh(0.03) }],
    });
    expect(result.gases.totalCO2e).toBeCloseTo(30, 9);
    expect(result.trace.some((s) => s.stepName.includes("gross up"))).toBe(false);
  });

  it("validates its components", () => {
    expect(() => calculateCat3FuelEnergy({ gwpVersion })).toThrow(
      /at least one fuel or electricity component/,
    );
    expect(() =>
      calculateCat3FuelEnergy({
        gwpVersion,
        electricity: [{ quantity: 1, unit: "kWh", lossRate: 1, factors: perKwh(0.4) }],
      }),
    ).toThrow(/lossRate/);
  });
});

describe("Categories 4 and 9 — transportation", () => {
  it("computes tonne-kilometres for upstream freight", () => {
    // 20 t × 500 km = 10,000 tkm × 0.11 kg/tkm = 1100 kg = 1.1 tCO2e
    const result = calculateCat4UpstreamTransport({
      mass: 20,
      massUnit: "t",
      distance: 500,
      distanceUnit: "km",
      factors: perTkm(0.11),
      gwpVersion,
      mode: "road",
    });
    expect(result.scope3Category).toBe("CAT_4_UPSTREAM_TRANSPORT");
    expect(result.trace[0].output).toBeCloseTo(10_000, 9);
    expect(result.gases.totalCO2e).toBeCloseTo(1.1, 9);
  });

  it("normalises mass and distance units before building tonne-kilometres", () => {
    const result = calculateCat4UpstreamTransport({
      mass: 20_000,
      massUnit: "kg",
      distance: 500_000,
      distanceUnit: "m",
      factors: perTkm(0.11),
      gwpVersion,
    });
    expect(result.gases.totalCO2e).toBeCloseTo(1.1, 9);
  });

  it("computes downstream freight", () => {
    // 100 t × 1200 km = 120,000 tkm × 0.09 = 10,800 kg = 10.8 tCO2e
    const result = calculateCat9DownstreamTransport({
      mass: 100,
      massUnit: "t",
      distance: 1200,
      distanceUnit: "km",
      factors: perTkm(0.09),
      gwpVersion,
      mode: "sea",
    });
    expect(result.scope3Category).toBe("CAT_9_DOWNSTREAM_TRANSPORT");
    expect(result.gases.totalCO2e).toBeCloseTo(10.8, 9);
  });
});

describe("Categories 5 and 12 — waste and end-of-life", () => {
  it("computes operational waste by treatment route", () => {
    // 50 t × 450 kg/t = 22,500 kg = 22.5 tCO2e
    const result = calculateCat5Waste({
      mass: 50,
      massUnit: "t",
      treatmentMethod: "landfill",
      factors: perTonne(450),
      gwpVersion,
    });
    expect(result.scope3Category).toBe("CAT_5_WASTE");
    expect(result.trace[0].inputs.treatmentMethod).toBe("landfill");
    expect(result.gases.totalCO2e).toBeCloseTo(22.5, 9);
  });

  it("computes end-of-life treatment of sold products", () => {
    // 3000 t × 200 kg/t = 600,000 kg = 600 tCO2e
    const result = calculateCat12EndOfLife({
      mass: 3000,
      massUnit: "t",
      treatmentMethod: "recycling",
      factors: perTonne(200),
      gwpVersion,
    });
    expect(result.scope3Category).toBe("CAT_12_END_OF_LIFE");
    expect(result.gases.totalCO2e).toBeCloseTo(600, 9);
  });
});

describe("Category 6 — business travel", () => {
  it("computes passenger-kilometres and adds accommodation", () => {
    // 8000 km × 4 travellers = 32,000 pkm × 0.15 = 4800 kg = 4.8 tCO2e
    // 12 hotel nights × 15 kg = 180 kg = 0.18 tCO2e → 4.98 tCO2e
    const result = calculateCat6BusinessTravel({
      distance: 8000,
      distanceUnit: "km",
      travellers: 4,
      mode: "air-long-haul",
      factors: perPkm(0.15),
      gwpVersion,
      hotelNights: 12,
      hotelFactorKgPerNight: 15,
    });
    expect(result.trace[0].output).toBeCloseTo(32_000, 9);
    expect(result.gases.totalCO2e).toBeCloseTo(4.98, 9);
    expect(result.trace.some((s) => s.stepName.includes("hotel stays"))).toBe(true);
  });

  it("defaults to a single traveller and omits accommodation", () => {
    const result = calculateCat6BusinessTravel({
      distance: 1000,
      distanceUnit: "km",
      factors: perPkm(0.15),
      gwpVersion,
    });
    expect(result.gases.totalCO2e).toBeCloseTo(0.15, 9);
    expect(result.trace.some((s) => s.stepName.includes("hotel stays"))).toBe(false);
  });
});

describe("Category 7 — employee commuting", () => {
  it("scales by headcount, working days and the remote-work share", () => {
    // 500 employees × 250 days × 0.8 on-site × 30 km = 3,000,000 pkm
    // × 0.17 kg/pkm = 510,000 kg = 510 tCO2e
    // Teleworking: 500 × 250 × 0.2 = 25,000 days × 1.2 kg = 30,000 kg = 30 tCO2e
    const result = calculateCat7EmployeeCommuting({
      employeeCount: 500,
      workingDays: 250,
      dailyDistance: 30,
      distanceUnit: "km",
      mode: "car",
      factors: perPkm(0.17),
      gwpVersion,
      remoteWorkShare: 0.2,
      homeOfficeFactorKgPerDay: 1.2,
    });
    expect(result.trace[0].output).toBeCloseTo(3_000_000, 6);
    expect(result.gases.totalCO2e).toBeCloseTo(540, 9);
  });

  it("omits teleworking when nobody works remotely", () => {
    const result = calculateCat7EmployeeCommuting({
      employeeCount: 10,
      workingDays: 200,
      dailyDistance: 20,
      distanceUnit: "km",
      factors: perPkm(0.17),
      gwpVersion,
      homeOfficeFactorKgPerDay: 1.2,
    });
    // 10 × 200 × 20 = 40,000 pkm × 0.17 = 6800 kg = 6.8 tCO2e
    expect(result.gases.totalCO2e).toBeCloseTo(6.8, 9);
    expect(result.trace.some((s) => s.stepName.includes("teleworking"))).toBe(false);
  });

  it("rejects an out-of-range remote-work share", () => {
    expect(() =>
      calculateCat7EmployeeCommuting({
        employeeCount: 1,
        workingDays: 1,
        dailyDistance: 1,
        distanceUnit: "km",
        factors: perPkm(0.17),
        gwpVersion,
        remoteWorkShare: 1.5,
      }),
    ).toThrow(/remoteWorkShare/);
  });
});

describe("Categories 8 and 13 — leased assets", () => {
  it("computes upstream leased asset energy", () => {
    // 250,000 kWh × 0.4 = 100,000 kg = 100 tCO2e
    const result = calculateCat8UpstreamLeased({
      quantity: 250_000,
      unit: "kWh",
      factors: perKwh(0.4),
      gwpVersion,
    });
    expect(result.scope3Category).toBe("CAT_8_UPSTREAM_LEASED");
    expect(result.gases.totalCO2e).toBeCloseTo(100, 9);
  });

  it("computes downstream leased asset energy", () => {
    // 800,000 kWh × 0.4 = 320,000 kg = 320 tCO2e
    const result = calculateCat13DownstreamLeased({
      quantity: 800_000,
      unit: "kWh",
      factors: perKwh(0.4),
      gwpVersion,
    });
    expect(result.scope3Category).toBe("CAT_13_DOWNSTREAM_LEASED");
    expect(result.gases.totalCO2e).toBeCloseTo(320, 9);
  });
});

describe("Category 10 — processing of sold products", () => {
  it("applies the downstream processing factor to the mass sold", () => {
    // 5000 t × 120 kg/t = 600,000 kg = 600 tCO2e
    const result = calculateCat10Processing({
      mass: 5000,
      massUnit: "t",
      factors: perTonne(120),
      gwpVersion,
    });
    expect(result.scope3Category).toBe("CAT_10_PROCESSING");
    expect(result.gases.totalCO2e).toBeCloseTo(600, 9);
  });
});

describe("Category 11 — use of sold products", () => {
  it("computes direct and indirect use-phase emissions over the product lifetime", () => {
    // direct:   100,000 units × 3000 uses × 0.05 kWh = 15,000,000 kWh × 0.4 = 6000 tCO2e
    // indirect: 100,000 units × 200 washes × 0.6 kWh = 12,000,000 kWh × 0.4 = 4800 tCO2e
    const result = calculateCat11UseOfSold({
      unitsSold: 100_000,
      gwpVersion,
      direct: [
        {
          name: "Appliance operation",
          lifetimeUses: 3000,
          consumptionPerUse: 0.05,
          consumptionUnit: "kWh",
          factors: perKwh(0.4),
        },
      ],
      indirect: [
        {
          name: "Laundering",
          lifetimeUses: 200,
          consumptionPerUse: 0.6,
          consumptionUnit: "kWh",
          factors: perKwh(0.4),
        },
      ],
    });
    expect(result.scope3Category).toBe("CAT_11_USE_OF_SOLD");
    expect(result.gases.totalCO2e).toBeCloseTo(10_800, 6);
    const total = result.trace[result.trace.length - 1];
    expect(total.inputs.directTCO2e).toBeCloseTo(6000, 6);
    expect(total.inputs.indirectTCO2e).toBeCloseTo(4800, 6);
    expect(
      result.trace.some((s) => s.notes?.includes("Indirect use-phase emissions are optional")),
    ).toBe(true);
  });

  it("supports a direct-only product", () => {
    const result = calculateCat11UseOfSold({
      unitsSold: 1000,
      gwpVersion,
      direct: [
        { lifetimeUses: 100, consumptionPerUse: 1, consumptionUnit: "kWh", factors: perKwh(0.4) },
      ],
    });
    // 1000 × 100 × 1 = 100,000 kWh × 0.4 = 40,000 kg = 40 tCO2e
    expect(result.gases.totalCO2e).toBeCloseTo(40, 9);
  });

  it("requires at least one use-phase component", () => {
    expect(() => calculateCat11UseOfSold({ unitsSold: 1, gwpVersion })).toThrow(
      /at least one direct or indirect/,
    );
  });
});

describe("Category 14 — franchises", () => {
  it("scales average franchise activity across the network", () => {
    // 120 outlets × 150,000 kWh = 18,000,000 kWh × 0.4 = 7,200,000 kg = 7200 tCO2e
    const result = calculateCat14Franchises({
      franchiseCount: 120,
      quantityPerFranchise: 150_000,
      unit: "kWh",
      factors: perKwh(0.4),
      gwpVersion,
    });
    expect(result.scope3Category).toBe("CAT_14_FRANCHISES");
    expect(result.trace[0].output).toBeCloseTo(18_000_000, 6);
    expect(result.gases.totalCO2e).toBeCloseTo(7200, 6);
  });
});

describe("Category 15 — investments", () => {
  it("attributes investee emissions by equity share", () => {
    // 10,000 tCO2e × 35 % = 3500 tCO2e
    const result = calculateCat15Investments({
      method: "EQUITY_SHARE",
      gwpVersion,
      investeeEmissionsTCO2e: 10_000,
      equitySharePercent: 35,
    });
    expect(result.scope3Category).toBe("CAT_15_INVESTMENTS");
    expect(result.method).toBe("scope3-cat15-equity-share");
    expect(result.gases.totalCO2e).toBeCloseTo(3500, 6);
  });

  it("attributes with the PCAF investment-specific factor", () => {
    // 10,000 tCO2e × (5,000,000 / 50,000,000) = 1000 tCO2e
    const result = calculateCat15Investments({
      method: "INVESTMENT_SPECIFIC",
      gwpVersion,
      investeeEmissionsTCO2e: 10_000,
      outstandingAmount: 5_000_000,
      totalCompanyValue: 50_000_000,
    });
    expect(result.gases.totalCO2e).toBeCloseTo(1000, 6);
    expect(result.trace[0].inputs.attributionShare).toBeCloseTo(0.1, 12);
  });

  it("falls back to a sector-average factor on the amount invested", () => {
    // 20,000,000 USD × 0.05 kg CO2e/USD = 1,000,000 kg = 1000 tCO2e
    const result = calculateCat15Investments({
      method: "AVERAGE_DATA",
      gwpVersion,
      investedAmount: 20_000_000,
      investedCurrency: "USD",
      factors: perUsd(0.05),
    });
    expect(result.gases.totalCO2e).toBeCloseTo(1000, 6);
    expect(result.trace[0].notes).toMatch(/PCAF data-quality score 5/);
  });

  it("validates each attribution method's inputs", () => {
    expect(() =>
      calculateCat15Investments({ method: "EQUITY_SHARE", gwpVersion, investeeEmissionsTCO2e: 1 }),
    ).toThrow(/requires equitySharePercent/);
    expect(() =>
      calculateCat15Investments({
        method: "EQUITY_SHARE",
        gwpVersion,
        investeeEmissionsTCO2e: 1,
        equitySharePercent: 120,
      }),
    ).toThrow(/between 0 and 100/);
    expect(() =>
      calculateCat15Investments({
        method: "INVESTMENT_SPECIFIC",
        gwpVersion,
        investeeEmissionsTCO2e: 1,
      }),
    ).toThrow(/outstandingAmount and totalCompanyValue/);
    expect(() =>
      calculateCat15Investments({
        method: "INVESTMENT_SPECIFIC",
        gwpVersion,
        investeeEmissionsTCO2e: 1,
        outstandingAmount: 1,
        totalCompanyValue: 0,
      }),
    ).toThrow(/greater than zero/);
    expect(() => calculateCat15Investments({ method: "AVERAGE_DATA", gwpVersion })).toThrow(
      /investedAmount/,
    );
    expect(() => calculateCat15Investments({ method: "EQUITY_SHARE", gwpVersion })).toThrow(
      /investeeEmissionsTCO2e/,
    );
  });
});

describe("calculateScope3Category dispatcher", () => {
  const inputs: Readonly<Record<Scope3Category, Scope3CategoryInput>> = {
    CAT_1_PURCHASED_GOODS: {
      category: "CAT_1_PURCHASED_GOODS",
      quantity: 1_000_000,
      unit: "USD",
      factors: perUsd(0.25),
      gwpVersion,
    },
    CAT_2_CAPITAL_GOODS: {
      category: "CAT_2_CAPITAL_GOODS",
      quantity: 2_000_000,
      unit: "USD",
      factors: perUsd(0.3),
      gwpVersion,
    },
    CAT_3_FUEL_ENERGY: {
      category: "CAT_3_FUEL_ENERGY",
      gwpVersion,
      electricity: [{ quantity: 1_000_000, unit: "kWh", factors: perKwh(0.03) }],
    },
    CAT_4_UPSTREAM_TRANSPORT: {
      category: "CAT_4_UPSTREAM_TRANSPORT",
      mass: 20,
      massUnit: "t",
      distance: 500,
      distanceUnit: "km",
      factors: perTkm(0.11),
      gwpVersion,
    },
    CAT_5_WASTE: {
      category: "CAT_5_WASTE",
      mass: 50,
      massUnit: "t",
      treatmentMethod: "landfill",
      factors: perTonne(450),
      gwpVersion,
    },
    CAT_6_BUSINESS_TRAVEL: {
      category: "CAT_6_BUSINESS_TRAVEL",
      distance: 8000,
      distanceUnit: "km",
      travellers: 4,
      factors: perPkm(0.15),
      gwpVersion,
    },
    CAT_7_EMPLOYEE_COMMUTING: {
      category: "CAT_7_EMPLOYEE_COMMUTING",
      employeeCount: 500,
      workingDays: 250,
      dailyDistance: 30,
      distanceUnit: "km",
      factors: perPkm(0.17),
      gwpVersion,
    },
    CAT_8_UPSTREAM_LEASED: {
      category: "CAT_8_UPSTREAM_LEASED",
      quantity: 250_000,
      unit: "kWh",
      factors: perKwh(0.4),
      gwpVersion,
    },
    CAT_9_DOWNSTREAM_TRANSPORT: {
      category: "CAT_9_DOWNSTREAM_TRANSPORT",
      mass: 100,
      massUnit: "t",
      distance: 1200,
      distanceUnit: "km",
      factors: perTkm(0.09),
      gwpVersion,
    },
    CAT_10_PROCESSING: {
      category: "CAT_10_PROCESSING",
      mass: 5000,
      massUnit: "t",
      factors: perTonne(120),
      gwpVersion,
    },
    CAT_11_USE_OF_SOLD: {
      category: "CAT_11_USE_OF_SOLD",
      unitsSold: 100_000,
      gwpVersion,
      direct: [
        { lifetimeUses: 3000, consumptionPerUse: 0.05, consumptionUnit: "kWh", factors: perKwh(0.4) },
      ],
    },
    CAT_12_END_OF_LIFE: {
      category: "CAT_12_END_OF_LIFE",
      mass: 3000,
      massUnit: "t",
      treatmentMethod: "recycling",
      factors: perTonne(200),
      gwpVersion,
    },
    CAT_13_DOWNSTREAM_LEASED: {
      category: "CAT_13_DOWNSTREAM_LEASED",
      quantity: 800_000,
      unit: "kWh",
      factors: perKwh(0.4),
      gwpVersion,
    },
    CAT_14_FRANCHISES: {
      category: "CAT_14_FRANCHISES",
      franchiseCount: 120,
      quantityPerFranchise: 150_000,
      unit: "kWh",
      factors: perKwh(0.4),
      gwpVersion,
    },
    CAT_15_INVESTMENTS: {
      category: "CAT_15_INVESTMENTS",
      method: "EQUITY_SHARE",
      gwpVersion,
      investeeEmissionsTCO2e: 10_000,
      equitySharePercent: 35,
    },
  };

  it("covers every Scope3Category enum member", () => {
    expect(Object.keys(inputs).sort()).toEqual([...SCOPE3_CATEGORIES].sort());
  });

  it.each(SCOPE3_CATEGORIES)("dispatches %s to its engine", (category) => {
    const result = calculateScope3Category(inputs[category]);
    expect(result.scope).toBe("SCOPE_3");
    expect(result.scope3Category).toBe(category);
    expect(result.gases.totalCO2e).toBeGreaterThan(0);
    expect(result.gases.unit).toBe("tCO2e");
    expect(result.trace.length).toBeGreaterThan(0);
    result.trace.forEach((step, index) => expect(step.orderIndex).toBe(index));
    const last = result.trace[result.trace.length - 1];
    expect(last.output).toBeCloseTo(result.gases.totalCO2e, 6);
  });

  it("produces the same result as calling the category function directly", () => {
    expect(calculateScope3Category(inputs.CAT_4_UPSTREAM_TRANSPORT).gases.totalCO2e).toBeCloseTo(
      calculateCat4UpstreamTransport({
        mass: 20,
        massUnit: "t",
        distance: 500,
        distanceUnit: "km",
        factors: perTkm(0.11),
        gwpVersion,
      }).gases.totalCO2e,
      12,
    );
  });

  it("rejects an unknown category at runtime", () => {
    expect(() =>
      calculateScope3Category({ category: "CAT_16_INVENTED" } as never),
    ).toThrow(CalculationError);
  });
});
