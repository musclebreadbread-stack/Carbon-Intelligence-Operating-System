/**
 * Marginal abatement cost curve (MACC) construction and least-cost portfolio
 * selection.
 *
 * A MACC is the set of available abatement measures sorted by cost per tonne,
 * drawn as a step function: the width of each step is the measure's abatement
 * potential and its height is the marginal cost. Measures below the axis
 * (negative cost) save money as well as carbon, so they are always taken first.
 *
 * Points are shaped to the `MACCCurve` model; `selectPortfolio` walks the curve
 * greedily, which is provably least-cost for a linear knapsack with divisible
 * measures.
 *
 * Pure TypeScript — no framework, database or network imports.
 */

import { CalculationError } from "@/lib/core/errors";
import { safeDivide, sum } from "@/lib/core/number";

export const DEFAULT_MACC_CURRENCY = "USD";

/** The `AbatementTechnology` fields the curve depends on. */
export type AbatementTechnologyLike = {
  readonly id: string;
  readonly name: string;
  readonly category?: string | null;
  /** Tonnes of CO2e the measure can abate in the curve year. */
  readonly abatementPotential: number;
  /** Cost per tonne abated; negative for a net-saving measure. */
  readonly costPerTonne: number;
  readonly technologyReadiness?: number | null;
  readonly applicableSectors?: readonly string[];
  readonly region?: string | null;
  readonly sector?: string | null;
};

/** One step of the curve, shaped to the `MACCCurve` model. */
export type MaccPoint = {
  readonly technologyId: string;
  readonly name: string;
  readonly category: string | null;
  readonly abatementPotential: number;
  readonly marginalCost: number;
  readonly cumulativeAbatement: number;
  /** Cumulative abatement before this step; the left edge of the bar. */
  readonly cumulativeAbatementStart: number;
  readonly year: number;
  readonly region: string | null;
  readonly sector: string | null;
  readonly currency: string;
  /** `marginalCost × abatementPotential`: total cost of taking the whole step. */
  readonly stepCost: number;
  readonly cumulativeCost: number;
  readonly rank: number;
};

export type MaccCurve = {
  readonly points: readonly MaccPoint[];
  readonly year: number;
  readonly currency: string;
  readonly totalAbatementPotential: number;
  readonly totalCost: number;
  /** Abatement available at zero or negative cost. */
  readonly negativeCostAbatement: number;
  /** Weighted average cost per tonne across the whole curve. */
  readonly averageCost: number;
};

export type BuildMaccOptions = {
  readonly currency?: string;
  readonly region?: string | null;
  readonly sector?: string | null;
  /** Drop measures below this technology-readiness level (1–9). */
  readonly minTechnologyReadiness?: number;
};

/**
 * Builds a MACC for one year.
 *
 * Ties are broken by the larger abatement potential and then by id, so the curve
 * is deterministic regardless of the input order — a curve whose bars move
 * between runs cannot be put in a board pack.
 */
export function buildMaccCurve(
  technologies: readonly AbatementTechnologyLike[],
  year: number,
  options: BuildMaccOptions = {},
): MaccCurve {
  if (!Number.isInteger(year)) {
    throw new CalculationError("MACC year must be an integer", { year });
  }
  const currency = options.currency ?? DEFAULT_MACC_CURRENCY;

  const eligible = technologies.filter((technology) => {
    if (!Number.isFinite(technology.abatementPotential) || technology.abatementPotential <= 0) {
      throw new CalculationError(
        `Abatement potential for ${technology.id} must be greater than zero`,
        { technologyId: technology.id, abatementPotential: technology.abatementPotential },
      );
    }
    if (!Number.isFinite(technology.costPerTonne)) {
      throw new CalculationError(`Cost per tonne for ${technology.id} must be finite`, {
        technologyId: technology.id,
        costPerTonne: technology.costPerTonne,
      });
    }
    if (
      options.minTechnologyReadiness !== undefined &&
      (technology.technologyReadiness ?? 0) < options.minTechnologyReadiness
    ) {
      return false;
    }
    return true;
  });

  const sorted = [...eligible].sort(
    (a, b) =>
      a.costPerTonne - b.costPerTonne ||
      b.abatementPotential - a.abatementPotential ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );

  const points: MaccPoint[] = [];
  let cumulativeAbatement = 0;
  let cumulativeCost = 0;

  sorted.forEach((technology, index) => {
    const stepCost = technology.costPerTonne * technology.abatementPotential;
    const start = cumulativeAbatement;
    cumulativeAbatement += technology.abatementPotential;
    cumulativeCost += stepCost;
    points.push({
      technologyId: technology.id,
      name: technology.name,
      category: technology.category ?? null,
      abatementPotential: technology.abatementPotential,
      marginalCost: technology.costPerTonne,
      cumulativeAbatement,
      cumulativeAbatementStart: start,
      year,
      region: technology.region ?? options.region ?? null,
      sector: technology.sector ?? options.sector ?? null,
      currency,
      stepCost,
      cumulativeCost,
      rank: index + 1,
    });
  });

  return {
    points,
    year,
    currency,
    totalAbatementPotential: cumulativeAbatement,
    totalCost: cumulativeCost,
    negativeCostAbatement: sum(
      points.filter((point) => point.marginalCost <= 0).map((point) => point.abatementPotential),
    ),
    averageCost: safeDivide(cumulativeCost, cumulativeAbatement),
  };
}

