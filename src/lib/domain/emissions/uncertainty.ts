/**
 * Uncertainty analysis.
 *
 * Two complementary methods, both shaped to the `UncertaintyAnalysis` model:
 *
 *  - `propagateUncertainty` — the IPCC Approach 1 analytical method. Relative
 *    uncertainties combine in quadrature for products (the emission factor and
 *    the activity data of one source), and as an activity-weighted quadrature for
 *    sums (aggregating sources into an inventory).
 *  - `monteCarlo` — the IPCC Approach 2 numerical method, using the seeded PRNG
 *    so results are reproducible.
 *
 * All uncertainties are *relative* and expressed as percentages, matching the
 * `UncertaintyAnalysis` columns.
 *
 * Pure TypeScript — no framework, database or network imports.
 */

import { CalculationError } from "@/lib/core/errors";
import { mean as arithmeticMean, percentile, safeDivide, sum } from "@/lib/core/number";

import { lognormal, mulberry32, normal, triangular, type Rng } from "../math/random";

/** Quadrature (root-sum-square) combination of independent relative uncertainties. */
export function combineInQuadrature(percentages: readonly number[]): number {
  for (const percentage of percentages) {
    if (!Number.isFinite(percentage) || percentage < 0) {
      throw new CalculationError("Uncertainty percentages must be finite and non-negative", {
        percentage,
      });
    }
  }
  return Math.sqrt(sum(percentages.map((percentage) => percentage ** 2)));
}

// ---------------------------------------------------------------------------
// Analytical propagation (IPCC Approach 1)
// ---------------------------------------------------------------------------

export type UncertaintyComponent = {
  readonly label?: string;
  /** Emission total of this component, in tCO2e. */
  readonly value: number;
  /** Relative uncertainty of the activity data, in per cent. */
  readonly activityDataUncertainty?: number;
  /** Relative uncertainty of the emission factor, in per cent. */
  readonly emissionFactorUncertainty?: number;
  /** Relative uncertainty introduced by the methodology, in per cent. */
  readonly methodologyUncertainty?: number;
};

export type PropagatedUncertainty = {
  readonly total: number;
  /** Combined relative uncertainty of the total, in per cent. */
  readonly overallUncertainty: number;
  /** Activity-weighted contribution of each driver, in per cent. */
  readonly activityDataUncertainty: number;
  readonly emissionFactorUncertainty: number;
  readonly methodologyUncertainty: number;
  readonly lowerBound: number;
  readonly upperBound: number;
  readonly confidenceLevel: number;
  readonly methodology: string;
  readonly components: readonly {
    readonly label: string;
    readonly value: number;
    readonly uncertainty: number;
    readonly contribution: number;
  }[];
};

/**
 * Combines component uncertainties into the uncertainty of their sum.
 *
 * Per component, the drivers combine in quadrature (they multiply in the
 * emission equation). Across components, the *absolute* uncertainties combine in
 * quadrature and are re-expressed relative to the total — which is why a large,
 * well-known source dilutes the uncertainty of a small, poorly-known one.
 */
export function propagateUncertainty(
  components: readonly UncertaintyComponent[],
  options: { readonly confidenceLevel?: number } = {},
): PropagatedUncertainty {
  if (components.length === 0) {
    throw new CalculationError("propagateUncertainty requires at least one component", {});
  }
  const confidenceLevel = options.confidenceLevel ?? 95;
  const total = sum(components.map((component) => component.value));

  const enriched = components.map((component, index) => {
    const uncertainty = combineInQuadrature([
      component.activityDataUncertainty ?? 0,
      component.emissionFactorUncertainty ?? 0,
      component.methodologyUncertainty ?? 0,
    ]);
    return {
      label: component.label ?? `component-${index + 1}`,
      value: component.value,
      uncertainty,
      absolute: Math.abs(component.value) * (uncertainty / 100),
      activity: Math.abs(component.value) * ((component.activityDataUncertainty ?? 0) / 100),
      factor: Math.abs(component.value) * ((component.emissionFactorUncertainty ?? 0) / 100),
      methodology: Math.abs(component.value) * ((component.methodologyUncertainty ?? 0) / 100),
    };
  });

  const absoluteTotal = Math.sqrt(sum(enriched.map((c) => c.absolute ** 2)));
  const overallUncertainty = safeDivide(absoluteTotal, Math.abs(total)) * 100;
  const driver = (key: "activity" | "factor" | "methodology"): number =>
    safeDivide(Math.sqrt(sum(enriched.map((c) => c[key] ** 2))), Math.abs(total)) * 100;

  return {
    total,
    overallUncertainty,
    activityDataUncertainty: driver("activity"),
    emissionFactorUncertainty: driver("factor"),
    methodologyUncertainty: driver("methodology"),
    lowerBound: total - absoluteTotal,
    upperBound: total + absoluteTotal,
    confidenceLevel,
    methodology:
      "IPCC 2006 Guidelines Vol.1 Ch.3 Approach 1 (analytical error propagation, quadrature combination)",
    components: enriched.map((c) => ({
      label: c.label,
      value: c.value,
      uncertainty: c.uncertainty,
      contribution: safeDivide(c.absolute ** 2, absoluteTotal ** 2),
    })),
  };
}

// ---------------------------------------------------------------------------
// Monte Carlo (IPCC Approach 2)
// ---------------------------------------------------------------------------

export const UNCERTAINTY_DISTRIBUTIONS = ["NORMAL", "LOGNORMAL", "TRIANGULAR"] as const;
export type UncertaintyDistribution = (typeof UNCERTAINTY_DISTRIBUTIONS)[number];

