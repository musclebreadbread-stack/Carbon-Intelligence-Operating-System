/**
 * Carbon budget consumption.
 *
 * A carbon budget is a finite cumulative allowance for a period — the corporate
 * analogue of the remaining global budget for a temperature outcome. What
 * matters is not the annual figure but the *running total*: a company can be
 * below its annual pathway every year and still overshoot its budget.
 *
 * `consumeBudget` walks a year series (reported actuals or a projected scenario
 * from `projectScenario`) against a `CarbonBudget` and reports the used and
 * remaining allowance, the first overshoot year, and the annual allowance the
 * remaining years still permit.
 *
 * Pure TypeScript — no framework, database or network imports.
 */

import { CalculationError } from "@/lib/core/errors";
import { safeDivide } from "@/lib/core/number";

export const DEFAULT_BUDGET_UNIT = "tCO2e";

/** The `CarbonBudget` fields the calculation depends on. */
export type CarbonBudgetLike = {
  readonly id?: string;
  readonly name?: string;
  readonly totalBudget: number;
  readonly startYear: number;
  readonly endYear: number;
  readonly unit?: string;
  /** Temperature outcome the budget is derived for, e.g. 1.5. */
  readonly temperature?: number | null;
  readonly methodology?: string | null;
};

/** One year of budget consumption. */
export type BudgetYear = {
  readonly year: number;
  readonly emissions: number;
  readonly cumulativeEmissions: number;
  readonly remainingBudget: number;
  /** Share of the total budget consumed by the end of this year. */
  readonly utilisation: number;
  readonly isOvershoot: boolean;
  /** Straight-line allowance for the year, for comparison. */
  readonly linearAllowance: number;
};

/** Plain object shaped to the mutable columns of `CarbonBudget`, plus detail. */
export type BudgetConsumption = {
  readonly totalBudget: number;
  readonly usedBudget: number;
  readonly remainingBudget: number;
  readonly unit: string;
  readonly startYear: number;
  readonly endYear: number;
  /** `"active"`, `"exhausted"` once the budget is fully consumed. */
  readonly status: string;
  readonly utilisation: number;
  /** First year the running total exceeds the budget, or `null`. */
  readonly overshootYear: number | null;
  /** Amount by which the series exceeds the budget; 0 when within it. */
  readonly overshootAmount: number;
  readonly years: readonly BudgetYear[];
  /** Years of the budget period with no data point. */
  readonly missingYears: readonly number[];
  /** Series years that fall outside the budget period and were ignored. */
  readonly excludedYears: readonly number[];
  /**
   * Even annual allowance for the years after the last reported one. `null`
   * when the budget is already exhausted or the period has ended.
   */
  readonly remainingAnnualAllowance: number | null;
  readonly methodology: string;
};

export type BudgetYearInput = {
  readonly year: number;
  readonly emissions: number;
};

/**
 * Applies a year series against a budget.
 *
 * Only years inside `[startYear, endYear]` count; anything else is reported in
 * `excludedYears` rather than silently dropped. Duplicate years for the same
 * budget are an error — they almost always mean two inventories were merged by
 * mistake, and quietly summing them would understate the remaining budget.
 */
