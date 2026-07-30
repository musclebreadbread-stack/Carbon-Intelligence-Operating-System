import { describe, expect, it } from "vitest";

import { CalculationError, ValidationError } from "@/lib/core/errors";

import {
  creditBalance,
  expiringCredits,
  netEmissions,
  retireCredits,
  type CarbonCreditLike,
} from "./registry";

const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

const credits: readonly CarbonCreditLike[] = [
  {
    id: "c-2019",
    serialNumber: "VCS-0001",
    registry: "Verra",
    vintage: 2019,
    quantity: 1_000,
    status: "ACTIVE",
    issuedAt: utc("2020-03-01"),
    expiresAt: utc("2026-12-31"),
    price: 8,
    currency: "USD",
  },
  {
    id: "c-2021",
    serialNumber: "VCS-0002",
    registry: "Verra",
    vintage: 2021,
    quantity: 2_000,
    status: "ACTIVE",
    issuedAt: utc("2022-02-01"),
    price: 12,
    currency: "USD",
  },
  {
    id: "c-2022",
    serialNumber: "GS-0003",
    registry: "Gold Standard",
    vintage: 2022,
    quantity: 1_500,
    status: "ISSUED",
    issuedAt: utc("2023-01-15"),
    price: 15,
    currency: "USD",
  },
  {
    id: "c-cancelled",
    registry: "Verra",
    vintage: 2018,
    quantity: 500,
    status: "CANCELLED",
    issuedAt: utc("2019-01-01"),
  },
  {
    id: "c-pending",
    registry: "Verra",
    vintage: 2023,
    quantity: 700,
    status: "PENDING_VERIFICATION",
    issuedAt: utc("2024-01-01"),
  },
];

describe("creditBalance", () => {
  it("reports issued, retired and available quantities per credit", () => {
    const balance = creditBalance(credits, [
      { creditId: "c-2021", quantity: 500, offsetDate: utc("2024-06-01") },
    ]);
    expect(balance.totalIssued).toBe(5_700);
    expect(balance.totalRetired).toBe(500);
    // Only ACTIVE/ISSUED credits are retirable: 1 000 + 1 500 + 1 500 = 4 000.
    expect(balance.totalAvailable).toBe(4_000);
    const row = balance.credits.find((entry) => entry.creditId === "c-2021");
    expect(row).toMatchObject({
      issuedQuantity: 2_000,
      retiredQuantity: 500,
      availableQuantity: 1_500,
      isRetirable: true,
    });
  });

  it("treats cancelled and pending credits as unavailable", () => {
    const balance = creditBalance(credits);
    const cancelled = balance.credits.find((entry) => entry.creditId === "c-cancelled");
    const pending = balance.credits.find((entry) => entry.creditId === "c-pending");
    expect(cancelled?.isRetirable).toBe(false);
    expect(cancelled?.availableQuantity).toBe(0);
    expect(pending?.isRetirable).toBe(false);
  });

  it("groups by vintage, oldest first", () => {
    const balance = creditBalance(credits);
    expect(balance.byVintage.map((entry) => entry.vintage)).toEqual([
      2018, 2019, 2021, 2022, 2023,
    ]);
    expect(balance.byVintage[1]).toMatchObject({
      vintage: 2019,
      issued: 1_000,
      available: 1_000,
      creditCount: 1,
    });
  });

  it("groups by status, omitting empty statuses", () => {
    const balance = creditBalance(credits);
    expect(balance.byStatus.map((entry) => entry.status)).toEqual([
      "ISSUED",
      "ACTIVE",
      "CANCELLED",
      "PENDING_VERIFICATION",
    ]);
    expect(balance.byStatus[1]).toMatchObject({ status: "ACTIVE", creditCount: 2, quantity: 3_000 });
  });

  it("rejects retiring more than a credit was issued for", () => {
    expect(() =>
      creditBalance(credits, [
        { creditId: "c-2019", quantity: 1_500, offsetDate: utc("2024-01-01") },
      ]),
    ).toThrow(ValidationError);
  });

  it("rejects an offset that references a credit outside the portfolio", () => {
    expect(() =>
      creditBalance(credits, [
        { creditId: "ghost", quantity: 1, offsetDate: utc("2024-01-01") },
      ]),
    ).toThrow(/not in the portfolio/);
  });

  it("rejects non-positive quantities", () => {
    expect(() => creditBalance([{ id: "z", quantity: 0, status: "ACTIVE" }])).toThrow(
      CalculationError,
    );
    expect(() =>
      creditBalance(credits, [
        { creditId: "c-2019", quantity: 0, offsetDate: utc("2024-01-01") },
      ]),
    ).toThrow(/greater than zero/);
  });

  it("handles an empty portfolio", () => {
    const balance = creditBalance([]);
    expect(balance.totalIssued).toBe(0);
    expect(balance.byVintage).toEqual([]);
    expect(balance.unit).toBe("tCO2e");
  });
});