export type MonteCarloInput = {
  readonly label?: string;
  /** Central estimate of this component, in tCO2e. */
  readonly value: number;
  /** Relative uncertainty, in per cent, interpreted per `distribution`. */
  readonly uncertainty: number;
  /** Defaults to `NORMAL`. */
  readonly distribution?: UncertaintyDistribution;
  /** Triangular bounds, in tCO2e. Default to `value ± uncertainty`. */
  readonly min?: number;
  readonly max?: number;
};

export type MonteCarloOptions = {
  readonly iterations?: number;
  readonly seed?: number;
  /** Two-sided confidence level, in per cent. Defaults to 95. */
  readonly confidenceLevel?: number;
};

export type MonteCarloResult = {
  readonly mean: number;
  readonly median: number;
  readonly lowerBound: number;
  readonly upperBound: number;
  /** Half-width of the interval as a percentage of the mean. */
  readonly overallUncertainty: number;
  readonly confidenceLevel: number;
  readonly monteCarloIterations: number;
  readonly seed: number;
  readonly methodology: string;
  /** Deterministic sum of the central estimates, for comparison with `mean`. */
  readonly deterministicTotal: number;
};

function drawComponent(rng: Rng, input: MonteCarloInput): number {
  const distribution = input.distribution ?? "NORMAL";
  const absolute = Math.abs(input.value) * (input.uncertainty / 100);

  switch (distribution) {
    case "NORMAL":
      return normal(rng, input.value, absolute);
    case "LOGNORMAL":
      // Log-normal requires a strictly positive central value; a zero or
      // negative component is degenerate and returned unchanged.
      return input.value > 0 ? lognormal(rng, input.value, absolute) : input.value;
    case "TRIANGULAR":
      return triangular(
        rng,
        input.min ?? input.value - absolute,
        input.value,
        input.max ?? input.value + absolute,
      );
    default: {
      const exhaustive: never = distribution;
      throw new CalculationError("Unknown uncertainty distribution", {
        distribution: exhaustive,
      });
    }
  }
}

/**
 * Monte Carlo simulation of the inventory total.
 *
 * The same `seed` always yields byte-identical output, which is what makes the
 * confidence interval defensible in verification.
 */
export function monteCarlo(
  inputs: readonly MonteCarloInput[],
  options: MonteCarloOptions = {},
): MonteCarloResult {
  if (inputs.length === 0) {
    throw new CalculationError("monteCarlo requires at least one input", {});
  }
  const iterations = options.iterations ?? 10_000;
  if (!Number.isInteger(iterations) || iterations < 100) {
    throw new CalculationError("Monte Carlo iterations must be an integer ≥ 100", {
      iterations,
    });
  }
  const confidenceLevel = options.confidenceLevel ?? 95;
  if (confidenceLevel <= 0 || confidenceLevel >= 100) {
    throw new CalculationError("confidenceLevel must be between 0 and 100 exclusive", {
      confidenceLevel,
    });
  }
  const seed = options.seed ?? 1;
  const rng = mulberry32(seed);

  const totals: number[] = new Array<number>(iterations);
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    let total = 0;
    for (const input of inputs) {
      total += drawComponent(rng, input);
    }
    totals[iteration] = total;
  }

  const tail = (100 - confidenceLevel) / 2;
  const simulatedMean = arithmeticMean(totals);
  const lowerBound = percentile(totals, tail);
  const upperBound = percentile(totals, 100 - tail);

  return {
    mean: simulatedMean,
    median: percentile(totals, 50),
    lowerBound,
    upperBound,
    overallUncertainty:
      safeDivide((upperBound - lowerBound) / 2, Math.abs(simulatedMean)) * 100,
    confidenceLevel,
    monteCarloIterations: iterations,
    seed,
    methodology: `IPCC 2006 Guidelines Vol.1 Ch.3 Approach 2 (Monte Carlo, ${iterations} iterations, mulberry32 seed ${seed})`,
    deterministicTotal: sum(inputs.map((input) => input.value)),
  };
}

/**
 * Plain object shaped to the `UncertaintyAnalysis` model, built from either
 * method. `calculationId` is attached by the persistence layer.
 */
export type UncertaintyAnalysisRecord = {
  readonly overallUncertainty: number;
  readonly activityDataUncertainty: number | null;
  readonly emissionFactorUncertainty: number | null;
  readonly methodologyUncertainty: number | null;
  readonly confidenceLevel: number;
  readonly monteCarloIterations: number | null;
  readonly lowerBound: number;
  readonly upperBound: number;
  readonly methodology: string;
  readonly notes: string | null;
};

export function toUncertaintyRecord(
  analytical: PropagatedUncertainty,
  simulation?: MonteCarloResult,
): UncertaintyAnalysisRecord {
  const source = simulation ?? analytical;
  return {
    overallUncertainty: source.overallUncertainty,
    activityDataUncertainty: analytical.activityDataUncertainty,
    emissionFactorUncertainty: analytical.emissionFactorUncertainty,
    methodologyUncertainty: analytical.methodologyUncertainty,
    confidenceLevel: source.confidenceLevel,
    monteCarloIterations: simulation?.monteCarloIterations ?? null,
    lowerBound: source.lowerBound,
    upperBound: source.upperBound,
    methodology: source.methodology,
    notes: simulation
      ? `Analytical (Approach 1) uncertainty was ±${analytical.overallUncertainty.toFixed(2)} %; the reported interval comes from the Monte Carlo simulation.`
      : null,
  };
}
