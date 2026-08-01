/**
 * Explainable-AI assembly.
 *
 * Turns a calculation trace into the full explanation graph the schema models:
 * `AIExplanation` + `ExplanationStep[]` + `CalculationTrace[]` + `AssumptionLog[]`
 * + `ConfidenceBreakdown[]` + `EvidenceLink[]`.
 *
 * The division of labour is deliberate and is the whole point of the design:
 *
 *  - `technicalDetail` is generated **deterministically** from the trace. It
 *    contains every formula, input and output, so a verifier can re-perform the
 *    calculation from the explanation alone. It never passes through a model.
 *  - `humanReadable` is the only field a language model writes, and it is written
 *    *over* those same numbers. Nothing in it originates with the model.
 *
 * The `LlmClient` is a parameter, never an import: the caller resolves it at the
 * edge with `getLlmClient()`. When none is supplied the explanation is still
 * complete — `humanReadable` is simply `null` and `narrativeSource` says so.
 *
 * No framework, database or network imports.
 */

import type { EmissionCalcTraceStep } from "@/lib/domain/emissions/types";
import {
  scoreConfidence,
  type ConfidenceFactorInput,
  type ConfidenceScore,
} from "@/lib/domain/ai/confidence";

import type { LlmClient, LlmCompletionOptions } from "../llm/types";

export const EXPLANATION_SYSTEM_PROMPT =
  "You are a greenhouse-gas inventory analyst. Explain the calculation below in plain language for a non-specialist reader. Use only the figures given; never introduce a number that is not present. Be concise and factual.";

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export type AssumptionInput = {
  readonly assumption: string;
  readonly category?: string;
  readonly justification?: string;
  readonly source?: string;
  readonly impact?: string;
  /** Sensitivity of the result to this assumption, as a fraction. */
  readonly sensitivity?: number;
  readonly isValidated?: boolean;
  readonly validatedBy?: string;
};

export type EvidenceLinkInput = {
  readonly title: string;
  readonly type: string;
  readonly url?: string;
  readonly description?: string;
  /** Relevance to the conclusion, 0..1. */
  readonly relevance?: number;
};

export type ExplainedResult = {
  readonly label: string;
  readonly value: number;
  readonly unit: string;
};

export type BuildExplanationInput = {
  readonly entityType: string;
  readonly entityId: string;
  readonly title?: string;
  readonly summary?: string;
  readonly methodology?: string;
  /** Ordered trace steps, e.g. `CalculationOutcome.traces[n].steps`. */
  readonly traces: readonly EmissionCalcTraceStep[];
  readonly assumptions?: readonly AssumptionInput[];
  readonly confidenceFactors?: ConfidenceFactorInput;
  readonly evidence?: readonly EvidenceLinkInput[];
  /** Headline figure the explanation is about. */
  readonly result?: ExplainedResult;
  readonly analysisId?: string | null;
  readonly metric?: string;
};

export type BuildExplanationDeps = {
  /** Injected; resolved by the caller from `getLlmClient()`. */
  readonly llm?: LlmClient;
  readonly llmOptions?: LlmCompletionOptions;
};

// ---------------------------------------------------------------------------
// Output records
// ---------------------------------------------------------------------------

/** Plain object shaped to the `AIExplanation` model. */
export type AIExplanationRecord = {
  readonly title: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly summary: string;
  readonly methodology: string;
  readonly confidence: number | null;
  readonly humanReadable: string | null;
  readonly technicalDetail: string;
  readonly analysisId: string | null;
};

/** Plain object shaped to the `ExplanationStep` model. */
export type ExplanationStepRecord = {
  readonly stepNumber: number;
  readonly title: string;
  readonly description: string;
  readonly inputData: Readonly<Record<string, number | string | boolean | null>>;
  readonly outputData: { readonly value: number; readonly unit: string };
  readonly methodology: string;
  readonly confidence: number | null;
};

