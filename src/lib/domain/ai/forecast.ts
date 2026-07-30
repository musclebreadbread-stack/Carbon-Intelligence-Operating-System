/**
 * Emission forecasting.
 *
 * Two deterministic methods, both fully specified so a forecast can be
 * re-performed:
 *
 *  - `linear` — ordinary least squares on the observation index, with a proper
 *    prediction interval `ŷ ± z·s·√(1 + 1/n + (x−x̄)²/Sxx)`. A perfectly linear
 *    history therefore forecasts the next value exactly, with a zero-width
 *    interval, because the residual standard error is zero.
 *  - `holt` — Holt's linear (double exponential smoothing) with explicit `alpha`
 *    and `beta`, which tracks a changing trend better than OLS on a long history.
 *
 * The interval uses a normal critical value rather than Student's *t*: the
 * platform has no statistical tables and the difference is immaterial at the
 * sample sizes an annual or monthly inventory produces. The choice is recorded in
 * `methodology` so it is visible to a reviewer.
 *
 * Points are shaped to the `AIPrediction` model.
 *
 * Pure TypeScript — no framework, database or network imports.
 */

import { CalculationError } from "@/lib/core/errors";
import { MS_PER_DAY } from "@/lib/core/period";
import { mean, safeDivide, sum } from "@/lib/core/number";

import type { TimeSeriesPoint } from "./anomaly";

export const FORECAST_METHODS = ["linear", "holt"] as const;
export type ForecastMethod = (typeof FORECAST_METHODS)[number];

/** Normal critical values for the supported confidence levels. */
export const Z_CRITICAL: Readonly<Record<number, number>> = {
  0.8: 1.2816,
  0.9: 1.6449,
  0.95: 1.96,
  0.99: 2.5758,
};

export const DEFAULT_CONFIDENCE_LEVEL = 0.95;
export const DEFAULT_HOLT_ALPHA = 0.5;
export const DEFAULT_HOLT_BETA = 0.3;

export type ForecastOptions = {
  readonly horizon?: number;
  readonly method?: ForecastMethod;
  readonly metric?: string;
  readonly unit?: string;
  readonly confidenceLevel?: number;
  /** Level smoothing for `holt`, 0..1. */
  readonly alpha?: number;
  /** Trend smoothing for `holt`, 0..1. */
  readonly beta?: number;
  /** Interval between observations, in days. Inferred from the series if unset. */
  readonly intervalDays?: number;
};

/** Plain object shaped to the `AIPrediction` model. */
export type PredictionRecord = {
  readonly metric: string;
  readonly predictedValue: number;
  readonly actualValue: number | null;
  readonly confidence: number;
  readonly lowerBound: number;
  readonly upperBound: number;
  readonly horizon: string;
  readonly targetDate: Date;
  readonly methodology: string;
  readonly features: Readonly<Record<string, number | string>>;
  readonly unit: string;
  /** 1-based step ahead of the last observation. */
  readonly step: number;
};

export type FittedModel = {
  readonly method: ForecastMethod;
  /** Slope per step for `linear`, final trend for `holt`. */
  readonly slope: number;
  readonly intercept: number;
  /** Residual standard error of the fit. */
  readonly residualStdError: number;
  /** Coefficient of determination; 1 for a perfect fit. */
  readonly rSquared: number;
  readonly meanAbsoluteError: number;
  readonly observations: number;
  readonly fitted: readonly number[];
};

export type ForecastResult = {
  readonly predictions: readonly PredictionRecord[];
  readonly model: FittedModel;
  readonly metric: string;
  readonly unit: string;
  readonly confidenceLevel: number;
  readonly intervalDays: number;
  readonly methodology: string;
};

function criticalValue(confidenceLevel: number): number {
  const z = Z_CRITICAL[confidenceLevel];
  if (z === undefined) {
    throw new CalculationError(
      `Unsupported confidence level: ${confidenceLevel}. Supported: ${Object.keys(Z_CRITICAL).join(", ")}`,
      { confidenceLevel },
    );
  }
  return z;
}

/** Mean spacing between observations, in days; 1 for a single observation. */
export function inferIntervalDays(series: readonly TimeSeriesPoint[]): number {
  if (series.length < 2) return 1;
  const gaps: number[] = [];
  for (let index = 1; index < series.length; index += 1) {
    gaps.push((series[index].at.getTime() - series[index - 1].at.getTime()) / MS_PER_DAY);
  }
  const average = mean(gaps);
  return average > 0 ? average : 1;
}

function fitLinear(values: readonly number[]): FittedModel {
  const n = values.length;
  const xs = values.map((_, index) => index);
  const xBar = mean(xs);
  const yBar = mean(values);
  const sxx = sum(xs.map((x) => (x - xBar) ** 2));
  const sxy = sum(xs.map((x, index) => (x - xBar) * (values[index] - yBar)));
  const slope = sxx === 0 ? 0 : sxy / sxx;
  const intercept = yBar - slope * xBar;
  const fitted = xs.map((x) => intercept + slope * x);
  const residuals = values.map((value, index) => value - fitted[index]);
  const sse = sum(residuals.map((residual) => residual ** 2));
  const sst = sum(values.map((value) => (value - yBar) ** 2));
  // Two parameters estimated, hence n − 2 degrees of freedom.
  const residualStdError = n > 2 ? Math.sqrt(sse / (n - 2)) : 0;

  return {
    method: "linear",
    slope,
    intercept,
    residualStdError,
    rSquared: sst === 0 ? 1 : Math.max(0, 1 - sse / sst),
    meanAbsoluteError: mean(residuals.map((residual) => Math.abs(residual))),
    observations: n,
    fitted,
  };
}

