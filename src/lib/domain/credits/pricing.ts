/**
 * Carbon finance valuation: credit mark-to-market, internal carbon pricing,
 * emissions-trading compliance positions and contractual-instrument coverage.
 *
 * These are the money-side counterparts to the registry logic: what the credit
 * inventory is worth today, what a tonne costs the business internally, whether
 * the ETS position is long or short, and how much of the electricity load is
 * actually covered by PPAs and RECs.
 *
 * Records are shaped to `CarbonPrice`, `InternalCarbonPrice`, `ETSPosition`,
 * `PPA` and `RECertificate`.
 *
 * Pure TypeScript — no framework, database or network imports.
 */

import { CalculationError } from "@/lib/core/errors";
import { clamp, safeDivide, sum } from "@/lib/core/number";

import { DEFAULT_CREDIT_UNIT, type CarbonCreditLike } from "./registry";

export const DEFAULT_PRICE_CURRENCY = "USD";
export const DEFAULT_ENERGY_UNIT = "MWh";

// ---------------------------------------------------------------------------
// Mark to market
// ---------------------------------------------------------------------------

/** The `CarbonPrice` fields valuation depends on. */
export type CarbonPriceLike = {
  readonly market: string;
  readonly region?: string | null;
  readonly price: number;
  readonly currency?: string;
  readonly priceDate: Date;
  readonly source?: string | null;
};

export type CreditValuation = {
  readonly creditId: string;
  readonly quantity: number;
  /** Price the credit was acquired at, from `CarbonCredit.price`. */
  readonly bookPrice: number | null;
  readonly marketPrice: number | null;
  readonly bookValue: number | null;
  readonly marketValue: number | null;
  /** Market value less book value; `null` when either side is unknown. */
  readonly unrealisedGain: number | null;
  readonly market: string | null;
  readonly priceDate: Date | null;
  readonly currency: string;
  readonly unit: string;
};

export type MarkToMarketResult = {
  readonly valuations: readonly CreditValuation[];
  readonly totalQuantity: number;
  readonly totalBookValue: number;
  readonly totalMarketValue: number;
  readonly totalUnrealisedGain: number;
  /** Credits with no applicable market price, so excluded from the totals. */
  readonly unpricedCreditIds: readonly string[];
  readonly currency: string;
  readonly unit: string;
  readonly asOf: Date | null;
};

export type MarkToMarketOptions = {
  /** Valuation date; the latest price at or before it is used. */
  readonly asOf?: Date;
  readonly currency?: string;
  /** Fall back to the newest price of any market when the registry has none. */
  readonly allowMarketFallback?: boolean;
};

/**
 * Values a credit portfolio at market.
 *
 * A credit's market is matched against `CarbonCredit.registry`; when the registry
 * has no quoted price the newest quote of any market is used only if
 * `allowMarketFallback` is set, because valuing a Gold Standard cookstove credit
 * at an EU ETS allowance price would be materially misleading.
 */
