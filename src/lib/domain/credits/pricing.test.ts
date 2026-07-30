import { describe, expect, it } from "vitest";

import { CalculationError } from "@/lib/core/errors";

import {
  etsPosition,
  internalCarbonPriceImpact,
  markToMarket,
  ppaCoverage,
  recCoverage,
  type CarbonPriceLike,
  type PpaLike,
  type RecertificateLike,
} from "./pricing";
import type { CarbonCreditLike } from "./registry";

const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

const credits: readonly CarbonCreditLike[] = [
  { id: "c1", registry: "Verra", quantity: 1_000, status: "ACTIVE", price: 8, currency: "USD" },
  { id: "c2", registry: "Gold Standard", quantity: 500, status: "ACTIVE", price: 15, currency: "USD" },
  { id: "c3", registry: "Puro.earth", quantity: 200, status: "ACTIVE", price: 200, currency: "USD" },
];

const prices: readonly CarbonPriceLike[] = [
  { market: "Verra", price: 10, currency: "USD", priceDate: utc("2024-06-30") },
  { market: "Verra", price: 6, currency: "USD", priceDate: utc("2023-12-31") },
  { market: "Gold Standard", price: 12, currency: "USD", priceDate: utc("2024-06-30") },
];

describe("markToMarket", () => {
  it("values each credit at the latest quote for its registry", () => {
    const result = markToMarket(credits, prices, { asOf: utc("2024-12-31") });
    const verra = result.valuations[0];
    expect(verra).toMatchObject({
      creditId: "c1",
      bookPrice: 8,
      marketPrice: 10,
      bookValue: 8_000,
      marketValue: 10_000,
      unrealisedGain: 2_000,
      market: "Verra",
    });
    expect(verra.priceDate?.toISOString()).toBe("2024-06-30T00:00:00.000Z");
  });

  it("reports a loss where the market is below book", () => {
    const result = markToMarket(credits, prices, { asOf: utc("2024-12-31") });
    expect(result.valuations[1].unrealisedGain).toBe(-1_500);
  });

  it("leaves unquoted registries unpriced and out of the totals", () => {
    const result = markToMarket(credits, prices, { asOf: utc("2024-12-31") });
    expect(result.unpricedCreditIds).toEqual(["c3"]);
    expect(result.valuations[2].marketValue).toBeNull();
    expect(result.totalMarketValue).toBe(16_000);
    expect(result.totalBookValue).toBe(8_000 + 7_500 + 40_000);
    expect(result.totalUnrealisedGain).toBe(500);
    expect(result.totalQuantity).toBe(1_700);
  });

  it("uses an older quote when the valuation date predates the newest", () => {
    const result = markToMarket(credits, prices, { asOf: utc("2024-01-31") });
    expect(result.valuations[0].marketPrice).toBe(6);
    expect(result.valuations[1].marketPrice).toBeNull();
  });

  it("falls back to another market only when asked", () => {
    const without = markToMarket(credits, prices, { asOf: utc("2024-12-31") });
    expect(without.valuations[2].marketPrice).toBeNull();
    const withFallback = markToMarket(credits, prices, {
      asOf: utc("2024-12-31"),
      allowMarketFallback: true,
    });
    expect(withFallback.valuations[2].marketPrice).toBe(10);
    expect(withFallback.unpricedCreditIds).toEqual([]);
  });

  it("handles an empty price list", () => {
    const result = markToMarket(credits, []);
    expect(result.unpricedCreditIds).toEqual(["c1", "c2", "c3"]);
    expect(result.totalMarketValue).toBe(0);
  });

  it("rejects a negative price", () => {
    expect(() =>
      markToMarket(credits, [
        { market: "Verra", price: -1, priceDate: utc("2024-01-01") },
      ]),
    ).toThrow(CalculationError);
  });
});

describe("internalCarbonPriceImpact", () => {
  it("multiplies the inventory by the shadow price", () => {
    const impact = internalCarbonPriceImpact(
      { totalEmissions: 12_000 },
      { price: 75, currency: "USD", purpose: "capital allocation" },
    );
    expect(impact.shadowCost).toBe(900_000);
    expect(impact.currency).toBe("USD");
    expect(impact.purpose).toBe("capital allocation");
    expect(impact.methodology).toContain("75 USD");
  });

  it("breaks the impact down by scope", () => {
    const impact = internalCarbonPriceImpact(
      {
        totalEmissions: 1_000,
        byScope: { scope1: 200, scope2: 300, scope3: 500 },
      },
      { price: 50 },
    );
    expect(impact.byScope).toEqual({ scope1: 10_000, scope2: 15_000, scope3: 25_000 });
    expect(impact.shadowCost).toBe(50_000);
  });

  it("expresses the impact as a share of revenue", () => {
    const impact = internalCarbonPriceImpact(
      { totalEmissions: 1_000, revenue: 5_000_000 },
      { price: 100 },
    );
    expect(impact.shareOfRevenue).toBeCloseTo(0.02, 12);
  });

  it("returns a null revenue share when no revenue is supplied", () => {
    const impact = internalCarbonPriceImpact({ totalEmissions: 1 }, { price: 1 });
    expect(impact.shareOfRevenue).toBeNull();
    expect(impact.currency).toBe("USD");
    expect(impact.emissionUnit).toBe("tCO2e");
  });

  it("rejects negative inputs", () => {
    expect(() => internalCarbonPriceImpact({ totalEmissions: -1 }, { price: 1 })).toThrow(
      CalculationError,
    );
    expect(() => internalCarbonPriceImpact({ totalEmissions: 1 }, { price: -1 })).toThrow(
      /non-negative/,
    );
    expect(() =>
      internalCarbonPriceImpact(
        { totalEmissions: 1, byScope: { scope1: -1 } },
        { price: 1 },
      ),
    ).toThrow(/scope1/);
  });
});

