"use server";

/**
 * AI-analysis actions.
 *
 * The statistical engines produce the numbers; the LLM only narrates them. The
 * client is resolved **here**, at the action boundary, and injected into
 * `buildExplanation` — the domain and AI-assembly layers never import a client, so
 * they stay testable with no key and no network.
 *
 * `runAnalysisAction` writes the analysis and its whole explanation graph
 * (`AIExplanation` + `ExplanationStep` + `CalculationTrace` + `AssumptionLog` +
 * `ConfidenceBreakdown` + `EvidenceLink`) in one `$transaction`: an explanation
 * missing its steps is worse than no explanation, because it looks complete.
 */

import { NotFoundError } from "@/lib/core/errors";
import { getLlmClient } from "@/lib/ai/llm/factory";
import { buildExplanation } from "@/lib/ai/explain/build-explanation";
import type { EmissionCalcTraceStep } from "@/lib/domain/emissions/types";
import {
  getAnomalyFeed,
  getDataGaps,
  getEmissionsForecast,
  getInventoryConfidence,
} from "@/lib/data/repositories/ai";
import { prisma } from "@/lib/prisma";
import { resolveAnomalyInputSchema, runAnalysisInputSchema } from "@/lib/validation";

import { auditEntry, runAction } from "./runtime";
import type { ActionState } from "./types";

const PATHS = ["/ai-engine", "/analytics", "/dashboard"] as const;

export type RunAnalysisResult = {
  readonly analysisId: string;
  readonly explanationId: string | null;
  readonly type: string;
  readonly summary: string;
  readonly confidence: number | null;
  readonly findings: number;
  /** `"openai"` when a real key is configured, `"deterministic"` otherwise. */
  readonly narrativeSource: string;
  readonly tokensUsed: number;
};

/** Result rows the analysis produced, before they are shaped for Prisma. */
type AnalysisPayload = {
  readonly summary: string;
  readonly confidence: number | null;
  readonly outputData: Readonly<Record<string, unknown>>;
  readonly findings: number;
  /** Trace steps the explanation is built from. */
  readonly traces: readonly EmissionCalcTraceStep[];
  readonly assumptions: readonly { readonly assumption: string; readonly category: string }[];
  readonly persist: (
    tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
    analysisId: string,
  ) => Promise<void>;
};

/**
 * Runs one statistical analysis, persists its typed result rows and its
 * explanation graph.
 */