export function markToMarket(
  credits: readonly CarbonCreditLike[],
  prices: readonly CarbonPriceLike[],
  options: MarkToMarketOptions = {},
): MarkToMarketResult {
  for (const price of prices) {
    if (!Number.isFinite(price.price) || price.price < 0) {
      throw new CalculationError("Carbon price must be a non-negative number", {
        market: price.market,
        price: price.price,
      });
    }
  }

  const asOf = options.asOf ?? null;
  const applicable = prices
    .filter((price) => asOf === null || price.priceDate.getTime() <= asOf.getTime())
    .sort((a, b) => b.priceDate.getTime() - a.priceDate.getTime());

  const latestByMarket = new Map<string, CarbonPriceLike>();
  for (const price of applicable) {
    if (!latestByMarket.has(price.market)) latestByMarket.set(price.market, price);
  }
  const fallback = options.allowMarketFallback === true ? applicable[0] : undefined;

  const currency =
    options.currency ?? applicable[0]?.currency ?? credits[0]?.currency ?? DEFAULT_PRICE_CURRENCY;
  const unit = credits[0]?.unit ?? DEFAULT_CREDIT_UNIT;

  const unpricedCreditIds: string[] = [];
  const valuations: CreditValuation[] = credits.map((credit) => {
    const quote =
      (credit.registry ? latestByMarket.get(credit.registry) : undefined) ?? fallback;
    if (!quote) unpricedCreditIds.push(credit.id);
    const bookPrice = credit.price ?? null;
    const marketPrice = quote?.price ?? null;
    const bookValue = bookPrice === null ? null : bookPrice * credit.quantity;
    const marketValue = marketPrice === null ? null : marketPrice * credit.quantity;
    return {
      creditId: credit.id,
      quantity: credit.quantity,
      bookPrice,
      marketPrice,
      bookValue,
      marketValue,
      unrealisedGain:
        bookValue === null || marketValue === null ? null : marketValue - bookValue,
      market: quote?.market ?? null,
      priceDate: quote?.priceDate ?? null,
      currency: quote?.currency ?? credit.currency ?? currency,
      unit: credit.unit ?? unit,
    };
  });

  return {
    valuations,
    totalQuantity: sum(credits.map((credit) => credit.quantity)),
    totalBookValue: sum(
      valuations.map((valuation) => valuation.bookValue ?? 0),
    ),
    totalMarketValue: sum(
      valuations.map((valuation) => valuation.marketValue ?? 0),
    ),
    totalUnrealisedGain: sum(
      valuations.map((valuation) => valuation.unrealisedGain ?? 0),
    ),
    unpricedCreditIds,
    currency,
    unit,
    asOf,
  };
}

// ---------------------------------------------------------------------------
// Internal carbon price
// ---------------------------------------------------------------------------

/** The `InternalCarbonPrice` fields the impact calculation depends on. */
export type InternalCarbonPriceLike = {
  readonly price: number;
  readonly currency?: string;
  readonly unit?: string;
  readonly purpose?: string | null;
  readonly effectiveFrom?: Date | null;
  readonly effectiveTo?: Date | null;
  readonly methodology?: string | null;
};

export type CarbonPriceImpact = {
  readonly emissions: number;
  readonly price: number;
  /** Emissions × price: the shadow cost of the inventory. */
  readonly shadowCost: number;
  readonly byScope: Readonly<Record<string, number>>;
  readonly currency: string;
  readonly emissionUnit: string;
  readonly purpose: string | null;
  readonly methodology: string;
  /** Shadow cost as a share of revenue, when revenue is supplied. */
  readonly shareOfRevenue: number | null;
};

export type CarbonPriceImpactInput = {
  readonly totalEmissions: number;
  /** Optional split, e.g. `{ scope1: 100, scope2: 200 }`. */
  readonly byScope?: Readonly<Record<string, number>>;
  readonly revenue?: number;
  readonly emissionUnit?: string;
};

/**
 * Applies an internal carbon price to an inventory.
 *
 * This is the number that makes abatement investment appraisals work: it puts
 * the emission on the same ledger as the capital that would avoid it.
 */
