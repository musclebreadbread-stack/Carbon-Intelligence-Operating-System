/**
 * AI analysis repository.
 *
 * Anomalies, forecasts, gaps and confidence scores are *recomputed* from the
 * activity series on every read. Persisted `AIAnalysis` rows are the record of a
 * run, but the numbers on screen always come from the deterministic statistical
 * engines over the current data — which is what makes them defensible in an audit.
 */

import { roundTo } from "@/lib/core/number";
import {
  detectAnomalies,
  type AnomalyRecord,
  type TimeSeriesPoint,
} from "@/lib/domain/ai/anomaly";
import { scoreConfidence } from "@/lib/domain/ai/confidence";
import { forecast, type ForecastResult } from "@/lib/domain/ai/forecast";
import { detectDataGaps, type DataGapRecord } from "@/lib/domain/ai/gaps";
import { prisma } from "@/lib/prisma";

import { withDb } from "../db";
import {
  DEMO_ACTIVITY_ENTRIES,
  DEMO_AI_MODELS,
  DEMO_BASELINE_YEAR,
  DEMO_CURRENT_YEAR,
  DEMO_EMISSION_SOURCES,
  DEMO_REPORTING_YEARS,
  type DemoAiModel,
} from "../demo";

import { getInventory, listEmissionResults } from "./calculation";
import { listActivityEntries } from "./activity-data";

export async function listAiModels(organizationId: string): Promise<readonly DemoAiModel[]> {
  return withDb<readonly DemoAiModel[]>(
    async () => {
      const rows = await prisma.aIModel.findMany({
        where: { organizationId },
        orderBy: { name: "asc" },
      });
      return rows.map((row) => ({
        id: row.id,
        organizationId: row.organizationId,
        name: row.name,
        type: row.type,
        version: row.version,
        description: row.description ?? "",
        provider: row.provider ?? "",
        endpoint: row.endpoint,
        accuracy: row.accuracy ?? 0,
        isActive: row.isActive,
        trainedAt: row.trainedAt ?? row.createdAt,
      }));
    },
    () => DEMO_AI_MODELS.filter((model) => model.organizationId === organizationId),
  );
}

export type AiAnalysisRow = {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly status: string;
  readonly summary: string | null;
  readonly confidence: number | null;
  readonly startedAt: Date | null;
  readonly completedAt: Date | null;
};

export async function listAiAnalyses(
  organizationId: string,
  options: { readonly limit?: number } = {},
): Promise<readonly AiAnalysisRow[]> {
  return withDb<readonly AiAnalysisRow[]>(
    async () => {
      const rows = await prisma.aIAnalysis.findMany({
        where: { organizationId },
        orderBy: { createdAt: "desc" },
        take: options.limit ?? 50,
      });
      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        type: row.type,
        status: row.status,
        summary: row.summary,
        confidence: row.confidence,
        startedAt: row.startedAt,
        completedAt: row.completedAt,
      }));
    },
    () => [],
  );
}

/** Monthly activity series per emission source, the input to every AI engine. */
export type ActivitySeries = {
  readonly emissionSourceId: string;
  readonly name: string;
  readonly unit: string;
  readonly points: readonly TimeSeriesPoint[];
};

export async function getActivitySeries(
  organizationId: string,
): Promise<readonly ActivitySeries[]> {
  const entries = await listActivityEntries({ organizationId } as never);
  const rows = entries.length > 0 ? entries : DEMO_ACTIVITY_ENTRIES;
  const sourceNames = new Map(DEMO_EMISSION_SOURCES.map((source) => [source.id, source.name]));

  const grouped = new Map<string, { unit: string; points: TimeSeriesPoint[] }>();
  for (const entry of rows) {
    const key = entry.emissionSourceId;
    const point: TimeSeriesPoint = {
      at: entry.startDate,
      value: entry.quantity,
      label: entry.startDate.toISOString().slice(0, 7),
    };
    const bucket = grouped.get(key);
    if (bucket) bucket.points.push(point);
    else grouped.set(key, { unit: entry.unit, points: [point] });
  }

  return [...grouped.entries()].map(([emissionSourceId, bucket]) => ({
    emissionSourceId,
    name: sourceNames.get(emissionSourceId) ?? emissionSourceId,
    unit: bucket.unit,
    points: [...bucket.points].sort((a, b) => a.at.getTime() - b.at.getTime()),
  }));
}