export async function runAnalysisAction(
  rawInput: unknown,
): Promise<ActionState<RunAnalysisResult>> {
  return runAction(
    {
      name: "runAnalysis",
      resource: "ai_analysis",
      action: "create",
      schema: runAnalysisInputSchema,
      revalidate: [...PATHS],
      attributes: (input) => ({ analysisType: input.type }),
      handler: async ({ session, input, organizationId }) => {
        const startedAt = new Date();
        const reportingYear = input.reportingYear ?? startedAt.getUTCFullYear();
        const payload = await buildPayload(input, organizationId, reportingYear);

        // Resolved at the boundary and injected, never imported inside the domain.
        const llm = getLlmClient();
        const explanation = input.explain
          ? await buildExplanation(
              {
                entityType: "AIAnalysis",
                entityId: `${input.type}:${reportingYear}`,
                title: `${input.name} — how this was derived`,
                summary: payload.summary,
                methodology: `Deterministic ${input.type.toLowerCase().replace(/_/g, " ")} over the reported activity series.`,
                traces: payload.traces,
                assumptions: payload.assumptions,
                metric: input.type,
                ...(payload.confidence !== null
                  ? { confidenceFactors: { dataQuality: payload.confidence } }
                  : {}),
              },
              { llm },
            )
          : null;

        const persisted = await prisma.$transaction(async (tx) => {
          const analysis = await tx.aIAnalysis.create({
            data: {
              organizationId,
              name: input.name,
              type: input.type,
              status: "COMPLETED",
              modelId: input.modelId ?? null,
              inputData: {
                reportingYear,
                anomalyMethod: input.anomalyMethod,
                anomalyThreshold: input.anomalyThreshold,
                horizon: input.horizon,
                forecastMethod: input.forecastMethod,
              } as never,
              outputData: payload.outputData as never,
              summary: payload.summary,
              confidence: payload.confidence,
              startedAt,
              completedAt: new Date(),
            },
            select: { id: true },
          });

          await payload.persist(tx, analysis.id);

          if (!explanation) return { analysisId: analysis.id, explanationId: null };

          const record = await tx.aIExplanation.create({
            data: {
              analysisId: analysis.id,
              title: explanation.explanation.title,
              entityType: explanation.explanation.entityType,
              entityId: explanation.explanation.entityId,
              summary: explanation.explanation.summary,
              methodology: explanation.explanation.methodology,
              confidence: explanation.explanation.confidence,
              humanReadable: explanation.explanation.humanReadable,
              technicalDetail: explanation.explanation.technicalDetail,
            },
            select: { id: true },
          });

          // All five child collections in the same transaction as their parent.
          if (explanation.steps.length > 0) {
            await tx.explanationStep.createMany({
              data: explanation.steps.map((step) => ({
                explanationId: record.id,
                stepNumber: step.stepNumber,
                title: step.title,
                description: step.description,
                inputData: step.inputData as never,
                outputData: step.outputData as never,
                methodology: step.methodology,
                confidence: step.confidence,
              })),
            });
          }
          if (explanation.calculationTraces.length > 0) {
            await tx.calculationTrace.createMany({
              data: explanation.calculationTraces.map((trace) => ({
                explanationId: record.id,
                stepName: trace.stepName,
                formula: trace.formula,
                inputs: trace.inputs as never,
                output: trace.output,
                unit: trace.unit,
                notes: trace.notes,
                orderIndex: trace.orderIndex,
              })),
            });
          }
          if (explanation.assumptions.length > 0) {
            await tx.assumptionLog.createMany({
              data: explanation.assumptions.map((assumption) => ({
                explanationId: record.id,
                assumption: assumption.assumption,
                category: assumption.category,
                justification: assumption.justification,
                source: assumption.source,
                impact: assumption.impact,
                sensitivity: assumption.sensitivity,
                isValidated: assumption.isValidated,
                validatedBy: assumption.validatedBy,
              })),
            });
          }
          if (explanation.confidenceBreakdowns.length > 0) {
            await tx.confidenceBreakdown.createMany({
              data: explanation.confidenceBreakdowns.map((breakdown) => ({
                explanationId: record.id,
                factor: breakdown.factor,
                score: breakdown.score,
                weight: breakdown.weight,
                description: breakdown.description,
                methodology: breakdown.methodology,
              })),
            });
          }
          if (explanation.evidenceLinks.length > 0) {
            await tx.evidenceLink.createMany({
              data: explanation.evidenceLinks.map((link) => ({
                explanationId: record.id,
                title: link.title,
                type: link.type,
                url: link.url,
                description: link.description,
                relevance: link.relevance,
              })),
            });
          }

          return { analysisId: analysis.id, explanationId: record.id };
        });

        return {
          data: {
            analysisId: persisted.analysisId,
            explanationId: persisted.explanationId,
            type: input.type,
            summary: payload.summary,
            confidence: payload.confidence,
            findings: payload.findings,
            narrativeSource: explanation?.narrativeSource ?? "none",
            tokensUsed: explanation?.tokensUsed ?? 0,
          },
          message: payload.summary,
          messageKey: "action.success.runAnalysis",
          audit: [
            auditEntry(session, {
              entityType: "AIAnalysis",
              entityId: persisted.analysisId,
              action: "create",
              after: {
                name: input.name,
                type: input.type,
                reportingYear,
                findings: payload.findings,
                confidence: payload.confidence,
                narrativeSource: explanation?.narrativeSource ?? "none",
              },
            }),
          ],
        };
      },
    },
    rawInput,
  );
}

/** Turns a trace-less analysis result into the one-step trace `buildExplanation` needs. */
function singleStepTrace(
  stepName: string,
  formula: string,
  inputs: Readonly<Record<string, number | string | boolean | null>>,
  output: number,
  unit: string,
): readonly EmissionCalcTraceStep[] {
  return [{ stepName, formula, inputs, output, unit, orderIndex: 0 }];
}