export function internalCarbonPriceImpact(
  input: CarbonPriceImpactInput,
  price: InternalCarbonPriceLike,
): CarbonPriceImpact {
  if (!Number.isFinite(input.totalEmissions) || input.totalEmissions < 0) {
    throw new CalculationError("Emissions must be a non-negative number", {
      totalEmissions: input.totalEmissions,
    });
  }
  if (!Number.isFinite(price.price) || price.price < 0) {
    throw new CalculationError("Internal carbon price must be a non-negative number", {
      price: price.price,
    });
  }

  const byScope: Record<string, number> = {};
  for (const [scope, emissions] of Object.entries(input.byScope ?? {})) {
    if (!Number.isFinite(emissions) || emissions < 0) {
      throw new CalculationError(`Emissions for ${scope} must be non-negative`, {
        scope,
        emissions,
      });
    }
    byScope[scope] = emissions * price.price;
  }

  const shadowCost = input.totalEmissions * price.price;

  return {
    emissions: input.totalEmissions,
    price: price.price,
    shadowCost,
    byScope,
    currency: price.currency ?? DEFAULT_PRICE_CURRENCY,
    emissionUnit: input.emissionUnit ?? DEFAULT_CREDIT_UNIT,
    purpose: price.purpose ?? null,
    methodology:
      price.methodology ??
      `Shadow price of ${price.price} ${price.currency ?? DEFAULT_PRICE_CURRENCY} ${price.unit ?? "per tCO2e"} applied to the reported inventory`,
    shareOfRevenue:
      input.revenue === undefined || input.revenue === 0
        ? null
        : safeDivide(shadowCost, input.revenue),
  };
}

// ---------------------------------------------------------------------------
// Emissions trading position
// ---------------------------------------------------------------------------

export type EtsPositionInput = {
  readonly scheme: string;
  readonly complianceYear: number;
  /** Free allocation plus any allowances already held. */
  readonly allocated: number;
  /** Verified emissions for the compliance year: the surrender obligation. */
  readonly verified: number;
  /** Allowances already surrendered against the obligation. */
  readonly surrendered?: number;
  /** Allowances bought on the market. */
  readonly purchased?: number;
  /** Allowances sold. */
  readonly sold?: number;
  readonly vintage?: number;
  /** Market price used to value a deficit or a surplus. */
  readonly allowancePrice?: number;
  /** Statutory penalty per uncovered tonne, e.g. EU ETS €100/t. */
  readonly penaltyPerTonne?: number;
  readonly currency?: string;
};

/** Plain object shaped to `ETSPosition`, plus the compliance economics. */
export type EtsPositionResult = {
  readonly scheme: string;
  readonly complianceYear: number;
  readonly vintage: number | null;
  /** `ETSPosition.allowances`: allocation plus purchases less sales. */
  readonly allowances: number;
  readonly surrendered: number;
  /** `ETSPosition.remaining`: allowances not yet surrendered. */
  readonly remaining: number;
  readonly verified: number;
  /** Allowances less the obligation; positive is long, negative is short. */
  readonly position: number;
  readonly surplus: number;
  readonly deficit: number;
  /** Cost of buying the deficit at `allowancePrice`. */
  readonly complianceCost: number;
  /** Value realisable by selling the surplus. */
  readonly surplusValue: number;
  /** Obligation not yet surrendered; exposed to the statutory penalty. */
  readonly outstandingObligation: number;
  readonly penaltyExposure: number;
  readonly status: string;
  readonly currency: string;
  readonly unit: string;
};

/**
 * Computes an emissions-trading compliance position.
 *
 * `position = allowances − verified`. A deficit has to be bought, so it produces
 * a positive `complianceCost`; a surplus can be sold or banked. `penaltyExposure`
 * is separate: it is the statutory fine on the obligation that has not yet been
 * surrendered, which is not discharged by simply owning enough allowances.
 */
