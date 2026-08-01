/**
 * Anomaly detection over emission and activity time series.
 *
 * Real statistics, not a model: every flag is reproducible and can be
 * re-performed by a verifier from the same inputs.
 *
 * Three methods:
 *
 *  - `zscore` — **leave-one-out** standardisation. The mean and standard
 *    deviation are computed with the point under test excluded, which avoids the
 *    masking effect where a single large outlier inflates the standard deviation
 *    enough to hide itself. A textbook z-score would score a lone 5× spike in an
 *    otherwise flat series at only ~3σ; leave-one-out scores it correctly as
 *    extreme.
 *  - `iqr` — Tukey's fences at `Q1 − k·IQR` and `Q3 + k·IQR`. Distribution-free
 *    and unaffected by the outlier, useful for skewed activity data.
 *  - `seasonal` — the same leave-one-out logic applied within each season index
 *    (month of the year, day of the week), so a legitimate winter heating peak is
 *    not flagged every year.
 *
 * Records are shaped to the `AnomalyDetection` model.
 *
 * Pure TypeScript — no framework, database or network imports.
 */

import { CalculationError } from "@/lib/core/errors";
import { mean, percentile, safeDivide, stdDev, sum } from "@/lib/core/number";

export const ANOMALY_METHODS = ["zscore", "iqr", "seasonal"] as const;
export type AnomalyMethod = (typeof ANOMALY_METHODS)[number];

export const ANOMALY_SEVERITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;
export type AnomalySeverity = (typeof ANOMALY_SEVERITIES)[number];

export const DEFAULT_ZSCORE_THRESHOLD = 3;
export const DEFAULT_IQR_MULTIPLIER = 1.5;

/**
 * Score reported when the comparison basis has zero dispersion and the deviation
 * is non-zero — an infinitely improbable point. A finite sentinel keeps the value
 * JSON-serialisable for the `AnomalyDetection` row.
 */
export const MAX_ANOMALY_SCORE = 999;

/** Multiples of the threshold at which each severity band starts. */
export const SEVERITY_MULTIPLES: readonly {
  readonly severity: AnomalySeverity;
  readonly multiple: number;
}[] = [
  { severity: "CRITICAL", multiple: 3 },
  { severity: "HIGH", multiple: 2 },
  { severity: "MEDIUM", multiple: 1.5 },
  { severity: "LOW", multiple: 1 },
];

export type TimeSeriesPoint = {
  readonly at: Date;
  readonly value: number;
  /** Human label for the period, e.g. `"2024-03"`. */
  readonly label?: string;
};

export type DetectAnomaliesOptions = {
  readonly method?: AnomalyMethod;
  /** Sigma count for `zscore`/`seasonal`, or the fence multiplier for `iqr`. */
  readonly threshold?: number;
  readonly metric?: string;
  readonly unit?: string;
  /** Season length for `seasonal`, e.g. 12 for monthly data. */
  readonly seasonLength?: number;
  /** Only flag points above the expected value, e.g. for cost overruns. */
  readonly direction?: "both" | "above" | "below";
};

/** Plain object shaped to the `AnomalyDetection` model, plus the statistics. */
export type AnomalyRecord = {
  readonly metric: string;
  readonly detectedValue: number;
  readonly expectedValue: number;
  readonly deviation: number;
  readonly severity: AnomalySeverity;
  readonly description: string;
  readonly isResolved: boolean;
  readonly detectedAt: Date;
  readonly index: number;
  readonly label: string;
  readonly deviationPercent: number;
  readonly score: number;
  readonly threshold: number;
  readonly method: AnomalyMethod;
  readonly direction: "above" | "below";
};

export type ScoredPoint = {
  readonly index: number;
  readonly label: string;
  readonly at: Date;
  readonly value: number;
  readonly expectedValue: number;
  readonly deviation: number;
  readonly score: number;
  readonly isAnomaly: boolean;
};

export type AnomalyStatistics = {
  readonly count: number;
  readonly mean: number;
  readonly stdDev: number;
  readonly median: number;
  readonly q1: number;
  readonly q3: number;
  readonly iqr: number;
  readonly min: number;
  readonly max: number;
};

export type AnomalyResult = {
  readonly metric: string;
  readonly method: AnomalyMethod;
  readonly threshold: number;
  readonly anomalies: readonly AnomalyRecord[];
  readonly points: readonly ScoredPoint[];
  readonly statistics: AnomalyStatistics;
  readonly unit: string;
  readonly methodology: string;
};

function labelFor(point: TimeSeriesPoint, index: number): string {
  return point.label ?? point.at.toISOString().slice(0, 10) ?? `#${index}`;
}

function severityFor(score: number, threshold: number): AnomalySeverity {
  const ratio = safeDivide(score, threshold, Number.POSITIVE_INFINITY);
  const band = SEVERITY_MULTIPLES.find((entry) => ratio >= entry.multiple);
  return band?.severity ?? "LOW";
}

/** Score when the basis has no dispersion: 0 for an exact match, else the cap. */
function degenerateScore(deviation: number): number {
  return deviation === 0 ? 0 : MAX_ANOMALY_SCORE;
}

function validate(series: readonly TimeSeriesPoint[], threshold: number): void {
  if (series.length === 0) {
    throw new CalculationError("detectAnomalies requires at least one point", {});
  }
  for (const [index, point] of series.entries()) {
    if (!Number.isFinite(point.value)) {
      throw new CalculationError("Series values must be finite", {
        index,
        value: point.value,
      });
    }
  }
  if (!Number.isFinite(threshold) || threshold <= 0) {
    throw new CalculationError("Anomaly threshold must be greater than zero", {
      threshold,
    });
  }
}

