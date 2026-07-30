/**
 * Investment appraisal for decarbonisation projects.
 *
 * Standard discounted cash-flow measures — NPV, IRR, payback, ROI — plus the
 * levelised cost of abatement, which is the measure that lets projects with
 * different lifetimes and different abatement volumes be ranked against each
 * other on a MACC.
 *
 * Cash-flow convention: `cashflows[0]` occurs at t = 0 and is **not**
 * discounted; `cashflows[n]` occurs at the end of year n. Outflows are negative.
 *
 * Results are shaped to the `InvestmentAnalysis` model.
 *
 * Pure TypeScript — no framework, database or network imports.
 */

import { CalculationError } from "@/lib/core/errors";
import { safeDivide, sum } from "@/lib/core/number";

export const DEFAULT_DISCOUNT_RATE = 0.08;
export const DEFAULT_CURRENCY = "USD";

// ---------------------------------------------------------------------------
// Net present value
// ---------------------------------------------------------------------------

/**
 * Net present value of a cash-flow series at `discountRate`.
 *
 * `NPV = Σ CFₜ / (1 + r)ᵗ` with the first element at t = 0.
 */
export function npv(cashflows: readonly number[], discountRate: number): number {
  if (cashflows.length === 0) {
    throw new CalculationError("npv requires at least one cash flow", {});
  }
  if (!Number.isFinite(discountRate) || discountRate <= -1) {
    throw new CalculationError("Discount rate must be finite and greater than −1", {
      discountRate,
    });
  }
  let total = 0;
  for (let period = 0; period < cashflows.length; period += 1) {
    const flow = cashflows[period];
    if (!Number.isFinite(flow)) {
      throw new CalculationError("Cash flows must be finite", { period, flow });
    }
    total += flow / (1 + discountRate) ** period;
  }
  return total;
}

// ---------------------------------------------------------------------------
// Internal rate of return
// ---------------------------------------------------------------------------

/**
 * Search bounds for `irr`.
 *
 * The lower bound stops just short of −100 %, where the discount factor is
 * singular; the upper bound of 1000 %/yr comfortably covers any real energy
 * project. A rate outside these bounds is reported as non-convergence rather
 * than being silently clamped.
 */
export const IRR_LOWER_BOUND = -0.9999;
export const IRR_UPPER_BOUND = 10;
export const IRR_TOLERANCE = 1e-10;
export const IRR_MAX_ITERATIONS = 300;

export type IrrOptions = {
  readonly lowerBound?: number;
  readonly upperBound?: number;
  readonly tolerance?: number;
  readonly maxIterations?: number;
};

/**
 * Internal rate of return by bisection.
 *
 * Bisection rather than Newton–Raphson because it cannot diverge and needs no
 * derivative: with a bracketed sign change it always converges, which matters
 * more than speed for a handful of cash flows. A series with no sign change (all
 * inflows or all outflows) has no IRR and throws.
 */
export function irr(cashflows: readonly number[], options: IrrOptions = {}): number {
  if (cashflows.length < 2) {
    throw new CalculationError("irr requires at least two cash flows", {
      periods: cashflows.length,
    });
  }
  const hasPositive = cashflows.some((flow) => flow > 0);
  const hasNegative = cashflows.some((flow) => flow < 0);
  if (!hasPositive || !hasNegative) {
    throw new CalculationError(
      "irr requires at least one positive and one negative cash flow",
      { cashflows },
    );
  }

  const lower = options.lowerBound ?? IRR_LOWER_BOUND;
  const upper = options.upperBound ?? IRR_UPPER_BOUND;
  const tolerance = options.tolerance ?? IRR_TOLERANCE;
  const maxIterations = options.maxIterations ?? IRR_MAX_ITERATIONS;

  let low = lower;
  let high = upper;
  let npvLow = npv(cashflows, low);
  const npvHigh = npv(cashflows, high);

  if (npvLow === 0) return low;
  if (npvHigh === 0) return high;
  if (Math.sign(npvLow) === Math.sign(npvHigh)) {
    throw new CalculationError(
      `IRR did not converge: no sign change in [${lower}, ${upper}]`,
      { npvAtLowerBound: npvLow, npvAtUpperBound: npvHigh },
    );
  }

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    const mid = (low + high) / 2;
    const npvMid = npv(cashflows, mid);
    if (Math.abs(npvMid) < tolerance || high - low < tolerance) return mid;
    if (Math.sign(npvMid) === Math.sign(npvLow)) {
      low = mid;
      npvLow = npvMid;
    } else {
      high = mid;
    }
  }

  throw new CalculationError(
    `IRR did not converge within ${maxIterations} iterations`,
    { low, high },
  );
}

// ---------------------------------------------------------------------------
// Payback and ROI
// ---------------------------------------------------------------------------

export type PaybackOptions = {
  /** Discount the cash flows before accumulating them. Off by default. */
  readonly discountRate?: number;
};

/**
 * Payback period in years, interpolated inside the year the cumulative cash
 * flow turns positive. Returns `null` when the project never pays back.
 */