export function consumeBudget(
  budget: CarbonBudgetLike,
  series: readonly BudgetYearInput[],
): BudgetConsumption {
  if (!Number.isInteger(budget.startYear) || !Number.isInteger(budget.endYear)) {
    throw new CalculationError("Budget years must be integers", {
      startYear: budget.startYear,
      endYear: budget.endYear,
    });
  }
  if (budget.endYear < budget.startYear) {
    throw new CalculationError("Budget end year precedes its start year", {
      startYear: budget.startYear,
      endYear: budget.endYear,
    });
  }
  if (!Number.isFinite(budget.totalBudget) || budget.totalBudget < 0) {
    throw new CalculationError("Budget total must be a non-negative number", {
      totalBudget: budget.totalBudget,
    });
  }

  const unit = budget.unit ?? DEFAULT_BUDGET_UNIT;
  const periodYears = budget.endYear - budget.startYear + 1;
  const linearAllowance = budget.totalBudget / periodYears;

  const inPeriod: BudgetYearInput[] = [];
  const excludedYears: number[] = [];
  const seen = new Set<number>();

  for (const entry of [...series].sort((a, b) => a.year - b.year)) {
    if (!Number.isFinite(entry.emissions) || entry.emissions < 0) {
      throw new CalculationError("Budget series emissions must be non-negative", {
        year: entry.year,
        emissions: entry.emissions,
      });
    }
    if (entry.year < budget.startYear || entry.year > budget.endYear) {
      excludedYears.push(entry.year);
      continue;
    }
    if (seen.has(entry.year)) {
      throw new CalculationError(`Duplicate budget series entry for ${entry.year}`, {
        year: entry.year,
      });
    }
    seen.add(entry.year);
    inPeriod.push(entry);
  }

  const years: BudgetYear[] = [];
  let cumulativeEmissions = 0;
  let overshootYear: number | null = null;

  for (const entry of inPeriod) {
    cumulativeEmissions += entry.emissions;
    const isOvershoot = cumulativeEmissions > budget.totalBudget;
    if (isOvershoot && overshootYear === null) overshootYear = entry.year;
    years.push({
      year: entry.year,
      emissions: entry.emissions,
      cumulativeEmissions,
      remainingBudget: budget.totalBudget - cumulativeEmissions,
      utilisation: safeDivide(cumulativeEmissions, budget.totalBudget),
      isOvershoot,
      linearAllowance,
    });
  }

  const missingYears: number[] = [];
  for (let year = budget.startYear; year <= budget.endYear; year += 1) {
    if (!seen.has(year)) missingYears.push(year);
  }

  const usedBudget = cumulativeEmissions;
  const remainingBudget = budget.totalBudget - usedBudget;
  const lastReportedYear = inPeriod.length > 0 ? inPeriod[inPeriod.length - 1].year : null;
  const yearsLeft =
    lastReportedYear === null ? periodYears : budget.endYear - lastReportedYear;

  return {
    totalBudget: budget.totalBudget,
    usedBudget,
    remainingBudget,
    unit,
    startYear: budget.startYear,
    endYear: budget.endYear,
    status: remainingBudget <= 0 ? "exhausted" : "active",
    utilisation: safeDivide(usedBudget, budget.totalBudget),
    overshootYear,
    overshootAmount: Math.max(0, usedBudget - budget.totalBudget),
    years,
    missingYears,
    excludedYears,
    remainingAnnualAllowance:
      yearsLeft <= 0 || remainingBudget <= 0 ? null : remainingBudget / yearsLeft,
    methodology:
      budget.methodology ??
      `Cumulative consumption of a ${budget.totalBudget} ${unit} budget over ${budget.startYear}–${budget.endYear}` +
        (budget.temperature === undefined || budget.temperature === null
          ? ""
          : ` aligned to ${budget.temperature} °C`),
  };
}

/**
 * Budget implied by a linear contraction pathway.
 *
 * The area under a linear pathway between two endpoints is the average of the
 * endpoints times the number of years, which is the cumulative allowance the
 * pathway itself grants.
 */
export function budgetFromPathway(input: {
  readonly startYear: number;
  readonly endYear: number;
  readonly startEmissions: number;
  readonly endEmissions: number;
  readonly unit?: string;
  readonly temperature?: number;
}): CarbonBudgetLike & { readonly totalBudget: number } {
  if (input.endYear < input.startYear) {
    throw new CalculationError("Pathway end year precedes its start year", {
      startYear: input.startYear,
      endYear: input.endYear,
    });
  }
  const years = input.endYear - input.startYear + 1;
  return {
    name: `Budget implied by the ${input.startYear}–${input.endYear} pathway`,
    totalBudget: ((input.startEmissions + input.endEmissions) / 2) * years,
    startYear: input.startYear,
    endYear: input.endYear,
    unit: input.unit ?? DEFAULT_BUDGET_UNIT,
    temperature: input.temperature ?? null,
    methodology:
      "Trapezoidal integration of the linear contraction pathway between its endpoints",
  };
}