export function etsPosition(input: EtsPositionInput): EtsPositionResult {
  for (const [key, value] of [
    ["allocated", input.allocated],
    ["verified", input.verified],
    ["surrendered", input.surrendered ?? 0],
    ["purchased", input.purchased ?? 0],
    ["sold", input.sold ?? 0],
  ] as const) {
    if (!Number.isFinite(value) || value < 0) {
      throw new CalculationError(`ETS ${key} must be a non-negative number`, {
        [key]: value,
      });
    }
  }

  const surrendered = input.surrendered ?? 0;
  const allowances = input.allocated + (input.purchased ?? 0) - (input.sold ?? 0);
  const position = allowances - input.verified;
  const surplus = Math.max(0, position);
  const deficit = Math.max(0, -position);
  const allowancePrice = input.allowancePrice ?? 0;
  const outstandingObligation = Math.max(0, input.verified - surrendered);

  return {
    scheme: input.scheme,
    complianceYear: input.complianceYear,
    vintage: input.vintage ?? null,
    allowances,
    surrendered,
    remaining: allowances - surrendered,
    verified: input.verified,
    position,
    surplus,
    deficit,
    complianceCost: deficit * allowancePrice,
    surplusValue: surplus * allowancePrice,
    outstandingObligation,
    penaltyExposure: outstandingObligation * (input.penaltyPerTonne ?? 0),
    status:
      outstandingObligation <= 1e-9
        ? "compliant"
        : deficit > 0
          ? "short"
          : "pending_surrender",
    currency: input.currency ?? DEFAULT_PRICE_CURRENCY,
    unit: DEFAULT_CREDIT_UNIT,
  };
}

// ---------------------------------------------------------------------------
// Contractual instrument coverage
// ---------------------------------------------------------------------------

/** The `PPA` fields coverage depends on. */
export type PpaLike = {
  readonly id: string;
  readonly name: string;
  readonly provider?: string;
  readonly energySource: string;
  readonly contractType?: string;
  readonly annualVolume?: number | null;
  readonly volumeUnit?: string | null;
  readonly pricePerUnit?: number | null;
  readonly currency?: string;
  readonly startDate: Date;
  readonly endDate?: Date | null;
  readonly status?: string;
};

export type CoverageContribution = {
  readonly id: string;
  readonly name: string;
  readonly energySource: string;
  readonly volume: number;
  /** Share of total consumption this instrument covers. */
  readonly share: number;
  readonly cost: number | null;
};

export type CoverageResult = {
  readonly consumption: number;
  readonly contractedVolume: number;
  /** Volume actually applied, capped at consumption. */
  readonly appliedVolume: number;
  /** Applied volume over consumption, 0..1. */
  readonly coverage: number;
  readonly uncoveredVolume: number;
  /** Contracted volume beyond consumption; cannot be claimed. */
  readonly excessVolume: number;
  readonly contributions: readonly CoverageContribution[];
  readonly bySource: Readonly<Record<string, number>>;
  readonly totalCost: number | null;
  readonly currency: string;
  readonly unit: string;
  readonly instrumentCount: number;
};

function assertConsumption(consumption: number): void {
  if (!Number.isFinite(consumption) || consumption < 0) {
    throw new CalculationError("Consumption must be a non-negative number", {
      consumption,
    });
  }
}

function buildCoverage(
  consumption: number,
  contributions: readonly CoverageContribution[],
  unit: string,
  currency: string,
  hasCost: boolean,
): CoverageResult {
  const contractedVolume = sum(contributions.map((entry) => entry.volume));
  const appliedVolume = Math.min(contractedVolume, consumption);
  const bySource: Record<string, number> = {};
  for (const entry of contributions) {
    bySource[entry.energySource] = (bySource[entry.energySource] ?? 0) + entry.volume;
  }
  return {
    consumption,
    contractedVolume,
    appliedVolume,
    coverage: clamp(safeDivide(appliedVolume, consumption), 0, 1),
    uncoveredVolume: Math.max(0, consumption - contractedVolume),
    excessVolume: Math.max(0, contractedVolume - consumption),
    contributions,
    bySource,
    totalCost: hasCost ? sum(contributions.map((entry) => entry.cost ?? 0)) : null,
    currency,
    unit,
    instrumentCount: contributions.length,
  };
}

/**
 * Share of electricity consumption covered by power purchase agreements.
 *
 * Only contracts active during the reporting period count, and coverage is capped
 * at consumption — over-contracted volume cannot be claimed against a load that
 * does not exist, which is the same guard the market-based Scope 2 engine applies.
 */
