/**
 * Carbon-finance repository.
 *
 * Balances, gross-versus-net emissions, mark-to-market value, ETS position and
 * REC/PPA coverage are all computed by the credits engines from the stored credit
 * and retirement rows, so gross emissions are never mutated by an offset.
 */

import {
  creditBalance,
  expiringCredits,
  netEmissions,
  type CarbonCreditLike,
  type CarbonOffsetLike,
} from "@/lib/domain/credits/registry";
import {
  etsPosition,
  internalCarbonPriceImpact,
  markToMarket,
  ppaCoverage,
  recCoverage,
} from "@/lib/domain/credits/pricing";
import { prisma } from "@/lib/prisma";

import { withDb } from "../db";
import {
  DEMO_CARBON_CREDITS,
  DEMO_CARBON_OFFSETS,
  DEMO_CARBON_PRICES,
  DEMO_CURRENT_YEAR,
  DEMO_ETS_POSITION,
  DEMO_INTERNAL_CARBON_PRICE,
  DEMO_PPAS,
  DEMO_RECS,
  type DemoCarbonPrice,
  type DemoInternalCarbonPrice,
} from "../demo";

import { getInventory } from "./calculation";

export async function listCarbonCredits(
  organizationId: string,
): Promise<readonly CarbonCreditLike[]> {
  return withDb<readonly CarbonCreditLike[]>(
    async () => {
      const rows = await prisma.carbonCredit.findMany({
        where: { organizationId },
        orderBy: [{ vintage: "asc" }, { issuedAt: "asc" }],
      });
      return rows.map((row) => ({
        id: row.id,
        serialNumber: row.serialNumber,
        registry: row.registry,
        projectName: row.projectName,
        projectType: row.projectType,
        vintage: row.vintage,
        quantity: row.quantity,
        unit: row.unit,
        status: row.status,
        verificationStandard: row.verificationStandard,
        country: row.country,
        methodology: row.methodology,
        issuedAt: row.issuedAt,
        retiredAt: row.retiredAt,
        expiresAt: row.expiresAt,
        price: row.price,
        currency: row.currency,
      }));
    },
    () => DEMO_CARBON_CREDITS.filter((credit) => credit.organizationId === organizationId),
  );
}

export async function listCarbonOffsets(
  organizationId: string,
): Promise<readonly CarbonOffsetLike[]> {
  return withDb<readonly CarbonOffsetLike[]>(
    async () => {
      const rows = await prisma.carbonOffset.findMany({
        where: { credit: { organizationId } },
        orderBy: { offsetDate: "asc" },
      });
      return rows.map((row) => ({
        id: row.id,
        creditId: row.creditId,
        quantity: row.quantity,
        unit: row.unit,
        offsetDate: row.offsetDate,
        purpose: row.purpose,
        reportingYear: row.reportingYear,
        notes: row.notes,
      }));
    },
    () => DEMO_CARBON_OFFSETS,
  );
}

export async function getCreditPortfolio(organizationId: string) {
  const [credits, offsets] = await Promise.all([
    listCarbonCredits(organizationId),
    listCarbonOffsets(organizationId),
  ]);
  return { credits, offsets, balance: creditBalance(credits, offsets) };
}

export async function listCarbonPrices(): Promise<readonly DemoCarbonPrice[]> {
  return withDb<readonly DemoCarbonPrice[]>(
    async () => {
      const rows = await prisma.carbonPrice.findMany({
        orderBy: { priceDate: "desc" },
        take: 200,
      });
      return rows.map((row) => ({
        market: row.market,
        region: row.region,
        price: row.price,
        currency: row.currency,
        unit: row.unit,
        priceDate: row.priceDate,
        source: row.source,
      }));
    },
    () => DEMO_CARBON_PRICES,
  );
}