/**
 * Detects anomalies in a time series.
 *
 * A series of fewer than three points is returned unflagged: two points define a
 * line and there is nothing to be an outlier from.
 */
export function detectAnomalies(
  series: readonly TimeSeriesPoint[],
  options: DetectAnomaliesOptions = {},
): AnomalyResult {
  const method = options.method ?? "zscore";
  const threshold =
    options.threshold ??
    (method === "iqr" ? DEFAULT_IQR_MULTIPLIER : DEFAULT_ZSCORE_THRESHOLD);
  validate(series, threshold);

  const metric = options.metric ?? "value";
  const unit = options.unit ?? "tCO2e";
  const direction = options.direction ?? "both";
  const values = series.map((point) => point.value);

  const statistics: AnomalyStatistics = {
    count: values.length,
    mean: mean(values),
    stdDev: stdDev(values),
    median: percentile(values, 50),
    q1: percentile(values, 25),
    q3: percentile(values, 75),
    iqr: percentile(values, 75) - percentile(values, 25),
    min: Math.min(...values),
    max: Math.max(...values),
  };

  const tooShort = values.length < 3;

  const scored: ScoredPoint[] = series.map((point, index) => {
    if (tooShort) {
      return {
        index,
        label: labelFor(point, index),
        at: point.at,
        value: point.value,
        expectedValue: statistics.mean,
        deviation: point.value - statistics.mean,
        score: 0,
        isAnomaly: false,
      };
    }

    let expectedValue: number;
    let score: number;

    if (method === "iqr") {
      expectedValue = statistics.median;
      const above = point.value - statistics.q3;
      const below = statistics.q1 - point.value;
      const excess = Math.max(above, below, 0);
      score =
        statistics.iqr === 0
          ? degenerateScore(excess)
          : safeDivide(excess, statistics.iqr, 0);
    } else {
      const peers =
        method === "seasonal"
          ? seasonalPeers(series, index, options.seasonLength)
          : values.filter((_, other) => other !== index);
      expectedValue = peers.length > 0 ? mean(peers) : statistics.mean;
      const dispersion = peers.length > 1 ? stdDev(peers) : 0;
      const deviation = point.value - expectedValue;
      score =
        dispersion === 0
          ? degenerateScore(deviation)
          : Math.abs(deviation) / dispersion;
    }

    const deviation = point.value - expectedValue;
    const directional =
      direction === "both" ||
      (direction === "above" && deviation > 0) ||
      (direction === "below" && deviation < 0);

    return {
      index,
      label: labelFor(point, index),
      at: point.at,
      value: point.value,
      expectedValue,
      deviation,
      score,
      isAnomaly: directional && score > threshold,
    };
  });

  const anomalies: AnomalyRecord[] = scored
    .filter((point) => point.isAnomaly)
    .map((point) => {
      const severity = severityFor(point.score, threshold);
      const above = point.deviation > 0;
      return {
        metric,
        detectedValue: point.value,
        expectedValue: point.expectedValue,
        deviation: point.deviation,
        severity,
        description: `${point.label}: ${metric} of ${point.value} ${unit} is ${above ? "above" : "below"} the expected ${point.expectedValue} ${unit} by ${Math.abs(point.deviation)} ${unit} (${method} score ${point.score === MAX_ANOMALY_SCORE ? "beyond measurable" : point.score.toFixed(2)} against a threshold of ${threshold}).`,
        isResolved: false,
        detectedAt: point.at,
        index: point.index,
        label: point.label,
        deviationPercent: safeDivide(point.deviation, point.expectedValue) * 100,
        score: point.score,
        threshold,
        method,
        direction: above ? "above" : "below",
      };
    });

  return {
    metric,
    method,
    threshold,
    anomalies,
    points: scored,
    statistics,
    unit,
    methodology:
      method === "iqr"
        ? `Tukey fences at Q1 − ${threshold}·IQR and Q3 + ${threshold}·IQR over ${values.length} observations`
        : method === "seasonal"
          ? `Leave-one-out standardisation within each season index (season length ${options.seasonLength ?? 12}) at ${threshold}σ`
          : `Leave-one-out standardisation at ${threshold}σ over ${values.length} observations`,
  };
}

/** Values sharing the season index of `index`, excluding the point itself. */
function seasonalPeers(
  series: readonly TimeSeriesPoint[],
  index: number,
  seasonLength = 12,
): number[] {
  if (!Number.isInteger(seasonLength) || seasonLength < 2) {
    throw new CalculationError("seasonLength must be an integer of at least 2", {
      seasonLength,
    });
  }
  const season = index % seasonLength;
  const peers = series
    .map((point, other) => ({ point, other }))
    .filter(({ other }) => other !== index && other % seasonLength === season)
    .map(({ point }) => point.value);
  // With fewer than two same-season peers there is no seasonal basis; fall back
  // to the whole series so the point is still assessed.
  if (peers.length < 2) {
    return series.filter((_, other) => other !== index).map((point) => point.value);
  }
  return peers;
}

/** Share of the series flagged, for the analysis summary. */
export function anomalyRate(result: AnomalyResult): number {
  return safeDivide(result.anomalies.length, result.points.length);
}

/** Total absolute deviation the flagged points represent. */
export function anomalyImpact(result: AnomalyResult): number {
  return sum(result.anomalies.map((anomaly) => Math.abs(anomaly.deviation)));
}