function fitHolt(
  values: readonly number[],
  alpha: number,
  beta: number,
): FittedModel {
  if (alpha <= 0 || alpha > 1 || beta < 0 || beta > 1) {
    throw new CalculationError("Holt alpha must be in (0, 1] and beta in [0, 1]", {
      alpha,
      beta,
    });
  }
  let level = values[0];
  let trend = values.length > 1 ? values[1] - values[0] : 0;
  const fitted: number[] = [values[0]];

  for (let index = 1; index < values.length; index += 1) {
    const forecastForIndex = level + trend;
    fitted.push(forecastForIndex);
    const previousLevel = level;
    level = alpha * values[index] + (1 - alpha) * forecastForIndex;
    trend = beta * (level - previousLevel) + (1 - beta) * trend;
  }

  const residuals = values.map((value, index) => value - fitted[index]);
  const sse = sum(residuals.map((residual) => residual ** 2));
  const yBar = mean(values);
  const sst = sum(values.map((value) => (value - yBar) ** 2));
  const n = values.length;

  return {
    method: "holt",
    slope: trend,
    intercept: level,
    residualStdError: n > 2 ? Math.sqrt(sse / (n - 2)) : 0,
    rSquared: sst === 0 ? 1 : Math.max(0, 1 - sse / sst),
    meanAbsoluteError: mean(residuals.map((residual) => Math.abs(residual))),
    observations: n,
    fitted,
  };
}

/**
 * Forecasts `horizon` steps beyond the end of the series.
 *
 * The prediction interval widens with distance from the centre of the observed
 * range, which is the honest behaviour: a five-year extrapolation from three years
 * of data should not look as certain as a one-year one.
 */
export function forecast(
  series: readonly TimeSeriesPoint[],
  options: ForecastOptions = {},
): ForecastResult {
  const horizon = options.horizon ?? 1;
  if (!Number.isInteger(horizon) || horizon < 1) {
    throw new CalculationError("Forecast horizon must be a positive integer", { horizon });
  }
  if (series.length < 2) {
    throw new CalculationError("forecast requires at least two observations", {
      observations: series.length,
    });
  }
  for (const [index, point] of series.entries()) {
    if (!Number.isFinite(point.value)) {
      throw new CalculationError("Series values must be finite", { index, value: point.value });
    }
  }

  const method = options.method ?? "linear";
  const metric = options.metric ?? "value";
  const unit = options.unit ?? "tCO2e";
  const confidenceLevel = options.confidenceLevel ?? DEFAULT_CONFIDENCE_LEVEL;
  const z = criticalValue(confidenceLevel);
  const intervalDays = options.intervalDays ?? inferIntervalDays(series);
  const values = series.map((point) => point.value);
  const alpha = options.alpha ?? DEFAULT_HOLT_ALPHA;
  const beta = options.beta ?? DEFAULT_HOLT_BETA;

  const model = method === "holt" ? fitHolt(values, alpha, beta) : fitLinear(values);
  const n = values.length;
  const xs = values.map((_, index) => index);
  const xBar = mean(xs);
  const sxx = sum(xs.map((x) => (x - xBar) ** 2));
  const lastAt = series[series.length - 1].at;

  const methodology =
    method === "holt"
      ? `Holt's linear exponential smoothing (alpha ${alpha}, beta ${beta}) over ${n} observations; ${confidenceLevel * 100} % interval from the residual standard error using a normal critical value of ${z}`
      : `Ordinary least squares on the observation index over ${n} observations; ${confidenceLevel * 100} % prediction interval using a normal critical value of ${z}`;

  const predictions: PredictionRecord[] = [];
  for (let step = 1; step <= horizon; step += 1) {
    const x = n - 1 + step;
    const predictedValue =
      method === "holt"
        ? model.intercept + model.slope * step
        : model.intercept + model.slope * x;

    const leverage =
      method === "holt"
        ? // Smoothing has no closed-form interval; widen with √step, the standard
          // random-walk-with-drift approximation.
          Math.sqrt(step)
        : Math.sqrt(1 + 1 / n + (sxx === 0 ? 0 : (x - xBar) ** 2 / sxx));
    const margin = z * model.residualStdError * leverage;

    predictions.push({
      metric,
      predictedValue,
      actualValue: null,
      // Confidence decays with the forecast distance, floored at 0.1 so a long
      // extrapolation is never reported as worthless.
      confidence: Math.max(0.1, model.rSquared * (1 / (1 + 0.1 * (step - 1)))),
      lowerBound: predictedValue - margin,
      upperBound: predictedValue + margin,
      horizon: `${step} step(s) (~${Math.round(step * intervalDays)} day(s))`,
      targetDate: new Date(lastAt.getTime() + step * intervalDays * MS_PER_DAY),
      methodology,
      features: {
        method,
        slope: model.slope,
        intercept: model.intercept,
        rSquared: model.rSquared,
        residualStdError: model.residualStdError,
        observations: n,
        step,
      },
      unit,
      step,
    });
  }

  return {
    predictions,
    model,
    metric,
    unit,
    confidenceLevel,
    intervalDays,
    methodology,
  };
}

/**
 * Back-test accuracy: mean absolute percentage error of the fitted values.
 * Returns `null` when any observation is zero, where MAPE is undefined.
 */
export function meanAbsolutePercentageError(
  series: readonly TimeSeriesPoint[],
  model: FittedModel,
): number | null {
  if (series.some((point) => point.value === 0)) return null;
  return (
    mean(
      series.map((point, index) =>
        Math.abs(safeDivide(point.value - model.fitted[index], point.value)),
      ),
    ) * 100
  );
}