/** Dispatches to the right statistical engine and returns its persistence plan. */
async function buildPayload(
  input: {
    readonly type: string;
    readonly anomalyMethod: "zscore" | "iqr" | "seasonal";
    readonly anomalyThreshold: number;
    readonly horizon: number;
    readonly forecastMethod: "linear" | "holt";
  },
  organizationId: string,
  reportingYear: number,
): Promise<AnalysisPayload> {
  if (input.type === "ANOMALY_DETECTION") {
    const anomalies = await getAnomalyFeed(organizationId, {
      method: input.anomalyMethod,
      threshold: input.anomalyThreshold,
    });
    return {
      summary: `${anomalies.length} anomaly(ies) detected across the activity series at a ${input.anomalyThreshold}σ threshold.`,
      confidence: anomalies.length === 0 ? 1 : null,
      outputData: { method: input.anomalyMethod, count: anomalies.length },
      findings: anomalies.length,
      traces: singleStepTrace(
        "Anomaly screening",
        `count(|z| > ${input.anomalyThreshold})`,
        { method: input.anomalyMethod, threshold: input.anomalyThreshold },
        anomalies.length,
        "anomalies",
      ),
      assumptions: [
        {
          assumption: `Anomalies flagged by the ${input.anomalyMethod} method at ${input.anomalyThreshold}σ.`,
          category: "anomaly-detection",
        },
      ],
      persist: async (tx, analysisId) => {
        if (anomalies.length === 0) return;
        await tx.anomalyDetection.createMany({
          data: anomalies.map((anomaly) => ({
            analysisId,
            metric: anomaly.metric,
            detectedValue: anomaly.detectedValue,
            expectedValue: anomaly.expectedValue,
            deviation: anomaly.deviation,
            severity: anomaly.severity,
            description: anomaly.description,
            isResolved: anomaly.isResolved,
            detectedAt: anomaly.detectedAt,
          })),
        });
      },
    };
  }

  if (input.type === "FORECAST") {
    const result = await getEmissionsForecast(organizationId, {
      horizon: input.horizon,
      method: input.forecastMethod,
    });
    const last = result.predictions.at(-1);
    return {
      summary: `Forecast ${result.predictions.length} period(s) ahead; ${last ? `${last.predictedValue.toFixed(1)} ${result.unit} by ${last.targetDate.getUTCFullYear()}` : "no periods produced"}.`,
      confidence: last?.confidence ?? null,
      outputData: {
        method: input.forecastMethod,
        horizon: input.horizon,
        rSquared: result.model.rSquared,
      },
      findings: result.predictions.length,
      traces: singleStepTrace(
        "Trend extrapolation",
        result.methodology,
        {
          method: input.forecastMethod,
          horizon: input.horizon,
          rSquared: result.model.rSquared,
        },
        last?.predictedValue ?? 0,
        result.unit,
      ),
      assumptions: [
        {
          assumption: `${result.methodology}; R² = ${result.model.rSquared.toFixed(3)}.`,
          category: "forecast",
        },
      ],
      persist: async (tx, analysisId) => {
        if (result.predictions.length === 0) return;
        await tx.aIPrediction.createMany({
          data: result.predictions.map((prediction) => ({
            analysisId,
            metric: prediction.metric,
            predictedValue: prediction.predictedValue,
            actualValue: prediction.actualValue,
            confidence: prediction.confidence,
            lowerBound: prediction.lowerBound,
            upperBound: prediction.upperBound,
            horizon: prediction.horizon,
            targetDate: prediction.targetDate,
            methodology: prediction.methodology,
            features: prediction.features as never,
          })),
        });
      },
    };
  }

  if (input.type === "GAP_ANALYSIS") {
    const gaps = await getDataGaps(organizationId, reportingYear);
    return {
      summary: `${gaps.length} data gap(s) found in the ${reportingYear} activity series.`,
      confidence: gaps.length === 0 ? 1 : null,
      outputData: { reportingYear, count: gaps.length },
      findings: gaps.length,
      traces: singleStepTrace(
        "Coverage check",
        "expectedPeriods − reportedPeriods",
        { reportingYear },
        gaps.length,
        "gaps",
      ),
      assumptions: [
        {
          assumption: `Twelve monthly periods are expected per emission source for ${reportingYear}.`,
          category: "gap-analysis",
        },
      ],
      persist: async (tx, analysisId) => {
        if (gaps.length === 0) return;
        await tx.dataGapAnalysis.createMany({
          data: gaps.map((gap) => ({
            analysisId,
            dataCategory: gap.dataCategory,
            gapType: gap.gapType,
            description: gap.description,
            severity: gap.severity,
            affectedPeriodStart: gap.affectedPeriodStart,
            affectedPeriodEnd: gap.affectedPeriodEnd,
            estimationMethod: gap.estimationMethod,
            estimatedValue: gap.estimatedValue,
            confidenceLevel: gap.confidenceLevel,
            recommendation: gap.recommendation,
            isResolved: gap.isResolved,
          })),
        });
      },
    };
  }

  // CONFIDENCE_SCORING and RECOMMENDATION both rest on the inventory confidence
  // score; a recommendation without a confidence figure is not actionable.
  const score = await getInventoryConfidence(organizationId, reportingYear);
  return {
    summary: `Inventory confidence for ${reportingYear}: ${score.scorePercent.toFixed(0)}% (${score.level}); weakest factor is ${score.weakestFactor}.`,
    confidence: score.score,
    outputData: { reportingYear, level: score.level, factors: score.factors },
    findings: score.breakdown.length,
    traces: score.breakdown.map((row, index) => ({
      stepName: `Confidence factor: ${row.factor}`,
      formula: `${row.factor} × weight ${row.weight}`,
      inputs: { score: row.score, weight: row.weight },
      output: row.contribution,
      unit: "score",
      ...(row.description ? { notes: row.description } : {}),
      orderIndex: index,
    })),
    assumptions: [{ assumption: score.methodology, category: "confidence-scoring" }],
    persist: async (tx, analysisId) => {
      await tx.aIConfidenceScore.create({
        data: {
          analysisId,
          metric: score.metric,
          score: score.score,
          methodology: score.methodology,
          factors: score.factors as never,
          explanation: score.explanation,
        },
      });
    },
  };
}

