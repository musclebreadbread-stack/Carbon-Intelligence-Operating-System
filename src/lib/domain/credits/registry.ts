/**
 * Carbon credit registry logic: balances, retirement and net reporting.
 *
 * Two GHG Protocol rules shape everything here:
 *
 *  1. **Gross and net are separate figures.** Offsets never reduce the reported
 *     inventory; they are disclosed alongside it. `netEmissions` therefore always
 *     returns the gross figure unchanged next to the net one.
 *  2. **A credit can only be retired once.** Retirement is tracked as
 *     `CarbonOffset` rows against a credit, and over-retirement is an error, not
 *     a warning — double counting is the single failure mode that destroys the
 *     credibility of an offsetting claim.
 *
 * Retirement is FIFO by vintage: the oldest vintage is consumed first, because
 * older vintages carry more scrutiny and, in most registries, expire sooner.
 *
 * Records are shaped to `CarbonCredit` and `CarbonOffset`.
 *
 * Pure TypeScript — no framework, database or network imports.
 */

import { CREDIT_STATUSES, type CreditStatus } from "@/lib/core/enums";
import { CalculationError, ValidationError } from "@/lib/core/errors";
import { MS_PER_DAY } from "@/lib/core/period";
import { safeDivide, sum } from "@/lib/core/number";

export const DEFAULT_CREDIT_UNIT = "tCO2e";

/** Statuses whose quantity is available for retirement. */
export const RETIRABLE_STATUSES: readonly CreditStatus[] = ["ISSUED", "ACTIVE"];

/** The `CarbonCredit` fields the registry logic depends on. */
export type CarbonCreditLike = {
  readonly id: string;
  readonly serialNumber?: string | null;
  readonly registry?: string | null;
  readonly projectName?: string | null;
  readonly projectType?: string | null;
  readonly vintage?: number | null;
  readonly quantity: number;
  readonly unit?: string;
  readonly status: CreditStatus;
  readonly verificationStandard?: string | null;
  readonly country?: string | null;
  readonly methodology?: string | null;
  readonly issuedAt?: Date | null;
  readonly retiredAt?: Date | null;
  readonly expiresAt?: Date | null;
  readonly price?: number | null;
  readonly currency?: string | null;
};

/** The `CarbonOffset` fields the registry logic depends on. */
export type CarbonOffsetLike = {
  readonly id?: string;
  readonly creditId: string;
  readonly quantity: number;
  readonly unit?: string;
  readonly offsetDate: Date;
  readonly purpose?: string | null;
  readonly reportingYear?: number | null;
  readonly notes?: string | null;
};

// ---------------------------------------------------------------------------
// Balances
// ---------------------------------------------------------------------------

export type CreditBalanceRow = {
  readonly creditId: string;
  readonly serialNumber: string | null;
  readonly vintage: number | null;
  readonly status: CreditStatus;
  readonly issuedQuantity: number;
  readonly retiredQuantity: number;
  readonly availableQuantity: number;
  readonly isRetirable: boolean;
  readonly expiresAt: Date | null;
  readonly unit: string;
};

export type VintageBalance = {
  readonly vintage: number | null;
  readonly issued: number;
  readonly retired: number;
  readonly available: number;
  readonly creditCount: number;
};

export type StatusBalance = {
  readonly status: CreditStatus;
  readonly creditCount: number;
  readonly quantity: number;
};

export type CreditPortfolioBalance = {
  readonly credits: readonly CreditBalanceRow[];
  readonly byVintage: readonly VintageBalance[];
  readonly byStatus: readonly StatusBalance[];
  readonly totalIssued: number;
  readonly totalRetired: number;
  /** Quantity still retirable: excludes cancelled, expired and pending credits. */
  readonly totalAvailable: number;
  readonly unit: string;
};

function assertPositive(quantity: number, context: Record<string, unknown>): void {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new CalculationError("Credit quantity must be greater than zero", context);
  }
}

/**
 * Aggregates a credit portfolio by status and vintage, net of the retirements
 * already recorded against it.
 *
 * Retiring more than a credit was issued for is rejected here rather than being
 * silently absorbed: it means the offset ledger and the registry have diverged.
 */