// ---------------------------------------------------------------------------
// Portfolio selection
// ---------------------------------------------------------------------------

export type PortfolioConstraints = {
  /** Tonnes of CO2e the portfolio must deliver. */
  readonly abatementTarget?: number;
  /** Maximum total spend. Negative-cost measures do not consume budget. */
  readonly budget?: number;
  /**
   * Allow the last selected measure to be taken partially so the target is met
   * exactly. On by default — most measures (retrofits, fuel switching) scale.
   */
  readonly allowPartial?: boolean;
};

export type PortfolioSelection = {
  readonly technologyId: string;
  readonly name: string;
  readonly marginalCost: number;
  /** Abatement actually taken, which may be less than the potential. */
  readonly selectedAbatement: number;
  readonly availableAbatement: number;
  readonly cost: number;
  readonly isPartial: boolean;
};

export type Portfolio = {
  readonly selections: readonly PortfolioSelection[];
  readonly totalAbatement: number;
  readonly totalCost: number;
  readonly averageCost: number;
  readonly currency: string;
  /** Abatement still needed after the selection; 0 when the target is met. */
  readonly unmetAbatement: number;
  readonly meetsTarget: boolean;
  readonly budgetRemaining: number | null;
  /** Measures skipped because the budget ran out, cheapest first. */
  readonly skipped: readonly { readonly technologyId: string; readonly reason: string }[];
  readonly methodology: string;
};

/**
 * Greedy least-cost selection along the curve.
 *
 * Measures are taken in curve order until the abatement target is met or the
 * budget is exhausted. Because the curve is already sorted by marginal cost and
 * measures are divisible, greedy selection is optimal. A measure that would
 * breach the budget is taken partially up to the remaining budget when
 * `allowPartial` is set, and otherwise skipped with a recorded reason — the
 * cheaper-but-larger measure never blocks the ones behind it.
 */
export function selectPortfolio(
  curve: MaccCurve,
  constraints: PortfolioConstraints = {},
): Portfolio {
  const target = constraints.abatementTarget;
  if (target !== undefined && (!Number.isFinite(target) || target < 0)) {
    throw new CalculationError("abatementTarget must be a non-negative number", {
      abatementTarget: target,
    });
  }
  if (
    constraints.budget !== undefined &&
    (!Number.isFinite(constraints.budget) || constraints.budget < 0)
  ) {
    throw new CalculationError("budget must be a non-negative number", {
      budget: constraints.budget,
    });
  }
  const allowPartial = constraints.allowPartial ?? true;

  const selections: PortfolioSelection[] = [];
  const skipped: { technologyId: string; reason: string }[] = [];
  let totalAbatement = 0;
  let totalCost = 0;

  for (const point of curve.points) {
    if (target !== undefined && totalAbatement >= target) {
      skipped.push({
        technologyId: point.technologyId,
        reason: "Abatement target already met by cheaper measures",
      });
      continue;
    }

    let take = point.abatementPotential;
    if (target !== undefined && allowPartial) {
      take = Math.min(take, target - totalAbatement);
    }

    // Only positive-cost measures consume budget; negative-cost ones release it.
    let cost = take * point.marginalCost;
    if (constraints.budget !== undefined && cost > 0) {
      const remaining = constraints.budget - Math.max(0, totalCost);
      if (remaining <= 0) {
        skipped.push({
          technologyId: point.technologyId,
          reason: "Budget exhausted",
        });
        continue;
      }
      if (cost > remaining) {
        if (!allowPartial) {
          skipped.push({
            technologyId: point.technologyId,
            reason: `Measure costs ${cost.toFixed(0)} ${curve.currency} but only ${remaining.toFixed(0)} remains`,
          });
          continue;
        }
        take = remaining / point.marginalCost;
        cost = take * point.marginalCost;
      }
    }

    if (take <= 0) continue;

    totalAbatement += take;
    totalCost += cost;
    selections.push({
      technologyId: point.technologyId,
      name: point.name,
      marginalCost: point.marginalCost,
      selectedAbatement: take,
      availableAbatement: point.abatementPotential,
      cost,
      isPartial: take < point.abatementPotential - 1e-9,
    });
  }

  const unmetAbatement = target === undefined ? 0 : Math.max(0, target - totalAbatement);

  return {
    selections,
    totalAbatement,
    totalCost,
    averageCost: safeDivide(totalCost, totalAbatement),
    currency: curve.currency,
    unmetAbatement,
    meetsTarget: unmetAbatement <= 1e-9,
    budgetRemaining:
      constraints.budget === undefined
        ? null
        : constraints.budget - Math.max(0, totalCost),
    skipped,
    methodology: `Greedy least-cost selection along the ${curve.year} MACC${target === undefined ? "" : ` for a ${target} tCO2e target`}${constraints.budget === undefined ? "" : ` within a ${constraints.budget} ${curve.currency} budget`}`,
  };
}

/**
 * Marginal cost of the last tonne needed to reach `abatement` — the height of
 * the curve at that point, i.e. the shadow carbon price the target implies.
 */
export function marginalCostAt(curve: MaccCurve, abatement: number): number | null {
  if (abatement <= 0) return null;
  for (const point of curve.points) {
    if (abatement <= point.cumulativeAbatement + 1e-9) return point.marginalCost;
  }
  return null;
}