/** Plain object shaped to the `CalculationTrace` model. */
export type CalculationTraceRecord = {
  readonly stepName: string;
  readonly formula: string;
  readonly inputs: Readonly<Record<string, number | string | boolean | null>>;
  readonly output: number;
  readonly unit: string;
  readonly notes: string | null;
  readonly orderIndex: number;
};

/** Plain object shaped to the `AssumptionLog` model. */
export type AssumptionLogRecord = {
  readonly assumption: string;
  readonly category: string | null;
  readonly justification: string | null;
  readonly source: string | null;
  readonly impact: string | null;
  readonly sensitivity: number | null;
  readonly isValidated: boolean;
  readonly validatedBy: string | null;
};

/** Plain object shaped to the `ConfidenceBreakdown` model. */
export type ConfidenceBreakdownRecord = {
  readonly factor: string;
  readonly score: number;
  readonly weight: number;
  readonly description: string;
  readonly methodology: string;
};

/** Plain object shaped to the `EvidenceLink` model. */
export type EvidenceLinkRecord = {
  readonly title: string;
  readonly type: string;
  readonly url: string | null;
  readonly description: string | null;
  readonly relevance: number | null;
};

export const NARRATIVE_SOURCES = ["llm", "none", "error"] as const;
export type NarrativeSource = (typeof NARRATIVE_SOURCES)[number];

export type Explanation = {
  readonly explanation: AIExplanationRecord;
  readonly steps: readonly ExplanationStepRecord[];
  readonly calculationTraces: readonly CalculationTraceRecord[];
  readonly assumptions: readonly AssumptionLogRecord[];
  readonly confidenceBreakdowns: readonly ConfidenceBreakdownRecord[];
  readonly evidenceLinks: readonly EvidenceLinkRecord[];
  readonly confidence: ConfidenceScore | null;
  /** The exact prompt sent to the model, retained for the audit trail. */
  readonly prompt: string;
  readonly narrativeSource: NarrativeSource;
  readonly llmProvider: string | null;
  readonly llmModel: string | null;
  readonly tokensUsed: number;
  readonly costUsd: number;
  /** Populated when narrative generation failed; the explanation is still valid. */
  readonly narrativeError: string | null;
};

// ---------------------------------------------------------------------------
// Deterministic rendering
// ---------------------------------------------------------------------------

function formatInputs(
  inputs: Readonly<Record<string, number | string | boolean | null>>,
): string {
  const entries = Object.entries(inputs);
  if (entries.length === 0) return "no inputs";
  return entries.map(([key, value]) => `${key}=${value === null ? "null" : value}`).join(", ");
}

/**
 * Deterministic technical narrative.
 *
 * Every step's formula string appears verbatim, in `orderIndex` order, which is
 * what makes the explanation re-performable.
 */
export function buildTechnicalDetail(
  traces: readonly EmissionCalcTraceStep[],
  result?: ExplainedResult,
): string {
  const ordered = [...traces].sort((a, b) => a.orderIndex - b.orderIndex);
  const lines: string[] = [];
  if (result) {
    lines.push(`Result: ${result.label} = ${result.value} ${result.unit}`);
    lines.push("");
  }
  lines.push(`Calculation steps (${ordered.length}):`);
  ordered.forEach((step, index) => {
    lines.push(
      `${index + 1}. ${step.stepName} | formula: ${step.formula} | inputs: ${formatInputs(step.inputs)} | output: ${step.output} ${step.unit}${step.notes ? ` | note: ${step.notes}` : ""}`,
    );
  });
  return lines.join("\n");
}

/**
 * The prompt used for `humanReadable`.
 *
 * Facts are emitted as `label: value` lines, which is the shape
 * `DeterministicLlmClient` reads, so the deterministic path produces a sensible
 * narrative from exactly the same prompt a hosted model would receive.
 */