export function creditBalance(
  credits: readonly CarbonCreditLike[],
  offsets: readonly CarbonOffsetLike[] = [],
): CreditPortfolioBalance {
  const unit = credits[0]?.unit ?? DEFAULT_CREDIT_UNIT;
  const creditIds = new Set(credits.map((credit) => credit.id));

  const retiredByCredit = new Map<string, number>();
  for (const offset of offsets) {
    if (!Number.isFinite(offset.quantity) || offset.quantity <= 0) {
      throw new CalculationError("Offset quantity must be greater than zero", {
        creditId: offset.creditId,
        quantity: offset.quantity,
      });
    }
    if (!creditIds.has(offset.creditId)) {
      throw new ValidationError(
        `Offset references credit ${offset.creditId}, which is not in the portfolio`,
        { creditId: offset.creditId },
      );
    }
    retiredByCredit.set(
      offset.creditId,
      (retiredByCredit.get(offset.creditId) ?? 0) + offset.quantity,
    );
  }

  const rows: CreditBalanceRow[] = credits.map((credit) => {
    assertPositive(credit.quantity, { creditId: credit.id, quantity: credit.quantity });
    const retiredQuantity = retiredByCredit.get(credit.id) ?? 0;
    if (retiredQuantity > credit.quantity + 1e-9) {
      throw new ValidationError(
        `Credit ${credit.id} has ${retiredQuantity} ${unit} retired against an issued quantity of ${credit.quantity} ${unit}`,
        { creditId: credit.id, retiredQuantity, issuedQuantity: credit.quantity },
      );
    }
    const isRetirable =
      RETIRABLE_STATUSES.includes(credit.status) && retiredQuantity < credit.quantity;
    return {
      creditId: credit.id,
      serialNumber: credit.serialNumber ?? null,
      vintage: credit.vintage ?? null,
      status: credit.status,
      issuedQuantity: credit.quantity,
      retiredQuantity,
      availableQuantity: isRetirable ? credit.quantity - retiredQuantity : 0,
      isRetirable,
      expiresAt: credit.expiresAt ?? null,
      unit: credit.unit ?? unit,
    };
  });

  const vintageMap = new Map<number | null, VintageBalance>();
  for (const row of rows) {
    const current = vintageMap.get(row.vintage) ?? {
      vintage: row.vintage,
      issued: 0,
      retired: 0,
      available: 0,
      creditCount: 0,
    };
    vintageMap.set(row.vintage, {
      vintage: row.vintage,
      issued: current.issued + row.issuedQuantity,
      retired: current.retired + row.retiredQuantity,
      available: current.available + row.availableQuantity,
      creditCount: current.creditCount + 1,
    });
  }

  const byStatus: StatusBalance[] = CREDIT_STATUSES.map((status) => {
    const matching = rows.filter((row) => row.status === status);
    return {
      status,
      creditCount: matching.length,
      quantity: sum(matching.map((row) => row.issuedQuantity)),
    };
  }).filter((entry) => entry.creditCount > 0);

  return {
    credits: rows,
    byVintage: [...vintageMap.values()].sort(
      (a, b) => (a.vintage ?? Number.POSITIVE_INFINITY) - (b.vintage ?? Number.POSITIVE_INFINITY),
    ),
    byStatus,
    totalIssued: sum(rows.map((row) => row.issuedQuantity)),
    totalRetired: sum(rows.map((row) => row.retiredQuantity)),
    totalAvailable: sum(rows.map((row) => row.availableQuantity)),
    unit,
  };
}

// ---------------------------------------------------------------------------
// Retirement
// ---------------------------------------------------------------------------

export type RetireOptions = {
  /** Restrict retirement to one vintage. */
  readonly vintage?: number;
  /** Only retire vintages at or after this year. */
  readonly minVintage?: number;
  readonly purpose?: string;
  readonly offsetDate?: Date;
  readonly reportingYear?: number;
  readonly notes?: string;
  /** Retirements already recorded, so the same credit is not spent twice. */
  readonly existingOffsets?: readonly CarbonOffsetLike[];
  /** Restrict retirement to one registry, e.g. `"Verra"`. */
  readonly registry?: string;
};

/** The `CarbonCredit` columns retirement writes back. */
export type CreditUpdate = {
  readonly creditId: string;
  readonly retiredQuantity: number;
  readonly remainingQuantity: number;
  readonly status: CreditStatus;
  readonly retiredAt: Date | null;
};

export type RetirementResult = {
  readonly offsets: readonly CarbonOffsetLike[];
  readonly creditUpdates: readonly CreditUpdate[];
  readonly totalRetired: number;
  readonly unit: string;
  /** Available quantity left in the portfolio after the retirement. */
  readonly remainingAvailable: number;
  /** Ordered explanation of the FIFO selection, for the audit trail. */
  readonly rationale: readonly string[];
};

/**
 * Retires `quantity` from the portfolio, oldest vintage first.
 *
 * Ties within a vintage are broken by `issuedAt` and then by id, so retirement is
 * deterministic. Credits that are expired at `offsetDate`, not in a retirable
 * status, or outside the vintage / registry filters are excluded. Retiring more
 * than is available throws — a partial retirement that silently under-delivers
 * would be reported as a full one.
 */