describe("etsPosition", () => {
  it("produces a positive compliance cost for a deficit", () => {
    const position = etsPosition({
      scheme: "K-ETS",
      complianceYear: 2024,
      allocated: 80_000,
      verified: 100_000,
      allowancePrice: 12,
    });
    expect(position.position).toBe(-20_000);
    expect(position.deficit).toBe(20_000);
    expect(position.surplus).toBe(0);
    expect(position.complianceCost).toBe(240_000);
    expect(position.complianceCost).toBeGreaterThan(0);
    expect(position.status).toBe("short");
  });

  it("values a surplus instead when the position is long", () => {
    const position = etsPosition({
      scheme: "EU ETS",
      complianceYear: 2024,
      allocated: 120_000,
      verified: 100_000,
      allowancePrice: 70,
      currency: "EUR",
    });
    expect(position.surplus).toBe(20_000);
    expect(position.deficit).toBe(0);
    expect(position.complianceCost).toBe(0);
    expect(position.surplusValue).toBe(1_400_000);
    expect(position.currency).toBe("EUR");
  });

  it("counts purchases and sales in the allowance balance", () => {
    const position = etsPosition({
      scheme: "K-ETS",
      complianceYear: 2024,
      allocated: 80_000,
      purchased: 30_000,
      sold: 5_000,
      verified: 100_000,
      allowancePrice: 12,
    });
    expect(position.allowances).toBe(105_000);
    expect(position.position).toBe(5_000);
    expect(position.deficit).toBe(0);
  });

  it("tracks the outstanding surrender obligation and its penalty exposure", () => {
    const position = etsPosition({
      scheme: "EU ETS",
      complianceYear: 2024,
      allocated: 100_000,
      verified: 100_000,
      surrendered: 90_000,
      penaltyPerTonne: 100,
    });
    expect(position.remaining).toBe(10_000);
    expect(position.outstandingObligation).toBe(10_000);
    expect(position.penaltyExposure).toBe(1_000_000);
    expect(position.status).toBe("pending_surrender");
  });

  it("reports full compliance once the obligation is surrendered", () => {
    const position = etsPosition({
      scheme: "EU ETS",
      complianceYear: 2024,
      allocated: 100_000,
      verified: 100_000,
      surrendered: 100_000,
      penaltyPerTonne: 100,
    });
    expect(position.status).toBe("compliant");
    expect(position.penaltyExposure).toBe(0);
    expect(position.remaining).toBe(0);
  });

  it("rejects negative quantities", () => {
    expect(() =>
      etsPosition({ scheme: "x", complianceYear: 2024, allocated: -1, verified: 1 }),
    ).toThrow(/allocated/);
    expect(() =>
      etsPosition({ scheme: "x", complianceYear: 2024, allocated: 1, verified: 1, sold: -1 }),
    ).toThrow(CalculationError);
  });
});

