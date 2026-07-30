/**
 * Numeric helpers shared by the calculation engines.
 *
 * Emission and money math uses plain `number`; rounding is applied only at
 * presentation / persistence boundaries via `roundTo`.
 *
 * Pure TypeScript — no framework, database or network imports.
 */

import { CalculationError } from "./errors";

/** Rounds `value` to `decimalPlaces`, avoiding the classic 1.005 float artefact. */
export function roundTo(value: number, decimalPlaces = 2): number {
  if (!Number.isFinite(value)) {
    throw new CalculationError("Cannot round a non-finite value", { value });
  }
  if (!Number.isInteger(decimalPlaces) || decimalPlaces < 0) {
    throw new CalculationError("decimalPlaces must be a non-negative integer", {
      decimalPlaces,
    });
  }
  const factor = 10 ** decimalPlaces;
  // Nudge by Number.EPSILON so that values stored just below the midpoint
  // (e.g. 1.005 === 1.00499999999999989) still round half-up.
  return Math.round((value + Math.sign(value) * Number.EPSILON * Math.abs(value)) * factor) / factor;
}

export function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

export function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return sum(values) / values.length;
}

/** Sample standard deviation (n-1 denominator). Returns 0 for fewer than 2 values. */
export function stdDev(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const variance =
    sum(values.map((value) => (value - avg) ** 2)) / (values.length - 1);
  return Math.sqrt(variance);
}

/**
 * Linear-interpolation percentile (the "R-7" / Excel `PERCENTILE.INC` method).
 * `p` is expressed as a percentage in [0, 100].
 */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) {
    throw new CalculationError("percentile requires at least one value");
  }
  if (p < 0 || p > 100) {
    throw new CalculationError("percentile p must be between 0 and 100", { p });
  }
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0];
  const rank = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (rank - lower) * (sorted[upper] - sorted[lower]);
}

/** Division that yields `fallback` instead of Infinity/NaN when the divisor is 0. */
export function safeDivide(
  numerator: number,
  denominator: number,
  fallback = 0,
): number {
  if (denominator === 0 || !Number.isFinite(denominator)) return fallback;
  const result = numerator / denominator;
  return Number.isFinite(result) ? result : fallback;
}

/** Clamps `value` into the inclusive `[min, max]` range. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
