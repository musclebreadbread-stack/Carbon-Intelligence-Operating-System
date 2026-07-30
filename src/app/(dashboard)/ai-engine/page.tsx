/**
 * AI engine module.
 *
 * Statistical AI is real and deterministic (decision 8): anomalies, data gaps,
 * forecasts and confidence scores are recomputed from the activity series on every
 * read. The language model only renders narrative over those numbers, and the panel
 * says which mode it is in so template text is never mistaken for model output.
 */

import { connection } from "next/server";
import { Activity, AlertTriangle, Brain, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConfidenceBadge } from "@/components/shared/confidence-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { ExplanationPanel } from "@/components/shared/explanation-panel";
import { KpiCard } from "@/components/shared/kpi-card";
import { PageHeader } from "@/components/shared/page-header";
import { ActionForm } from "@/components/shared/form/action-form";
import { resolveAnomalyAction, runAnalysisAction } from "@/lib/actions/ai";
import { activeOrganizationId } from "@/lib/auth/active-organization";
import {
  buildExplanation,
  explanationInputFromOutcome,
} from "@/lib/ai/explain/build-explanation";
import { describeLlmMode, getLlmClient, isLlmConfigured } from "@/lib/ai/llm/factory";
import { AI_ANALYSIS_TYPES } from "@/lib/validation/agent";
import { listReportingYears } from "@/lib/data/repositories/activity-data";
import {
  getAnomalyFeed,
  getDataGaps,
  getEmissionsForecast,
  getInventoryConfidence,
  listAiAnalyses,
  listAiModels,
} from "@/lib/data/repositories/ai";
import { getCalculationOutcome } from "@/lib/data/repositories/calculation";
import {
  formatDate,
  formatEmissions,
  formatNumber,
  formatPercent,
  humaniseEnum,
} from "@/lib/format";

import { AnomalyFeed, type AnomalyRow } from "./_components/anomaly-feed";

const GAP_SEVERITY_TONE: Readonly<Record<string, string>> = {
  CRITICAL: "border-red-500/50 text-red-700 dark:text-red-300",
  HIGH: "border-orange-500/50 text-orange-700 dark:text-orange-300",
  MEDIUM: "border-amber-500/50 text-amber-700 dark:text-amber-300",
  LOW: "border-slate-400/50 text-slate-700 dark:text-slate-300",
};