export function paybackPeriod(
  cashflows: readonly number[],
  options: PaybackOptions = {},
): number | null {
  if (cashflows.length === 0) {
    throw new CalculationError("paybackPeriod requires at least one cash flow", {});
  }
  const rate = options.discountRate;
  const discounted =
    rate === undefined
      ? [...cashflows]
      : cashflows.map((flow, period) => flow / (1 + rate) ** period);

  let cumulative = 0;
  for (let period = 0; period < discounted.length; period += 1) {
    const previous = cumulative;
    cumulative += discounted[period];
    if (cumulative >= 0 && period > 0) {
      const flow = discounted[period];
      // previous is negative here, so the fractional part is well defined.
      const fraction = flow === 0 ? 0 : -previous / flow;
      return period - 1 + fraction;
    }
    if (cumulative >= 0 && period === 0) return 0;
  }
  return null;
}

/** Simple return on investment: net benefit over the initial outlay. */
export function roi(input: {
  readonly totalBenefit: number;
  readonly totalCost: number;
}): number {
  if (input.totalCost === 0) {
    throw new CalculationError("roi requires a non-zero total cost", {
      totalCost: input.totalCost,
    });
  }
  return (input.totalBenefit - input.totalCost) / Math.abs(input.totalCost);
}

// ---------------------------------------------------------------------------
// Levelised cost of abatement
// ---------------------------------------------------------------------------

export type LcoaInput = {
  readonly capex: number;
  readonly annualOpex?: number;
  /** Annual operating saving the measure delivers, e.g. avoided energy spend. */
  readonly annualSavings?: number;
  /** Tonnes of CO2e abated each year. */
  readonly annualAbatement: number;
  readonly projectLifeYears: number;
  readonly discountRate?: number;
  /** Residual value recovered at the end of the project life. */
  readonly salvageValue?: number;
  /**
   * Discount the abatement volumes as well as the money. Off by default, which
   * matches the convention used by most published MACCs.
   */
  readonly discountAbatement?: boolean;
};

export type LcoaResult = {
  /** Cost per tonne abated. Negative means the measure pays for itself. */
  readonly lcoa: number;
  readonly npvOfNetCost: number;
  readonly totalAbatement: number;
  readonly discountedAbatement: number;
  readonly currencyPerTonne: string;
  readonly methodology: string;
};

/**
 * Levelised cost of abatement: the present value of the net cost divided by the
 * abatement it buys. This is the y-axis of a MACC — a negative value is a
 * no-regret measure that saves money *and* abates.
 */
export function levelizedCostOfAbatement(input: LcoaInput): LcoaResult {
  if (!Number.isInteger(input.projectLifeYears) || input.projectLifeYears < 1) {
    throw new CalculationError("projectLifeYears must be a positive integer", {
      projectLifeYears: input.projectLifeYears,
    });
  }
  if (!Number.isFinite(input.annualAbatement) || input.annualAbatement <= 0) {
    throw new CalculationError("annualAbatement must be greater than zero", {
      annualAbatement: input.annualAbatement,
    });
  }

  const discountRate = input.discountRate ?? DEFAULT_DISCOUNT_RATE;
  const annualNetCost = (input.annualOpex ?? 0) - (input.annualSavings ?? 0);

  const costFlows: number[] = [input.capex];
  const abatementFlows: number[] = [0];
  for (let year = 1; year <= input.projectLifeYears; year += 1) {
    const salvage = year === input.projectLifeYears ? (input.salvageValue ?? 0) : 0;
    costFlows.push(annualNetCost - salvage);
    abatementFlows.push(input.annualAbatement);
  }

  const npvOfNetCost = npv(costFlows, discountRate);
  const discountedAbatement = sum(
    abatementFlows.map((volume, period) => volume / (1 + discountRate) ** period),
  );
  const totalAbatement = input.annualAbatement * input.projectLifeYears;
  const denominator = input.discountAbatement ? discountedAbatement : totalAbatement;

  return {
    lcoa: safeDivide(npvOfNetCost, denominator),
    npvOfNetCost,
    totalAbatement,
    discountedAbatement,
    currencyPerTonne: "per tCO2e",
    methodology: `Present value of net cost at ${(discountRate * 100).toFixed(1)} % over ${input.projectLifeYears} year(s), divided by ${input.discountAbatement ? "discounted" : "undiscounted"} lifetime abatement`,
  };
}

// ---------------------------------------------------------------------------
// Full appraisal
// ---------------------------------------------------------------------------

export const RISK_LEVELS = ["LOW", "MEDIUM", "HIGH"] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export type InvestmentInput = {
  readonly name: string;
  readonly description?: string;
  readonly capex: number;
  /** Recurring annual operating cost. */
  readonly opex?: number;
  /** Recurring annual saving (energy, maintenance, avoided carbon cost). */
  readonly annualSavings?: number;
  readonly projectLifeYears: number;
  readonly discountRate?: number;
  readonly currency?: string;
  readonly salvageValue?: number;
  /** Tonnes of CO2e abated each year, for the abatement-cost line. */
  readonly annualAbatement?: number;
  /** Carbon price used to monetise the abatement, per tonne. */
  readonly carbonPrice?: number;
  readonly riskLevel?: RiskLevel;
  readonly assumptions?: Readonly<Record<string, number | string | boolean | null>>;
};