describe("ppaCoverage", () => {
  const ppas: readonly PpaLike[] = [
    {
      id: "ppa-solar",
      name: "Solar farm A",
      energySource: "SOLAR",
      annualVolume: 30_000,
      pricePerUnit: 60,
      currency: "USD",
      startDate: utc("2023-01-01"),
      endDate: utc("2033-12-31"),
    },
    {
      id: "ppa-wind",
      name: "Offshore wind B",
      energySource: "WIND",
      annualVolume: 20_000,
      pricePerUnit: 75,
      startDate: utc("2025-01-01"),
    },
    {
      id: "ppa-old",
      name: "Expired hydro",
      energySource: "HYDRO",
      annualVolume: 10_000,
      startDate: utc("2018-01-01"),
      endDate: utc("2022-12-31"),
    },
    {
      id: "ppa-cancelled",
      name: "Cancelled deal",
      energySource: "WIND",
      annualVolume: 50_000,
      startDate: utc("2023-01-01"),
      status: "terminated",
    },
  ];

  it("counts only contracts active at the reporting date", () => {
    const coverage = ppaCoverage(ppas, 100_000, { asOf: utc("2024-06-30") });
    expect(coverage.contributions.map((entry) => entry.id)).toEqual(["ppa-solar"]);
    expect(coverage.contractedVolume).toBe(30_000);
    expect(coverage.coverage).toBeCloseTo(0.3, 12);
    expect(coverage.uncoveredVolume).toBe(70_000);
    expect(coverage.unit).toBe("MWh");
  });

  it("includes a contract once it starts", () => {
    const coverage = ppaCoverage(ppas, 100_000, { asOf: utc("2025-06-30") });
    expect(coverage.contributions.map((entry) => entry.id)).toEqual([
      "ppa-solar",
      "ppa-wind",
    ]);
    expect(coverage.coverage).toBeCloseTo(0.5, 12);
    expect(coverage.bySource).toEqual({ SOLAR: 30_000, WIND: 20_000 });
  });

  it("caps coverage at 100 % and reports the excess", () => {
    const coverage = ppaCoverage(ppas, 40_000, { asOf: utc("2025-06-30") });
    expect(coverage.contractedVolume).toBe(50_000);
    expect(coverage.appliedVolume).toBe(40_000);
    expect(coverage.coverage).toBe(1);
    expect(coverage.excessVolume).toBe(10_000);
    expect(coverage.uncoveredVolume).toBe(0);
  });

  it("totals contract cost where prices are known", () => {
    const coverage = ppaCoverage(ppas, 100_000, { asOf: utc("2025-06-30") });
    expect(coverage.totalCost).toBe(30_000 * 60 + 20_000 * 75);
    expect(coverage.currency).toBe("USD");
  });

  it("handles zero consumption and rejects a negative one", () => {
    const coverage = ppaCoverage(ppas, 0, { asOf: utc("2024-06-30") });
    expect(coverage.coverage).toBe(0);
    expect(coverage.excessVolume).toBe(30_000);
    expect(() => ppaCoverage(ppas, -1)).toThrow(CalculationError);
  });

  it("rejects a negative contract volume", () => {
    expect(() =>
      ppaCoverage(
        [{ id: "x", name: "X", energySource: "WIND", annualVolume: -1, startDate: utc("2020-01-01") }],
        100,
      ),
    ).toThrow(/non-negative/);
  });
});

describe("recCoverage", () => {
  const certificates: readonly RecertificateLike[] = [
    {
      id: "rec-1",
      certificateId: "REC-0001",
      energySource: "SOLAR",
      quantity: 25_000,
      isRetired: true,
      generationStart: utc("2024-01-01"),
      generationEnd: utc("2024-12-31"),
    },
    {
      id: "rec-2",
      certificateId: "REC-0002",
      energySource: "WIND",
      quantity: 15_000,
      isRetired: true,
      generationStart: utc("2023-01-01"),
      generationEnd: utc("2023-12-31"),
    },
    {
      id: "rec-3",
      certificateId: "REC-0003",
      energySource: "WIND",
      quantity: 40_000,
      isRetired: false,
      generationStart: utc("2024-01-01"),
      generationEnd: utc("2024-12-31"),
    },
  ];

  it("counts only retired certificates by default", () => {
    const coverage = recCoverage(certificates, 100_000);
    expect(coverage.contributions.map((entry) => entry.id)).toEqual(["rec-1", "rec-2"]);
    expect(coverage.contractedVolume).toBe(40_000);
    expect(coverage.coverage).toBeCloseTo(0.4, 12);
    expect(coverage.totalCost).toBeNull();
  });

  it("includes unretired certificates when modelling a forward position", () => {
    const coverage = recCoverage(certificates, 100_000, { includeUnretired: true });
    expect(coverage.contractedVolume).toBe(80_000);
    expect(coverage.coverage).toBeCloseTo(0.8, 12);
  });

  it("filters by generation period", () => {
    const coverage = recCoverage(certificates, 100_000, {
      period: { start: utc("2024-01-01"), end: utc("2024-12-31") },
    });
    expect(coverage.contributions.map((entry) => entry.id)).toEqual(["rec-1"]);
    expect(coverage.coverage).toBeCloseTo(0.25, 12);
  });

  it("groups volume by energy source and names each contribution", () => {
    const coverage = recCoverage(certificates, 100_000);
    expect(coverage.bySource).toEqual({ SOLAR: 25_000, WIND: 15_000 });
    expect(coverage.contributions[0].name).toBe("REC-0001");
    expect(coverage.instrumentCount).toBe(2);
  });

  it("rejects a negative quantity", () => {
    expect(() =>
      recCoverage([{ id: "x", energySource: "WIND", quantity: -1, isRetired: true }], 100),
    ).toThrow(CalculationError);
  });
});