describe("retireCredits", () => {
  it("consumes the oldest vintage first", () => {
    const result = retireCredits(credits, 1_200, {
      offsetDate: utc("2024-06-30"),
      purpose: "Voluntary neutrality claim 2024",
    });
    expect(result.offsets.map((offset) => offset.creditId)).toEqual(["c-2019", "c-2021"]);
    expect(result.offsets.map((offset) => offset.quantity)).toEqual([1_000, 200]);
    expect(result.totalRetired).toBe(1_200);
    expect(result.offsets[0]).toMatchObject({
      unit: "tCO2e",
      purpose: "Voluntary neutrality claim 2024",
      reportingYear: 2024,
    });
    expect(result.offsets[0].notes).toContain("vintage 2019");
  });

  it("marks a fully consumed credit RETIRED and leaves a partial one alone", () => {
    const result = retireCredits(credits, 1_200, { offsetDate: utc("2024-06-30") });
    expect(result.creditUpdates[0]).toMatchObject({
      creditId: "c-2019",
      retiredQuantity: 1_000,
      remainingQuantity: 0,
      status: "RETIRED",
    });
    expect(result.creditUpdates[0].retiredAt?.toISOString()).toBe("2024-06-30T00:00:00.000Z");
    expect(result.creditUpdates[1]).toMatchObject({
      creditId: "c-2021",
      remainingQuantity: 1_800,
      status: "ACTIVE",
      retiredAt: null,
    });
  });

  it("accounts for retirements already recorded", () => {
    const result = retireCredits(credits, 500, {
      offsetDate: utc("2024-06-30"),
      existingOffsets: [
        { creditId: "c-2019", quantity: 800, offsetDate: utc("2024-01-01") },
      ],
    });
    expect(result.offsets.map((offset) => offset.creditId)).toEqual(["c-2019", "c-2021"]);
    expect(result.offsets.map((offset) => offset.quantity)).toEqual([200, 300]);
  });

  it("rejects over-retirement", () => {
    expect(() => retireCredits(credits, 5_000, { offsetDate: utc("2024-06-30") })).toThrow(
      ValidationError,
    );
    expect(() => retireCredits(credits, 5_000, { offsetDate: utc("2024-06-30") })).toThrow(
      /only 4500 tCO2e is available/,
    );
  });

  it("excludes credits that have expired by the offset date", () => {
    const result = retireCredits(credits, 1_000, { offsetDate: utc("2027-01-01") });
    expect(result.offsets.map((offset) => offset.creditId)).toEqual(["c-2021"]);
    expect(result.rationale.some((line) => line.includes("expired on 2026-12-31"))).toBe(true);
  });

  it("honours a vintage filter", () => {
    const result = retireCredits(credits, 1_500, {
      vintage: 2022,
      offsetDate: utc("2024-06-30"),
    });
    expect(result.offsets.map((offset) => offset.creditId)).toEqual(["c-2022"]);
    expect(() =>
      retireCredits(credits, 2_000, { vintage: 2022, offsetDate: utc("2024-06-30") }),
    ).toThrow(/only 1500 tCO2e is available/);
  });

  it("honours a minimum vintage and a registry filter", () => {
    const recent = retireCredits(credits, 1_000, {
      minVintage: 2021,
      offsetDate: utc("2024-06-30"),
    });
    expect(recent.offsets.map((offset) => offset.creditId)).toEqual(["c-2021"]);
    expect(recent.rationale.some((line) => line.includes("predates the 2021 floor"))).toBe(
      true,
    );

    const goldStandard = retireCredits(credits, 1_500, {
      registry: "Gold Standard",
      offsetDate: utc("2024-06-30"),
    });
    expect(goldStandard.offsets.map((offset) => offset.creditId)).toEqual(["c-2022"]);
  });

  it("breaks ties within a vintage by issue date then id", () => {
    const sameVintage: CarbonCreditLike[] = [
      { id: "b", vintage: 2022, quantity: 100, status: "ACTIVE", issuedAt: utc("2023-05-01") },
      { id: "a", vintage: 2022, quantity: 100, status: "ACTIVE", issuedAt: utc("2023-01-01") },
      { id: "c", vintage: 2022, quantity: 100, status: "ACTIVE" },
    ];
    const result = retireCredits(sameVintage, 300, { offsetDate: utc("2024-01-01") });
    expect(result.offsets.map((offset) => offset.creditId)).toEqual(["a", "b", "c"]);
  });

  it("reports the remaining available quantity and a rationale", () => {
    const result = retireCredits(credits, 1_000, { offsetDate: utc("2024-06-30") });
    expect(result.remainingAvailable).toBe(3_500);
    expect(result.rationale[0]).toContain("Retired 1000 tCO2e from c-2019");
  });

  it("rejects a non-positive quantity", () => {
    expect(() => retireCredits(credits, 0)).toThrow(CalculationError);
  });
});