/** Plain object shaped to the `InvestmentAnalysis` model, plus the detail. */
export type InvestmentAnalysisRecord = {
  readonly name: string;
  readonly description: string | null;
  readonly capex: number;
  readonly opex: number;
  readonly annualSavings: number;
  readonly roi: number;
  readonly irr: number | null;
  readonly npv: number;
  readonly paybackPeriod: number | null;
  readonly currency: string;
  readonly discountRate: number;
  readonly projectLifeYears: number;
  readonly riskLevel: RiskLevel;
  readonly assumptions: Readonly<Record<string, number | string | boolean | null>>;
  /** The cash-flow series the measures were computed from. */
  readonly cashflows: readonly number[];
  /** Levelised cost of abatement, when an abatement volume was supplied. */
  readonly abatementCost: LcoaResult | null;
  /** Reason the risk level was assigned. */
  readonly riskRationale: string;
};

/**
 * Appraises one investment.
 *
 * The annual net benefit is `annualSavings − opex + annualAbatement ×
 * carbonPrice`, so an internal carbon price makes an otherwise marginal measure
 * bankable — which is the whole point of setting one.
 *
 * When the cash flows have no sign change (a measure with no upfront cost, or
 * one that never returns anything) `irr` is `null` rather than an error: the
 * project is still appraisable via NPV.
 */
export function analyseInvestment(input: InvestmentInput): InvestmentAnalysisRecord {
  if (!Number.isInteger(input.projectLifeYears) || input.projectLifeYears < 1) {
    throw new CalculationError("projectLifeYears must be a positive integer", {
      projectLifeYears: input.projectLifeYears,
    });
  }
  if (!Number.isFinite(input.capex)) {
    throw new CalculationError("capex must be finite", { capex: input.capex });
  }

  const discountRate = input.discountRate ?? DEFAULT_DISCOUNT_RATE;
  const opex = input.opex ?? 0;
  const annualSavings = input.annualSavings ?? 0;
  const carbonBenefit = (input.annualAbatement ?? 0) * (input.carbonPrice ?? 0);
  const annualNet = annualSavings - opex + carbonBenefit;

  const cashflows: number[] = [-input.capex];
  for (let year = 1; year <= input.projectLifeYears; year += 1) {
    const salvage = year === input.projectLifeYears ? (input.salvageValue ?? 0) : 0;
    cashflows.push(annualNet + salvage);
  }

  const netPresentValue = npv(cashflows, discountRate);
  const payback = paybackPeriod(cashflows);

  let internalRate: number | null = null;
  try {
    internalRate = irr(cashflows);
  } catch {
    // No sign change, or no root inside the search bounds: report NPV only.
    internalRate = null;
  }

  const totalBenefit = sum(cashflows.slice(1));
  const returnOnInvestment =
    input.capex === 0 ? Number.POSITIVE_INFINITY : roi({ totalBenefit, totalCost: input.capex });

  let riskLevel: RiskLevel;
  let riskRationale: string;
  if (input.riskLevel !== undefined) {
    riskLevel = input.riskLevel;
    riskRationale = "Risk level supplied by the analyst.";
  } else if (netPresentValue <= 0) {
    riskLevel = "HIGH";
    riskRationale = `NPV is ${netPresentValue.toFixed(0)} ${input.currency ?? DEFAULT_CURRENCY} at a ${(discountRate * 100).toFixed(1)} % discount rate: the measure does not clear the hurdle rate.`;
  } else if (payback !== null && payback <= 3) {
    riskLevel = "LOW";
    riskRationale = `Positive NPV with a ${payback.toFixed(1)} year payback.`;
  } else {
    riskLevel = "MEDIUM";
    riskRationale = `Positive NPV but a ${payback === null ? "non-existent" : `${payback.toFixed(1)} year`} payback.`;
  }

  const abatementCost =
    input.annualAbatement === undefined || input.annualAbatement <= 0
      ? null
      : levelizedCostOfAbatement({
          capex: input.capex,
          annualOpex: opex,
          annualSavings,
          annualAbatement: input.annualAbatement,
          projectLifeYears: input.projectLifeYears,
          discountRate,
          salvageValue: input.salvageValue,
        });

  return {
    name: input.name,
    description: input.description ?? null,
    capex: input.capex,
    opex,
    annualSavings,
    roi: returnOnInvestment,
    irr: internalRate,
    npv: netPresentValue,
    paybackPeriod: payback,
    currency: input.currency ?? DEFAULT_CURRENCY,
    discountRate,
    projectLifeYears: input.projectLifeYears,
    riskLevel,
    assumptions: {
      ...(input.assumptions ?? {}),
      annualNetCashflow: annualNet,
      carbonPrice: input.carbonPrice ?? null,
      annualAbatement: input.annualAbatement ?? null,
      salvageValue: input.salvageValue ?? 0,
    },
    cashflows,
    abatementCost,
    riskRationale,
  };
}