export function retireCredits(
  credits: readonly CarbonCreditLike[],
  quantity: number,
  options: RetireOptions = {},
): RetirementResult {
  assertPositive(quantity, { quantity });

  const offsetDate = options.offsetDate ?? new Date(Date.UTC(2024, 0, 1));
  const balance = creditBalance(credits, options.existingOffsets ?? []);
  const balanceById = new Map(balance.credits.map((row) => [row.creditId, row]));
  const rationale: string[] = [];

  const eligible = credits
    .filter((credit) => {
      const row = balanceById.get(credit.id);
      if (!row || !row.isRetirable || row.availableQuantity <= 0) return false;
      if (credit.expiresAt && credit.expiresAt.getTime() < offsetDate.getTime()) {
        rationale.push(
          `Excluded ${credit.id}: expired on ${credit.expiresAt.toISOString().slice(0, 10)}.`,
        );
        return false;
      }
      if (options.vintage !== undefined && credit.vintage !== options.vintage) return false;
      if (
        options.minVintage !== undefined &&
        (credit.vintage ?? Number.NEGATIVE_INFINITY) < options.minVintage
      ) {
        rationale.push(
          `Excluded ${credit.id}: vintage ${credit.vintage ?? "unknown"} predates the ${options.minVintage} floor.`,
        );
        return false;
      }
      if (options.registry !== undefined && credit.registry !== options.registry) return false;
      return true;
    })
    .sort(
      (a, b) =>
        (a.vintage ?? Number.POSITIVE_INFINITY) - (b.vintage ?? Number.POSITIVE_INFINITY) ||
        (a.issuedAt?.getTime() ?? Number.POSITIVE_INFINITY) -
          (b.issuedAt?.getTime() ?? Number.POSITIVE_INFINITY) ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );

  const availableTotal = sum(
    eligible.map((credit) => balanceById.get(credit.id)?.availableQuantity ?? 0),
  );
  if (availableTotal + 1e-9 < quantity) {
    throw new ValidationError(
      `Cannot retire ${quantity} ${balance.unit}: only ${availableTotal} ${balance.unit} is available`,
      {
        requested: quantity,
        available: availableTotal,
        vintage: options.vintage ?? null,
        registry: options.registry ?? null,
      },
    );
  }

  const offsets: CarbonOffsetLike[] = [];
  const creditUpdates: CreditUpdate[] = [];
  let outstanding = quantity;

  for (const credit of eligible) {
    if (outstanding <= 1e-9) break;
    const row = balanceById.get(credit.id);
    if (!row) continue;
    const take = Math.min(row.availableQuantity, outstanding);
    outstanding -= take;
    const remainingQuantity = credit.quantity - row.retiredQuantity - take;

    offsets.push({
      creditId: credit.id,
      quantity: take,
      unit: credit.unit ?? balance.unit,
      offsetDate,
      purpose: options.purpose ?? null,
      reportingYear: options.reportingYear ?? offsetDate.getUTCFullYear(),
      notes:
        options.notes ??
        `FIFO retirement from vintage ${credit.vintage ?? "unknown"}${credit.serialNumber ? ` (serial ${credit.serialNumber})` : ""}`,
    });
    creditUpdates.push({
      creditId: credit.id,
      retiredQuantity: row.retiredQuantity + take,
      remainingQuantity,
      status: remainingQuantity <= 1e-9 ? "RETIRED" : credit.status,
      retiredAt: remainingQuantity <= 1e-9 ? offsetDate : (credit.retiredAt ?? null),
    });
    rationale.push(
      `Retired ${take} ${credit.unit ?? balance.unit} from ${credit.id} (vintage ${credit.vintage ?? "unknown"}), leaving ${remainingQuantity}.`,
    );
  }

  return {
    offsets,
    creditUpdates,
    totalRetired: sum(offsets.map((offset) => offset.quantity)),
    unit: balance.unit,
    remainingAvailable: availableTotal - quantity,
    rationale,
  };
}

// ---------------------------------------------------------------------------
// Net reporting
// ---------------------------------------------------------------------------

export type NetEmissionsResult = {
  /** The inventory figure, unchanged by offsetting. */
  readonly grossEmissions: number;
  readonly offsetQuantity: number;
  /** Gross less offsets, floored at zero. */
  readonly netEmissions: number;
  /** Offsets beyond the gross figure; cannot create a negative inventory. */
  readonly excessOffsets: number;
  /** Share of gross emissions covered by offsets. */
  readonly offsetShare: number;
  readonly unit: string;
  readonly offsetCount: number;
  readonly disclosure: string;
};

/**
 * Reports gross and net emissions side by side.
 *
 * Offsets are only counted for the requested reporting year when one is given,
 * because a retirement can only be claimed once, in one year.
 */