export function ppaCoverage(
  ppas: readonly PpaLike[],
  consumption: number,
  options: {
    readonly asOf?: Date;
    readonly unit?: string;
    readonly currency?: string;
  } = {},
): CoverageResult {
  assertConsumption(consumption);
  const asOf = options.asOf;
  const unit = options.unit ?? ppas[0]?.volumeUnit ?? DEFAULT_ENERGY_UNIT;
  const currency = options.currency ?? ppas[0]?.currency ?? DEFAULT_PRICE_CURRENCY;

  const active = ppas.filter((ppa) => {
    if ((ppa.status ?? "active").toLowerCase() !== "active") return false;
    if (asOf === undefined) return true;
    if (ppa.startDate.getTime() > asOf.getTime()) return false;
    if (ppa.endDate && ppa.endDate.getTime() < asOf.getTime()) return false;
    return true;
  });

  const contributions: CoverageContribution[] = active.map((ppa) => {
    const volume = ppa.annualVolume ?? 0;
    if (!Number.isFinite(volume) || volume < 0) {
      throw new CalculationError("PPA annual volume must be a non-negative number", {
        ppaId: ppa.id,
        annualVolume: ppa.annualVolume,
      });
    }
    return {
      id: ppa.id,
      name: ppa.name,
      energySource: ppa.energySource,
      volume,
      share: clamp(safeDivide(volume, consumption), 0, 1),
      cost: ppa.pricePerUnit === undefined || ppa.pricePerUnit === null
        ? null
        : ppa.pricePerUnit * volume,
    };
  });

  return buildCoverage(
    consumption,
    contributions,
    unit,
    currency,
    contributions.some((entry) => entry.cost !== null),
  );
}

/** The `RECertificate` fields coverage depends on. */
export type RecertificateLike = {
  readonly id: string;
  readonly certificateId?: string | null;
  readonly registry?: string | null;
  readonly energySource: string;
  readonly quantity: number;
  readonly unit?: string;
  readonly generationStart?: Date | null;
  readonly generationEnd?: Date | null;
  readonly isRetired?: boolean;
  readonly retiredAt?: Date | null;
};

/**
 * Share of electricity consumption covered by renewable energy certificates.
 *
 * Only **retired** (cancelled) certificates count by default: the Scope 2
 * Guidance requires the instrument to be retired on the reporting entity's behalf
 * before the attribute may be claimed. Pass `includeUnretired` to model a
 * forward position rather than a reportable claim.
 */
export function recCoverage(
  certificates: readonly RecertificateLike[],
  consumption: number,
  options: {
    readonly includeUnretired?: boolean;
    readonly unit?: string;
    readonly period?: { readonly start: Date; readonly end: Date };
  } = {},
): CoverageResult {
  assertConsumption(consumption);
  const unit = options.unit ?? certificates[0]?.unit ?? DEFAULT_ENERGY_UNIT;

  const eligible = certificates.filter((certificate) => {
    if (options.includeUnretired !== true && certificate.isRetired !== true) return false;
    if (options.period) {
      const start = certificate.generationStart?.getTime();
      const end = certificate.generationEnd?.getTime();
      if (start !== undefined && start > options.period.end.getTime()) return false;
      if (end !== undefined && end < options.period.start.getTime()) return false;
    }
    return true;
  });

  const contributions: CoverageContribution[] = eligible.map((certificate) => {
    if (!Number.isFinite(certificate.quantity) || certificate.quantity < 0) {
      throw new CalculationError("REC quantity must be a non-negative number", {
        certificateId: certificate.id,
        quantity: certificate.quantity,
      });
    }
    return {
      id: certificate.id,
      name: certificate.certificateId ?? certificate.id,
      energySource: certificate.energySource,
      volume: certificate.quantity,
      share: clamp(safeDivide(certificate.quantity, consumption), 0, 1),
      cost: null,
    };
  });

  return buildCoverage(consumption, contributions, unit, DEFAULT_PRICE_CURRENCY, false);
}