describe("netEmissions", () => {
  const offsets = [
    { creditId: "c-2019", quantity: 1_000, offsetDate: utc("2024-06-30"), reportingYear: 2024 },
    { creditId: "c-2021", quantity: 500, offsetDate: utc("2023-06-30"), reportingYear: 2023 },
  ];

  it("keeps gross unchanged and reports net as gross less offsets", () => {
    const result = netEmissions(10_000, offsets);
    expect(result.grossEmissions).toBe(10_000);
    expect(result.offsetQuantity).toBe(1_500);
    expect(result.netEmissions).toBe(8_500);
    expect(result.offsetShare).toBeCloseTo(0.15, 12);
    expect(result.disclosure).toContain("do not reduce the gross figure");
  });

  it("only counts offsets claimed in the requested reporting year", () => {
    const result = netEmissions(10_000, offsets, { reportingYear: 2024 });
    expect(result.offsetQuantity).toBe(1_000);
    expect(result.netEmissions).toBe(9_000);
    expect(result.offsetCount).toBe(1);
    expect(result.disclosure).toContain("in 2024");
  });

  it("never produces a negative inventory", () => {
    const result = netEmissions(800, offsets);
    expect(result.netEmissions).toBe(0);
    expect(result.excessOffsets).toBe(700);
    expect(result.grossEmissions).toBe(800);
  });

  it("handles zero offsets and rejects negative gross emissions", () => {
    const none = netEmissions(500, []);
    expect(none.netEmissions).toBe(500);
    expect(none.offsetShare).toBe(0);
    expect(() => netEmissions(-1, [])).toThrow(CalculationError);
  });
});

describe("expiringCredits", () => {
  it("lists credits expiring inside the horizon", () => {
    const report = expiringCredits(credits, utc("2026-06-01"), 365);
    expect(report.expiring.map((entry) => entry.creditId)).toEqual(["c-2019"]);
    expect(report.expiring[0].daysUntilExpiry).toBe(213);
    expect(report.expiringQuantity).toBe(1_000);
    expect(report.expired).toEqual([]);
  });

  it("separates credits that have already expired", () => {
    const report = expiringCredits(credits, utc("2027-01-01"), 365);
    expect(report.expiring).toEqual([]);
    expect(report.expired.map((entry) => entry.creditId)).toEqual(["c-2019"]);
    expect(report.expiredQuantity).toBe(1_000);
    expect(report.expired[0].daysUntilExpiry).toBeLessThan(0);
  });

  it("excludes credits outside the horizon and without an expiry date", () => {
    const report = expiringCredits(credits, utc("2024-01-01"), 30);
    expect(report.expiring).toEqual([]);
    expect(report.expired).toEqual([]);
  });

  it("nets out quantity already retired", () => {
    const report = expiringCredits(credits, utc("2026-06-01"), 365, [
      { creditId: "c-2019", quantity: 400, offsetDate: utc("2025-01-01") },
    ]);
    expect(report.expiring[0].quantity).toBe(600);
  });

  it("rejects a negative horizon", () => {
    expect(() => expiringCredits(credits, utc("2026-01-01"), -1)).toThrow(CalculationError);
  });
});