export type AnomalyFeedRow = AnomalyRecord & {
  readonly emissionSourceId: string;
  readonly sourceName: string;
  readonly unit: string;
};

/** Anomaly feed across every activity series. */
export async function getAnomalyFeed(
  organizationId: string,
  options: {
    readonly method?: "zscore" | "iqr" | "seasonal";
    readonly threshold?: number;
  } = {},
): Promise<readonly AnomalyFeedRow[]> {
  const series = await getActivitySeries(organizationId);
  return series.flatMap((row) =>
    detectAnomalies(row.points, {
      method: options.method ?? "zscore",
      threshold: options.threshold ?? 3,
      metric: row.name,
      unit: row.unit,
    }).anomalies.map((anomaly) => ({
      ...anomaly,
      emissionSourceId: row.emissionSourceId,
      sourceName: row.name,
      unit: row.unit,
    })),
  );
}

/** Data gaps per series, with the estimated fill. */
export async function getDataGaps(
  organizationId: string,
  reportingYear: number = DEMO_CURRENT_YEAR,
): Promise<readonly (DataGapRecord & { readonly emissionSourceId: string })[]> {
  const series = await getActivitySeries(organizationId);
  const expected = Array.from({ length: 12 }, (_, index) => ({
    label: `${reportingYear}-${String(index + 1).padStart(2, "0")}`,
    period: {
      start: new Date(Date.UTC(reportingYear, index, 1)),
      end: new Date(Date.UTC(reportingYear, index + 1, 0)),
    },
  }));
  return series.flatMap((row) =>
    detectDataGaps(
      expected,
      row.points
        .filter((point) => point.at.getUTCFullYear() === reportingYear)
        .map((point) => ({ at: point.at, value: point.value, periodLabel: point.label })),
      { dataCategory: row.name, unit: row.unit },
    ).gaps.map((gap) => ({ ...gap, emissionSourceId: row.emissionSourceId })),
  );
}

/** Emissions forecast from the annual inventory series. */
export async function getEmissionsForecast(
  organizationId: string,
  options: { readonly horizon?: number; readonly method?: "linear" | "holt" } = {},
): Promise<ForecastResult> {
  const points = await Promise.all(
    DEMO_REPORTING_YEARS.map(async (year) => {
      const inventory = await getInventory(organizationId, year);
      return {
        at: new Date(Date.UTC(year, 11, 31)),
        value: roundTo(inventory.totals.totalEmissions, 3),
        label: String(year),
      };
    }),
  );
  return forecast(points, {
    horizon: options.horizon ?? 5,
    method: options.method ?? "linear",
  });
}

/** Confidence score for the reported inventory. */
export async function getInventoryConfidence(
  organizationId: string,
  reportingYear: number = DEMO_CURRENT_YEAR,
) {
  const [results, entries] = await Promise.all([
    listEmissionResults(organizationId, reportingYear),
    listActivityEntries({ organizationId } as never),
  ]);
  const yearEntries = entries.filter(
    (entry) => entry.startDate.getUTCFullYear() === reportingYear,
  );
  const measuredShare =
    yearEntries.length === 0
      ? 0
      : yearEntries.filter((entry) => !entry.isEstimated).length / yearEntries.length;
  const evidenceShare =
    yearEntries.length === 0
      ? 0
      : yearEntries.filter((entry) => entry.evidenceUrl !== null).length / yearEntries.length;

  return scoreConfidence({
    dataQuality: measuredShare,
    coverage: results.length > 0 ? 1 : 0,
    factorSpecificity: 0.7,
    methodRigour: 0.85,
    uncertainty: 0.8,
    verification: evidenceShare,
  });
}

export const AI_BASELINE_YEAR = DEMO_BASELINE_YEAR;