export default async function AiEnginePage() {
  await connection();

  const organizationId = await activeOrganizationId();
  const years = await listReportingYears(organizationId);
  const currentYear = years[0] ?? new Date().getUTCFullYear();

  const [anomalies, gaps, forecast, confidence, analyses, models, outcome] =
    await Promise.all([
      getAnomalyFeed(organizationId),
      getDataGaps(organizationId, currentYear),
      getEmissionsForecast(organizationId, { horizon: 5 }),
      getInventoryConfidence(organizationId, currentYear),
      listAiAnalyses(organizationId, { limit: 20 }),
      listAiModels(organizationId),
      getCalculationOutcome(organizationId, currentYear),
    ]);

  // The explanation panel is built for the largest emission result: the number a
  // reviewer challenges first. The LLM client is injected, never imported by the
  // explanation builder, so this works with or without an API key.
  const anchor = [...outcome.results].sort((a, b) => b.totalCO2e - a.totalCO2e)[0];
  const explanation = anchor
    ? await buildExplanation(
        explanationInputFromOutcome(outcome, anchor.id, {
          title: `Explanation — ${anchor.emissionSourceId ?? anchor.activityDataEntryId}`,
        }),
        { llm: getLlmClient() },
      )
    : null;

  const anomalyRows: AnomalyRow[] = anomalies.map((anomaly, index) => ({
    id: `${anomaly.emissionSourceId}-${anomaly.index}-${index}`,
    metric: anomaly.metric,
    sourceName: anomaly.sourceName,
    label: anomaly.label,
    detectedValue: anomaly.detectedValue,
    expectedValue: anomaly.expectedValue,
    deviation: anomaly.deviation,
    deviationPercent: anomaly.deviationPercent,
    severity: anomaly.severity,
    description: anomaly.description,
    method: anomaly.method,
    direction: anomaly.direction,
    score: anomaly.score,
    threshold: anomaly.threshold,
    unit: anomaly.unit,
    detectedAt: anomaly.detectedAt.toISOString(),
    isResolved: anomaly.isResolved,
  }));

  const criticalAnomalies = anomalyRows.filter(
    (anomaly) => anomaly.severity === "CRITICAL" || anomaly.severity === "HIGH",
  );
  const estimatedFill = gaps.reduce((total, gap) => total + (gap.estimatedValue ?? 0), 0);
  const llm = describeLlmMode();

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI engine"
        description="Anomaly detection, gap analysis, forecasting and confidence scoring — deterministic statistics with an explainable trail."
        meta={[
          { label: "Reporting year", value: String(currentYear) },
          { label: "Narrative", value: llm.mode },
          { label: "Models registered", value: formatNumber(models.length) },
        ]}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Anomalies"
          value={formatNumber(anomalyRows.length)}
          icon={AlertTriangle}
          description={`${criticalAnomalies.length} high or critical`}
          source="detectAnomalies() over every activity series"
        />
        <KpiCard
          title="Data gaps"
          value={formatNumber(gaps.length)}
          icon={Activity}
          description={`${formatNumber(estimatedFill, 1)} units filled by estimation`}
          source="detectDataGaps()"
        />
        <KpiCard
          title="Inventory confidence"
          value={formatPercent(confidence.scorePercent, 1)}
          icon={Brain}
          description={confidence.level}
          source="scoreConfidence()"
          goodDirection="up"
        />
        <KpiCard
          title="Forecast quality"
          value={formatNumber(forecast.model.rSquared, 3)}
          unit="R²"
          icon={Sparkles}
          description={`${forecast.model.method} fit over ${forecast.model.observations} observations`}
          source="forecast()"
          goodDirection="up"
        />
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle>Narrative generation mode</CardTitle>
              <CardDescription>{llm.label}</CardDescription>
            </div>
            <Badge variant={isLlmConfigured() ? "secondary" : "outline"}>
              {llm.mode} · {llm.model}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">{llm.labelKo}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Every number on this page is produced by the statistical engines in{" "}
            <code>src/lib/domain/ai/</code>. The model, when configured, only writes prose over
            them — which is why an unconfigured key degrades the wording and never the figures.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Analyses</CardTitle>
          <CardDescription>
            Run one of the five analysis types. A run persists the typed result rows plus the
            explanation graph, so it is refused without a database — the recomputed feeds below
            are unaffected.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ActionForm
            action={runAnalysisAction}
            hidden={{ organizationId }}
            submitLabel="Run analysis"
            pendingLabel="Analysing…"
            fields={[
              { name: "name", label: "Analysis name", required: true, defaultValue: `${currentYear} anomaly sweep` },
              {
                name: "type",
                label: "Type",
                type: "select",
                required: true,
                options: AI_ANALYSIS_TYPES.map((type) => ({
                  value: type,
                  label: humaniseEnum(type),
                })),
              },
              {
                name: "reportingYear",
                label: "Reporting year",
                type: "select",
                options: (years.length > 0 ? years : [currentYear]).map((year) => ({
                  value: String(year),
                  label: String(year),
                })),
                defaultValue: String(currentYear),
              },
              {
                name: "anomalyMethod",
                label: "Anomaly method",
                type: "select",
                options: [
                  { value: "zscore", label: "z-score" },
                  { value: "iqr", label: "interquartile range" },
                  { value: "seasonal", label: "seasonal" },
                ],
                defaultValue: "zscore",
              },
              {
                name: "anomalyThreshold",
                label: "Threshold (σ)",
                type: "number",
                step: "any",
                defaultValue: 3,
              },
              { name: "horizon", label: "Forecast horizon", type: "number", defaultValue: 12 },
              {
                name: "forecastMethod",
                label: "Forecast method",
                type: "select",
                options: [
                  { value: "linear", label: "linear regression" },
                  { value: "holt", label: "Holt's linear trend" },
                ],
                defaultValue: "linear",
              },
              {
                name: "explain",
                label: "Build the explanation graph",
                type: "checkbox",
                defaultValue: true,
              },
            ]}
          />

          {analyses.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No persisted <code>AIAnalysis</code> rows. Analyses are records of a run, so this
              list stays empty until a database is configured; the feeds below are recomputed
              live regardless.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {analyses.map((analysis) => (
                <li
                  key={analysis.id}
                  className="flex flex-wrap items-center gap-2 rounded-md border p-2.5 text-sm"
                >
                  <span className="font-medium">{analysis.name}</span>
                  <Badge variant="secondary">{humaniseEnum(analysis.type)}</Badge>
                  <Badge variant="outline">{analysis.status}</Badge>
                  <ConfidenceBadge score={analysis.confidence} />
                  <span className="ml-auto text-xs text-muted-foreground">
                    {formatDate(analysis.completedAt ?? analysis.startedAt)}
                  </span>
                  {analysis.summary && (
                    <p className="w-full text-xs text-muted-foreground">{analysis.summary}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Detection feeds</CardTitle>
          <CardDescription>
            Recomputed on every read from the current activity data.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="anomalies">
            <TabsList variant="line">
              <TabsTrigger value="anomalies">Anomalies ({anomalyRows.length})</TabsTrigger>
              <TabsTrigger value="gaps">Data gaps ({gaps.length})</TabsTrigger>
              <TabsTrigger value="forecast">Forecast</TabsTrigger>
              <TabsTrigger value="confidence">Confidence</TabsTrigger>
            </TabsList>

            <TabsContent value="anomalies" className="pt-3">
              <AnomalyFeed anomalies={anomalyRows} resolveAnomaly={resolveAnomalyAction} />
            </TabsContent>

            <TabsContent value="gaps" className="pt-3">
              {gaps.length === 0 ? (
                <EmptyState
                  title="No data gaps"
                  description="Every expected period in the reporting year carries a usable value."
                />
              ) : (
                <ul className="space-y-2">
                  {gaps.map((gap, index) => (
                    <li
                      key={`${gap.emissionSourceId}-${gap.periodLabel}-${index}`}
                      className="rounded-lg border p-2.5"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">{gap.dataCategory}</span>
                        <Badge variant="outline" className={GAP_SEVERITY_TONE[gap.severity] ?? ""}>
                          {gap.severity}
                        </Badge>
                        <Badge variant="outline">{humaniseEnum(gap.gapType)}</Badge>
                        <Badge variant="outline">{gap.periodLabel}</Badge>
                        <span className="ml-auto font-mono text-xs">
                          fill {formatNumber(gap.estimatedValue ?? 0, 2)} {gap.unit}
                        </span>
                      </div>
                      <p className="mt-1 text-xs">{gap.description}</p>
                      <p className="text-[11px] text-muted-foreground">
                        Estimation: {humaniseEnum(gap.estimationMethod)} at{" "}
                        {formatPercent(gap.confidenceLevel)} confidence · run length{" "}
                        {gap.runLength} · {gap.recommendation}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </TabsContent>

            <TabsContent value="forecast" className="space-y-2 pt-3">
              <p className="text-xs text-muted-foreground">{forecast.methodology}</p>
              {forecast.predictions.map((prediction) => (
                <div
                  key={prediction.horizon}
                  className="flex flex-wrap items-center gap-2 rounded-md border p-2.5 text-sm"
                >
                  <span className="font-medium">{prediction.horizon}</span>
                  <Badge variant="outline">
                    {formatEmissions(prediction.predictedValue)} {prediction.unit}
                  </Badge>
                  <ConfidenceBadge score={prediction.confidence} />
                  <span className="ml-auto font-mono text-xs text-muted-foreground">
                    {formatEmissions(prediction.lowerBound)} –{" "}
                    {formatEmissions(prediction.upperBound)}
                  </span>
                </div>
              ))}
            </TabsContent>

            <TabsContent value="confidence" className="space-y-2 pt-3">
              <p className="text-sm">{confidence.explanation}</p>
              <ul className="space-y-1">
                {confidence.breakdown.map((row) => (
                  <li key={row.factor} className="flex items-center gap-2 text-xs">
                    <span className="w-40 shrink-0 truncate" title={row.description}>
                      {row.factor}
                      {row.isDefaulted && (
                        <Badge variant="outline" className="ml-1">
                          default
                        </Badge>
                      )}
                    </span>
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <span
                        className="block h-full rounded-full bg-primary"
                        style={{ width: `${Math.min(100, row.score * 100)}%` }}
                      />
                    </span>
                    <span className="w-40 shrink-0 text-right font-mono">
                      {formatPercent(row.score * 100, 0)} × {formatNumber(row.weight, 2)} ={" "}
                      {formatNumber(row.contribution, 3)}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-[11px] text-muted-foreground">{confidence.methodology}</p>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {explanation ? (
        <ExplanationPanel explanation={explanation} />
      ) : (
        <EmptyState
          title="No result to explain"
          description="An explanation is built per emission result; there are none for this year."
        />
      )}

      {models.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Registered models</CardTitle>
            <CardDescription>
              `AIModel` rows describing which engine produced which analysis type.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {models.map((model) => (
              <div
                key={model.id}
                className="flex flex-wrap items-center gap-2 rounded-md border p-2.5 text-sm"
              >
                <span className="font-medium">{model.name}</span>
                <Badge variant="secondary">{humaniseEnum(model.type)}</Badge>
                <Badge variant="outline">v{model.version}</Badge>
                {model.provider && <Badge variant="outline">{model.provider}</Badge>}
                <span className="text-xs text-muted-foreground">{model.description}</span>
                <span className="ml-auto font-mono text-xs">
                  accuracy {formatPercent(model.accuracy * 100, 1)}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