export function netEmissions(
  grossEmissions: number,
  retiredOffsets: readonly CarbonOffsetLike[],
  options: { readonly reportingYear?: number; readonly unit?: string } = {},
): NetEmissionsResult {
  if (!Number.isFinite(grossEmissions) || grossEmissions < 0) {
    throw new CalculationError("Gross emissions must be a non-negative number", {
      grossEmissions,
    });
  }

  const applicable =
    options.reportingYear === undefined
      ? retiredOffsets
      : retiredOffsets.filter(
          (offset) =>
            (offset.reportingYear ?? offset.offsetDate.getUTCFullYear()) ===
            options.reportingYear,
        );

  const offsetQuantity = sum(applicable.map((offset) => offset.quantity));
  const unit = options.unit ?? applicable[0]?.unit ?? DEFAULT_CREDIT_UNIT;

  return {
    grossEmissions,
    offsetQuantity,
    netEmissions: Math.max(0, grossEmissions - offsetQuantity),
    excessOffsets: Math.max(0, offsetQuantity - grossEmissions),
    offsetShare: safeDivide(offsetQuantity, grossEmissions),
    unit,
    offsetCount: applicable.length,
    disclosure: `Gross emissions ${grossEmissions} ${unit}; ${offsetQuantity} ${unit} of credits retired${options.reportingYear === undefined ? "" : ` in ${options.reportingYear}`}; net ${Math.max(0, grossEmissions - offsetQuantity)} ${unit}. Offsets are reported separately from the inventory and do not reduce the gross figure (GHG Protocol Corporate Standard, chapter 8).`,
  };
}

// ---------------------------------------------------------------------------
// Expiry
// ---------------------------------------------------------------------------

export type ExpiringCredit = {
  readonly creditId: string;
  readonly serialNumber: string | null;
  readonly vintage: number | null;
  readonly quantity: number;
  readonly expiresAt: Date;
  readonly daysUntilExpiry: number;
  readonly isExpired: boolean;
  readonly unit: string;
};

export type ExpiryReport = {
  readonly expiring: readonly ExpiringCredit[];
  readonly expired: readonly ExpiringCredit[];
  readonly expiringQuantity: number;
  readonly expiredQuantity: number;
  readonly horizonDays: number;
  readonly asOf: Date;
  readonly unit: string;
};

/**
 * Credits expiring within `withinDays` of `asOf`, plus those already expired.
 *
 * Only retirable credits are considered: a credit that has already been retired
 * cannot expire unused. Day counts are whole days, rounded down.
 */
export function expiringCredits(
  credits: readonly CarbonCreditLike[],
  asOf: Date,
  withinDays = 365,
  offsets: readonly CarbonOffsetLike[] = [],
): ExpiryReport {
  if (!Number.isFinite(withinDays) || withinDays < 0) {
    throw new CalculationError("withinDays must be a non-negative number", { withinDays });
  }
  const balance = creditBalance(credits, offsets);
  const balanceById = new Map(balance.credits.map((row) => [row.creditId, row]));
  const horizon = asOf.getTime() + withinDays * MS_PER_DAY;

  const expiring: ExpiringCredit[] = [];
  const expired: ExpiringCredit[] = [];

  for (const credit of credits) {
    const row = balanceById.get(credit.id);
    if (!credit.expiresAt || !row || !row.isRetirable) continue;
    const daysUntilExpiry = Math.floor(
      (credit.expiresAt.getTime() - asOf.getTime()) / MS_PER_DAY,
    );
    const entry: ExpiringCredit = {
      creditId: credit.id,
      serialNumber: credit.serialNumber ?? null,
      vintage: credit.vintage ?? null,
      quantity: row.availableQuantity,
      expiresAt: credit.expiresAt,
      daysUntilExpiry,
      isExpired: credit.expiresAt.getTime() < asOf.getTime(),
      unit: row.unit,
    };
    if (entry.isExpired) expired.push(entry);
    else if (credit.expiresAt.getTime() <= horizon) expiring.push(entry);
  }

  const byExpiry = (a: ExpiringCredit, b: ExpiringCredit) =>
    a.expiresAt.getTime() - b.expiresAt.getTime() ||
    (a.creditId < b.creditId ? -1 : a.creditId > b.creditId ? 1 : 0);

  return {
    expiring: expiring.sort(byExpiry),
    expired: expired.sort(byExpiry),
    expiringQuantity: sum(expiring.map((entry) => entry.quantity)),
    expiredQuantity: sum(expired.map((entry) => entry.quantity)),
    horizonDays: withinDays,
    asOf,
    unit: balance.unit,
  };
}