export function buildExplanationPrompt(input: BuildExplanationInput): string {
  const ordered = [...input.traces].sort((a, b) => a.orderIndex - b.orderIndex);
  const lines: string[] = [
    `Explain the ${input.metric ?? "emission"} result for ${input.entityType} ${input.entityId} in plain language.`,
  ];
  if (input.result) {
    lines.push(`- Result (${input.result.label}): ${input.result.value} ${input.result.unit}`);
  }
  for (const step of ordered) {
    lines.push(`- ${step.stepName}: ${step.output} ${step.unit} via ${step.formula}`);
  }
  for (const assumption of input.assumptions ?? []) {
    lines.push(`- Assumption: ${assumption.assumption}`);
  }
  return lines.join("\n");
}

function defaultSummary(input: BuildExplanationInput, stepCount: number): string {
  const result = input.result;
  return result
    ? `${result.label} of ${result.value} ${result.unit} for ${input.entityType} ${input.entityId}, derived in ${stepCount} traced step(s).`
    : `${input.entityType} ${input.entityId} explained in ${stepCount} traced step(s).`;
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

/**
 * Assembles the explanation graph.
 *
 * One `ExplanationStep` per trace step, numbered from 1 in `orderIndex` order.
 * `technicalDetail` and every record except `humanReadable` are produced without
 * touching the network; if the injected client throws, the explanation is still
 * returned with `narrativeSource: "error"` rather than the whole calculation
 * being lost to a failed narrative call.
 */
export async function buildExplanation(
  input: BuildExplanationInput,
  deps: BuildExplanationDeps = {},
): Promise<Explanation> {
  const ordered = [...input.traces].sort((a, b) => a.orderIndex - b.orderIndex);

  const confidence =
    input.confidenceFactors === undefined
      ? null
      : scoreConfidence(input.confidenceFactors, {
          metric: input.metric ?? `${input.entityType}:${input.entityId}`,
        });

  const steps: ExplanationStepRecord[] = ordered.map((step, index) => ({
    stepNumber: index + 1,
    title: step.stepName,
    description: `${step.formula} → ${step.output} ${step.unit}${step.notes ? ` (${step.notes})` : ""}`,
    inputData: step.inputs,
    outputData: { value: step.output, unit: step.unit },
    methodology: step.formula,
    confidence: confidence?.score ?? null,
  }));

  const calculationTraces: CalculationTraceRecord[] = ordered.map((step) => ({
    stepName: step.stepName,
    formula: step.formula,
    inputs: step.inputs,
    output: step.output,
    unit: step.unit,
    notes: step.notes ?? null,
    orderIndex: step.orderIndex,
  }));

  const assumptions: AssumptionLogRecord[] = (input.assumptions ?? []).map((assumption) => ({
    assumption: assumption.assumption,
    category: assumption.category ?? null,
    justification: assumption.justification ?? null,
    source: assumption.source ?? null,
    impact: assumption.impact ?? null,
    sensitivity: assumption.sensitivity ?? null,
    isValidated: assumption.isValidated ?? false,
    validatedBy: assumption.validatedBy ?? null,
  }));

  const confidenceBreakdowns: ConfidenceBreakdownRecord[] = (confidence?.breakdown ?? []).map(
    (row) => ({
      factor: row.factor,
      score: row.score,
      weight: row.weight,
      description: row.description,
      methodology: row.methodology,
    }),
  );

  const evidenceLinks: EvidenceLinkRecord[] = (input.evidence ?? []).map((evidence) => ({
    title: evidence.title,
    type: evidence.type,
    url: evidence.url ?? null,
    description: evidence.description ?? null,
    relevance: evidence.relevance ?? null,
  }));

  const technicalDetail = buildTechnicalDetail(ordered, input.result);
  const prompt = buildExplanationPrompt(input);

  let humanReadable: string | null = null;
  let narrativeSource: NarrativeSource = "none";
  let narrativeError: string | null = null;
  let tokensUsed = 0;
  let costUsd = 0;
  let llmProvider: string | null = null;
  let llmModel: string | null = null;

  if (deps.llm) {
    llmProvider = deps.llm.provider;
    llmModel = deps.llm.model;
    try {
      const completion = await deps.llm.complete(prompt, {
        system: EXPLANATION_SYSTEM_PROMPT,
        temperature: 0,
        ...deps.llmOptions,
      });
      humanReadable = completion.text;
      narrativeSource = "llm";
      tokensUsed = completion.tokensUsed;
      costUsd = completion.costUsd;
      llmModel = completion.model;
    } catch (error) {
      narrativeSource = "error";
      narrativeError = error instanceof Error ? error.message : String(error);
    }
  }

  return {
    explanation: {
      title: input.title ?? `Explanation of ${input.entityType} ${input.entityId}`,
      entityType: input.entityType,
      entityId: input.entityId,
      summary: input.summary ?? defaultSummary(input, ordered.length),
      methodology:
        input.methodology ??
        `Deterministic calculation trace of ${ordered.length} step(s); narrative rendered by ${llmProvider ?? "no"} provider over the same figures`,
      confidence: confidence?.score ?? null,
      humanReadable,
      technicalDetail,
      analysisId: input.analysisId ?? null,
    },
    steps,
    calculationTraces,
    assumptions,
    confidenceBreakdowns,
    evidenceLinks,
    confidence,
    prompt,
    narrativeSource,
    llmProvider,
    llmModel,
    tokensUsed,
    costUsd,
    narrativeError,
  };
}

// ---------------------------------------------------------------------------
// Orchestrator bridge
// ---------------------------------------------------------------------------

/** The slice of `CalculationOutcome` the bridge needs. */
export type ExplainableOutcome = {
  readonly results: readonly {
    readonly id: string;
    readonly totalCO2e: number;
    readonly unit: string;
    readonly method: string;
    readonly activityDataEntryId: string;
    readonly emissionFactorId: string | null;
  }[];
  readonly traces: readonly {
    readonly resultId: string;
    readonly steps: readonly EmissionCalcTraceStep[];
  }[];
  readonly quality: {
    readonly byResultId: Readonly<Record<string, { readonly overallScore: number }>>;
  };
  readonly uncertainty: { readonly overallUncertainty: number };
  readonly factorSelections: Readonly<Record<string, readonly string[]>>;
};

/**
 * Builds the explanation input for one result of a `runCalculation` outcome.
 *
 * The factor-selection rationale becomes an assumption log entry, because "we
 * used this factor rather than that one" is exactly the kind of judgement an
 * assurance provider asks about.
 */
export function explanationInputFromOutcome(
  outcome: ExplainableOutcome,
  resultId: string,
  overrides: Partial<BuildExplanationInput> = {},
): BuildExplanationInput {
  const result = outcome.results.find((candidate) => candidate.id === resultId);
  if (!result) {
    throw new Error(`No emission result with id ${resultId} in the calculation outcome`);
  }
  const trace = outcome.traces.find((candidate) => candidate.resultId === resultId);
  const rationale = outcome.factorSelections[result.activityDataEntryId] ?? [];

  // The factor rationale is merged with, not replaced by, any caller-supplied
  // assumptions; the same is true of the derived confidence factors.
  const assumptions: AssumptionInput[] = [
    ...rationale.map((line) => ({
      assumption: line,
      category: "emission-factor-selection",
      source: result.emissionFactorId ?? "no factor required",
    })),
    ...(overrides.assumptions ?? []),
  ];
  const confidenceFactors: ConfidenceFactorInput = {
    dataQuality: (outcome.quality.byResultId[resultId]?.overallScore ?? 60) / 100,
    uncertainty: Math.max(0, 1 - outcome.uncertainty.overallUncertainty / 30),
    ...(overrides.confidenceFactors ?? {}),
  };

  return {
    entityType: "EmissionResult",
    entityId: resultId,
    metric: "emission",
    result: {
      label: `Total emissions (${result.method})`,
      value: result.totalCO2e,
      unit: result.unit,
    },
    traces: trace?.steps ?? [],
    ...overrides,
    assumptions,
    confidenceFactors,
  };
}
