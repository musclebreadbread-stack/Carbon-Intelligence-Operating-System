import { describe, expect, it, vi } from "vitest";

import { calendarYear } from "@/lib/core/period";
import { runCalculation } from "@/lib/domain/emissions/orchestrator";
import type { EmissionFactorLike } from "@/lib/domain/factors/types";

import { DeterministicLlmClient } from "../llm/deterministic-client";
import { LlmError, type LlmClient } from "../llm/types";

import {
  EXPLANATION_SYSTEM_PROMPT,
  buildExplanation,
  buildExplanationPrompt,
  buildTechnicalDetail,
  explanationInputFromOutcome,
  type BuildExplanationInput,
} from "./build-explanation";

// ---------------------------------------------------------------------------
// A real orchestrator run, so the explanation is built from genuine traces.
// ---------------------------------------------------------------------------

const period = calendarYear(2024);

const factors: readonly EmissionFactorLike[] = [
  {
    id: "ef-gas",
    name: "Natural gas (DEFRA 2024)",
    value: 2.02,
    unit: "KG_CO2E_PER_M3",
    gasType: "CO2e",
    scope: "SCOPE_1",
    country: "KR",
    validFrom: new Date(Date.UTC(2024, 0, 1)),
    isActive: true,
    uncertainty: 0.05,
  },
  {
    id: "ef-grid",
    name: "Korean grid (2024)",
    value: 0.4594,
    unit: "KG_CO2E_PER_KWH",
    gasType: "CO2e",
    scope: "SCOPE_2_LOCATION",
    country: "KR",
    validFrom: new Date(Date.UTC(2024, 0, 1)),
    isActive: true,
    uncertainty: 0.03,
  },
];

const outcome = runCalculation({
  organizationId: "org-1",
  name: "2024 inventory",
  reportingYear: 2024,
  period,
  gwpVersion: "AR6",
  candidateFactors: factors,
  entries: [
    {
      id: "entry-gas",
      name: "Ulsan boiler natural gas",
      quantity: 12_000,
      unit: "m3",
      scope: "SCOPE_1",
      scope1SourceType: "STATIONARY",
      country: "KR",
      measurementType: "METERED",
    },
    {
      id: "entry-grid",
      name: "Ulsan purchased electricity",
      quantity: 850_000,
      unit: "kWh",
      scope: "SCOPE_2_LOCATION",
      country: "KR",
      measurementType: "INVOICED",
    },
  ],
});

const gasResultId = outcome.results[0].id;
const gasTrace = outcome.traces[0].steps;

const baseInput: BuildExplanationInput = {
  entityType: "EmissionResult",
  entityId: gasResultId,
  metric: "emission",
  traces: gasTrace,
  result: {
    label: "Total emissions",
    value: outcome.results[0].totalCO2e,
    unit: outcome.results[0].unit,
  },
};

