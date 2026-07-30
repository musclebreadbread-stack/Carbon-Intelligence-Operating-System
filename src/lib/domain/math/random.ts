/**
 * Seeded pseudo-random number generation.
 *
 * `Math.random()` is never used anywhere in the domain: an uncertainty result
 * that cannot be reproduced cannot be verified by an auditor. Every stochastic
 * routine takes an explicit seed and draws from `mulberry32`, so the same seed
 * always produces the same output on every platform.
 *
 * Pure TypeScript — no framework, database or network imports.
 */

import { CalculationError } from "@/lib/core/errors";

/** Uniform generator on [0, 1). */
export type Rng = () => number;

/**
 * mulberry32 — a small, fast 32-bit PRNG with a full 2^32 period, good enough
 * for Monte Carlo emission uncertainty and completely deterministic.
 */
export function mulberry32(seed: number): Rng {
  if (!Number.isFinite(seed)) {
    throw new CalculationError("PRNG seed must be a finite number", { seed });
  }
  let state = Math.trunc(seed) >>> 0;
  return function next(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Uniform draw on `[min, max)`. */
export function uniform(rng: Rng, min: number, max: number): number {
  return min + rng() * (max - min);
}

/**
 * Normal draw via the Box–Muller transform.
 * `stdDev` must be non-negative; a zero standard deviation returns the mean.
 */
export function normal(rng: Rng, mean: number, stdDev: number): number {
  if (stdDev < 0) {
    throw new CalculationError("Normal stdDev cannot be negative", { stdDev });
  }
  if (stdDev === 0) return mean;
  // Guard against log(0).
  let u = rng();
  while (u === 0) u = rng();
  const v = rng();
  const magnitude = Math.sqrt(-2 * Math.log(u));
  return mean + stdDev * magnitude * Math.cos(2 * Math.PI * v);
}

/**
 * Triangular draw — the distribution the IPCC guidelines suggest when only a
 * minimum, mode and maximum are known, which is the usual case for expert
 * judgement on activity data.
 */
export function triangular(rng: Rng, min: number, mode: number, max: number): number {
  if (!(min <= mode && mode <= max)) {
    throw new CalculationError("Triangular distribution requires min ≤ mode ≤ max", {
      min,
      mode,
      max,
    });
  }
  if (min === max) return min;
  const u = rng();
  const cutoff = (mode - min) / (max - min);
  return u < cutoff
    ? min + Math.sqrt(u * (max - min) * (mode - min))
    : max - Math.sqrt((1 - u) * (max - min) * (max - mode));
}

/**
 * Log-normal draw, parameterised by the mean and standard deviation of the
 * *underlying value* (not of its logarithm), which is how emission-factor
 * uncertainty is published. Suitable for strictly positive quantities.
 */
export function lognormal(rng: Rng, mean: number, stdDev: number): number {
  if (mean <= 0) {
    throw new CalculationError("Log-normal mean must be greater than zero", { mean });
  }
  if (stdDev < 0) {
    throw new CalculationError("Log-normal stdDev cannot be negative", { stdDev });
  }
  if (stdDev === 0) return mean;
  const variance = stdDev ** 2;
  const mu = Math.log(mean ** 2 / Math.sqrt(variance + mean ** 2));
  const sigma = Math.sqrt(Math.log(1 + variance / mean ** 2));
  return Math.exp(normal(rng, mu, sigma));
}

/** Draws `count` samples from `sampler`, for building an empirical distribution. */
export function sampleMany(count: number, sampler: () => number): number[] {
  if (!Number.isInteger(count) || count < 1) {
    throw new CalculationError("Sample count must be a positive integer", { count });
  }
  const samples: number[] = new Array<number>(count);
  for (let index = 0; index < count; index += 1) {
    samples[index] = sampler();
  }
  return samples;
}