export async function getInternalCarbonPrice(
  organizationId: string,
): Promise<DemoInternalCarbonPrice | null> {
  return withDb<DemoInternalCarbonPrice | null>(
    async () => {
      const row = await prisma.internalCarbonPrice.findFirst({
        where: { organizationId },
        orderBy: { effectiveFrom: "desc" },
      });
      if (!row) return null;
      return {
        id: row.id,
        organizationId: row.organizationId,
        price: row.price,
        currency: row.currency,
        unit: row.unit,
        purpose: row.purpose ?? "",
        effectiveFrom: row.effectiveFrom,
        effectiveTo: row.effectiveTo,
        methodology: row.methodology ?? "",
        approvedBy: row.approvedBy ?? "",
      };
    },
    () =>
      DEMO_INTERNAL_CARBON_PRICE.organizationId === organizationId
        ? DEMO_INTERNAL_CARBON_PRICE
        : null,
  );
}

/**
 * The carbon-finance overview: gross versus net emissions, portfolio valuation,
 * expiry warnings, ETS position, coverage and the internal carbon price impact.
 */
export async function getCarbonFinanceView(
  organizationId: string,
  options: { readonly reportingYear?: number; readonly asOf?: Date } = {},
) {
  const reportingYear = options.reportingYear ?? DEMO_CURRENT_YEAR;
  const asOf = options.asOf ?? new Date(Date.UTC(reportingYear, 11, 31));

  const [portfolio, prices, internalPrice, inventory] = await Promise.all([
    getCreditPortfolio(organizationId),
    listCarbonPrices(),
    getInternalCarbonPrice(organizationId),
    getInventory(organizationId, reportingYear),
  ]);

  const retiredThisYear = portfolio.offsets.filter(
    (offset) => offset.reportingYear === reportingYear,
  );

  const electricityMwh =
    inventory.results
      .filter(
        (result) => result.scope === "SCOPE_2_LOCATION" || result.scope === "SCOPE_2_MARKET",
      )
      .reduce((total, result) => total + result.totalCO2e, 0) > 0
      ? // Consumption is recovered from the fixture PPA/REC volumes rather than
        // re-deriving it from emissions, which would need the grid factor again.
        DEMO_PPAS.reduce((total, ppa) => total + ppa.annualVolume, 0) +
        DEMO_RECS.reduce((total, rec) => total + rec.quantity, 0) +
        30_000
      : 0;

  return {
    reportingYear,
    portfolio,
    prices,
    internalPrice,
    valuation: markToMarket(portfolio.credits, prices, { asOf }),
    expiry: expiringCredits(portfolio.credits, asOf, 365),
    net: netEmissions(inventory.totals.totalEmissions, retiredThisYear, { reportingYear }),
    ets: etsPosition({
      scheme: DEMO_ETS_POSITION.scheme,
      complianceYear: DEMO_ETS_POSITION.reportingYear,
      allocated: DEMO_ETS_POSITION.allocated,
      verified: DEMO_ETS_POSITION.verified,
      surrendered: DEMO_ETS_POSITION.surrendered,
      purchased: DEMO_ETS_POSITION.purchased,
      sold: DEMO_ETS_POSITION.sold,
      allowancePrice: DEMO_ETS_POSITION.price,
      currency: DEMO_ETS_POSITION.currency,
    }),
    ppaCoverage: ppaCoverage(
      DEMO_PPAS.map((ppa) => ({
        id: ppa.id,
        name: ppa.name,
        provider: ppa.counterparty,
        energySource: ppa.technology,
        contractType: ppa.type,
        annualVolume: ppa.annualVolume,
        volumeUnit: ppa.volumeUnit,
        pricePerUnit: ppa.price,
        currency: ppa.currency,
        startDate: ppa.startDate,
        endDate: ppa.endDate,
      })),
      electricityMwh,
      { unit: "MWh", asOf },
    ),
    recCoverage: recCoverage(
      DEMO_RECS.map((rec) => ({
        id: rec.id,
        certificateId: rec.certificateId,
        registry: rec.standard,
        energySource: rec.technology,
        quantity: rec.quantity,
        unit: rec.unit,
        isRetired: true,
        retiredAt: rec.retiredAt,
      })),
      electricityMwh,
      { unit: "MWh" },
    ),
    internalPriceImpact: internalPrice
      ? internalCarbonPriceImpact(
          { totalEmissions: inventory.totals.totalEmissions },
          {
            price: internalPrice.price,
            currency: internalPrice.currency,
            effectiveFrom: internalPrice.effectiveFrom,
            effectiveTo: internalPrice.effectiveTo,
          },
        )
      : null,
  };
}