describe("buildTechnicalDetail", () => {
  it("contains every formula string in orderIndex order", () => {
    const detail = buildTechnicalDetail(gasTrace, baseInput.result);
    expect(gasTrace.length).toBeGreaterThan(0);
    for (const step of gasTrace) {
      expect(detail).toContain(step.formula);
      expect(detail).toContain(step.stepName);
    }
    const positions = gasTrace
      .map((step) => detail.indexOf(step.formula))
      .filter((position) => position >= 0);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it("records the headline result and the inputs of each step", () => {
    const detail = buildTechnicalDetail(gasTrace, baseInput.result);
    expect(detail).toContain("Result: Total emissions");
    expect(detail).toContain("inputs:");
    expect(detail).toContain(`Calculation steps (${gasTrace.length})`);
  });

  it("re-sorts steps supplied out of order", () => {
    const detail = buildTechnicalDetail([...gasTrace].reverse(), baseInput.result);
    expect(detail).toBe(buildTechnicalDetail(gasTrace, baseInput.result));
  });

  it("works with no result and no steps", () => {
    expect(buildTechnicalDetail([])).toBe("Calculation steps (0):");
  });
});

describe("buildExplanationPrompt", () => {
  it("emits label/value fact lines the deterministic client can read", () => {
    const prompt = buildExplanationPrompt(baseInput);
    expect(prompt).toContain("Explain the emission result for EmissionResult");
    expect(prompt).toContain("- Result (Total emissions):");
    for (const step of gasTrace) {
      expect(prompt).toContain(step.stepName);
    }
  });

  it("includes the assumptions", () => {
    const prompt = buildExplanationPrompt({
      ...baseInput,
      assumptions: [{ assumption: "Boiler efficiency assumed at 92 %" }],
    });
    expect(prompt).toContain("- Assumption: Boiler efficiency assumed at 92 %");
  });
});

describe("buildExplanation with the deterministic client injected", () => {
  it("yields one ExplanationStep per trace step in stepNumber order", async () => {
    const llm = new DeterministicLlmClient();
    const explanation = await buildExplanation(baseInput, { llm });

    expect(explanation.steps).toHaveLength(gasTrace.length);
    expect(explanation.steps.map((step) => step.stepNumber)).toEqual(
      gasTrace.map((_, index) => index + 1),
    );
    expect(explanation.steps.map((step) => step.title)).toEqual(
      gasTrace.map((step) => step.stepName),
    );
    expect(explanation.steps[0].outputData).toEqual({
      value: gasTrace[0].output,
      unit: gasTrace[0].unit,
    });
    expect(explanation.steps[0].inputData).toEqual(gasTrace[0].inputs);
  });

  it("puts every formula string in technicalDetail", async () => {
    const explanation = await buildExplanation(baseInput, {
      llm: new DeterministicLlmClient(),
    });
    for (const step of gasTrace) {
      expect(explanation.explanation.technicalDetail).toContain(step.formula);
    }
  });

  it("produces a non-empty humanReadable with zero network calls", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    try {
      const llm = new DeterministicLlmClient();
      const explanation = await buildExplanation(baseInput, { llm });
      expect(explanation.explanation.humanReadable).toBeTruthy();
      expect((explanation.explanation.humanReadable as string).length).toBeGreaterThan(20);
      expect(explanation.narrativeSource).toBe("llm");
      expect(explanation.llmProvider).toBe("deterministic");
      expect(explanation.costUsd).toBe(0);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("sends the recorded prompt with the explanation system prompt", async () => {
    const llm = new DeterministicLlmClient();
    const explanation = await buildExplanation(baseInput, { llm });
    expect(llm.calls).toHaveLength(1);
    expect(llm.calls[0].messages[0]).toEqual({
      role: "system",
      content: EXPLANATION_SYSTEM_PROMPT,
    });
    expect(llm.calls[0].messages[1].content).toBe(explanation.prompt);
    expect(llm.calls[0].options.temperature).toBe(0);
  });

  it("is reproducible: the same input yields the same explanation", async () => {
    const first = await buildExplanation(baseInput, { llm: new DeterministicLlmClient() });
    const second = await buildExplanation(baseInput, { llm: new DeterministicLlmClient() });
    expect(second).toEqual(first);
  });

  it("shapes the AIExplanation record", async () => {
    const explanation = await buildExplanation(
      { ...baseInput, analysisId: "an-1", title: "Boiler explanation" },
      { llm: new DeterministicLlmClient() },
    );
    expect(explanation.explanation).toMatchObject({
      title: "Boiler explanation",
      entityType: "EmissionResult",
      entityId: gasResultId,
      analysisId: "an-1",
    });
    expect(explanation.explanation.summary).toContain("Total emissions of");
    expect(explanation.explanation.methodology).toContain("deterministic");
  });

  it("mirrors the trace into CalculationTrace records", async () => {
    const explanation = await buildExplanation(baseInput, {
      llm: new DeterministicLlmClient(),
    });
    expect(explanation.calculationTraces).toHaveLength(gasTrace.length);
    expect(explanation.calculationTraces[0]).toMatchObject({
      stepName: gasTrace[0].stepName,
      formula: gasTrace[0].formula,
      output: gasTrace[0].output,
      unit: gasTrace[0].unit,
      orderIndex: gasTrace[0].orderIndex,
    });
  });
});

describe("assumptions, confidence and evidence", () => {
  it("shapes assumptions to AssumptionLog with defaults", async () => {
    const explanation = await buildExplanation(
      {
        ...baseInput,
        assumptions: [
          {
            assumption: "Boiler efficiency assumed at 92 %",
            category: "engineering",
            justification: "Manufacturer data sheet",
            sensitivity: 0.03,
          },
          { assumption: "No biogenic content in the gas supply" },
        ],
      },
      { llm: new DeterministicLlmClient() },
    );
    expect(explanation.assumptions).toHaveLength(2);
    expect(explanation.assumptions[0]).toMatchObject({
      category: "engineering",
      justification: "Manufacturer data sheet",
      sensitivity: 0.03,
      isValidated: false,
      validatedBy: null,
    });
    expect(explanation.assumptions[1]).toMatchObject({
      category: null,
      justification: null,
      sensitivity: null,
    });
  });

  it("scores confidence and emits one breakdown row per factor", async () => {
    const explanation = await buildExplanation(
      {
        ...baseInput,
        confidenceFactors: { dataQuality: 0.9, coverage: 1, uncertainty: 0.8 },
      },
      { llm: new DeterministicLlmClient() },
    );
    expect(explanation.confidence).not.toBeNull();
    expect(explanation.confidenceBreakdowns).toHaveLength(6);
    expect(explanation.explanation.confidence).toBeCloseTo(
      explanation.confidence?.score ?? 0,
      12,
    );
    expect(
      explanation.confidenceBreakdowns.reduce(
        (total, row) => total + row.score * row.weight,
        0,
      ),
    ).toBeCloseTo(explanation.confidence?.score ?? 0, 12);
    expect(explanation.steps.every((step) => step.confidence !== null)).toBe(true);
  });

  it("leaves confidence null when no factors are supplied", async () => {
    const explanation = await buildExplanation(baseInput, {
      llm: new DeterministicLlmClient(),
    });
    expect(explanation.confidence).toBeNull();
    expect(explanation.confidenceBreakdowns).toEqual([]);
    expect(explanation.explanation.confidence).toBeNull();
    expect(explanation.steps[0].confidence).toBeNull();
  });

  it("shapes evidence to EvidenceLink records", async () => {
    const explanation = await buildExplanation(
      {
        ...baseInput,
        evidence: [
          {
            title: "Gas invoice 2024-01",
            type: "invoice",
            url: "https://example.invalid/inv-1",
            relevance: 0.9,
          },
          { title: "Meter log", type: "meter" },
        ],
      },
      { llm: new DeterministicLlmClient() },
    );
    expect(explanation.evidenceLinks).toEqual([
      {
        title: "Gas invoice 2024-01",
        type: "invoice",
        url: "https://example.invalid/inv-1",
        description: null,
        relevance: 0.9,
      },
      { title: "Meter log", type: "meter", url: null, description: null, relevance: null },
    ]);
  });
});

describe("narrative fallbacks", () => {
  it("omits humanReadable when no client is injected", async () => {
    const explanation = await buildExplanation(baseInput);
    expect(explanation.explanation.humanReadable).toBeNull();
    expect(explanation.narrativeSource).toBe("none");
    expect(explanation.llmProvider).toBeNull();
    expect(explanation.tokensUsed).toBe(0);
    // The deterministic half of the explanation is still complete.
    expect(explanation.steps).toHaveLength(gasTrace.length);
    expect(explanation.explanation.technicalDetail.length).toBeGreaterThan(0);
  });

  it("survives a failing client without losing the explanation", async () => {
    const failing: LlmClient = {
      provider: "openai",
      model: "gpt-4o-mini",
      isDeterministic: false,
      complete: () =>
        Promise.reject(new LlmError("LLM_RATE_LIMITED", "rate limited", { status: 429 })),
      completeJson: () => Promise.reject(new Error("not used")),
    };
    const explanation = await buildExplanation(baseInput, { llm: failing });
    expect(explanation.narrativeSource).toBe("error");
    expect(explanation.narrativeError).toContain("rate limited");
    expect(explanation.explanation.humanReadable).toBeNull();
    expect(explanation.steps).toHaveLength(gasTrace.length);
  });

  it("records the token and cost figures a hosted model reports", async () => {
    const priced: LlmClient = {
      provider: "openai",
      model: "gpt-4o-mini",
      isDeterministic: false,
      complete: () =>
        Promise.resolve({
          text: "A clear narrative.",
          tokensUsed: 150,
          promptTokens: 100,
          completionTokens: 50,
          model: "gpt-4o-mini",
          costUsd: 0.000045,
          finishReason: "stop" as const,
          provider: "openai",
          durationMs: 12,
        }),
      completeJson: () => Promise.reject(new Error("not used")),
    };
    const explanation = await buildExplanation(baseInput, { llm: priced });
    expect(explanation.tokensUsed).toBe(150);
    expect(explanation.costUsd).toBeCloseTo(0.000045, 12);
    expect(explanation.llmModel).toBe("gpt-4o-mini");
    expect(explanation.explanation.humanReadable).toBe("A clear narrative.");
  });
});

describe("explanationInputFromOutcome", () => {
  it("builds the input straight from a runCalculation outcome", () => {
    const input = explanationInputFromOutcome(outcome, gasResultId);
    expect(input.entityType).toBe("EmissionResult");
    expect(input.entityId).toBe(gasResultId);
    expect(input.traces).toEqual(gasTrace);
    expect(input.result?.value).toBe(outcome.results[0].totalCO2e);
    expect(input.result?.unit).toBe("tCO2e");
  });

  it("turns the factor-selection rationale into assumption entries", () => {
    const input = explanationInputFromOutcome(outcome, gasResultId);
    expect(input.assumptions?.length).toBeGreaterThan(0);
    expect(input.assumptions?.[0].category).toBe("emission-factor-selection");
    expect(input.assumptions?.[0].source).toBe("ef-gas");
  });

  it("derives confidence factors from the calculation's own quality and uncertainty", () => {
    const input = explanationInputFromOutcome(outcome, gasResultId);
    expect(input.confidenceFactors?.dataQuality).toBeCloseTo(
      outcome.quality.byResultId[gasResultId].overallScore / 100,
      9,
    );
    expect(input.confidenceFactors?.uncertainty).toBeGreaterThan(0);
  });

  it("merges caller overrides with the derived values", () => {
    const input = explanationInputFromOutcome(outcome, gasResultId, {
      title: "Custom title",
      assumptions: [{ assumption: "Extra assumption" }],
      confidenceFactors: { verification: 1 },
    });
    expect(input.title).toBe("Custom title");
    expect(input.assumptions?.some((a) => a.assumption === "Extra assumption")).toBe(true);
    expect(input.assumptions?.length).toBeGreaterThan(1);
    expect(input.confidenceFactors?.verification).toBe(1);
    expect(input.confidenceFactors?.dataQuality).toBeGreaterThan(0);
  });

  it("produces a full explanation end to end", async () => {
    const llm = new DeterministicLlmClient();
    const explanation = await buildExplanation(
      explanationInputFromOutcome(outcome, outcome.results[1].id),
      { llm },
    );
    expect(explanation.steps.length).toBeGreaterThan(0);
    expect(explanation.explanation.humanReadable).toBeTruthy();
    expect(explanation.assumptions.length).toBeGreaterThan(0);
    expect(explanation.confidenceBreakdowns).toHaveLength(6);
  });

  it("rejects an unknown result id", () => {
    expect(() => explanationInputFromOutcome(outcome, "result-nope")).toThrow(
      /No emission result with id/,
    );
  });
});