/** Closes out an anomaly with a human verdict. */
export async function resolveAnomalyAction(
  rawInput: unknown,
): Promise<ActionState<{ readonly id: string; readonly resolution: string }>> {
  return runAction(
    {
      name: "resolveAnomaly",
      resource: "ai_analysis",
      action: "update",
      schema: resolveAnomalyInputSchema,
      revalidate: [...PATHS],
      handler: async ({ session, input, organizationId }) => {
        const before = await prisma.anomalyDetection.findFirst({
          where: {
            id: input.anomalyId,
            analysis: { organizationId },
          },
          select: { id: true, isResolved: true, resolution: true, metric: true },
        });
        if (!before) {
          throw new NotFoundError(`Anomaly ${input.anomalyId} was not found`);
        }

        const resolvedAt = new Date();
        await prisma.anomalyDetection.update({
          where: { id: input.anomalyId },
          data: {
            isResolved: true,
            resolution: input.resolution,
            resolvedAt,
            resolvedBy: session.userId,
            ...(input.notes ? { description: input.notes } : {}),
          },
        });

        return {
          data: { id: input.anomalyId, resolution: input.resolution },
          message: `Anomaly on "${before.metric}" resolved as ${input.resolution}.`,
          messageKey: "action.success.resolveAnomaly",
          audit: [
            auditEntry(session, {
              entityType: "AnomalyDetection",
              entityId: input.anomalyId,
              action: "update",
              before: { isResolved: before.isResolved, resolution: before.resolution },
              after: { isResolved: true, resolution: input.resolution },
              reason: input.notes ?? null,
            }),
          ],
        };
      },
    },
    rawInput,
  );
}
