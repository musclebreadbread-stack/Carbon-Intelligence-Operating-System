/** @vitest-environment jsdom */

import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";

import { buildExplanation, type Explanation } from "@/lib/ai/explain/build-explanation";
import { DeterministicLlmClient } from "@/lib/ai/llm/deterministic-client";
import type { EmissionCalcTraceStep } from "@/lib/domain/emissions/types";

import { ExplanationPanel } from "./explanation-panel";
import { LineageGraph } from "./lineage-graph";
import { buildGraph, toProvenanceTree } from "@/lib/domain/lineage/graph";

const traces: EmissionCalcTraceStep[] = [
  {
    stepName: "Convert activity quantity",
    formula: "1000 Nm3 × 1 = 1000 Nm3",
    inputs: { quantity: 1000, unit: "Nm3" },
    output: 1000,
    unit: "Nm3",
    orderIndex: 0,
  },
  {
    stepName: "Apply emission factor",
    formula: "1000 Nm3 × 2.0 kgCO2e/Nm3 = 2000 kgCO2e",
    inputs: { factor: 2.0 },
    output: 2000,
    unit: "kgCO2e",
    orderIndex: 1,
  },
  {
    stepName: "Convert to tonnes",
    formula: "2000 kgCO2e ÷ 1000 = 2 tCO2e",
    inputs: { divisor: 1000 },
    output: 2,
    unit: "tCO2e",
    orderIndex: 2,
  },
];

describe("ExplanationPanel", () => {
  let explanation: Explanation;

  beforeAll(async () => {
    explanation = await buildExplanation(
      {
        entityType: "EmissionResult",
        entityId: "result-1",
        title: "Ulsan boiler — natural gas",
        traces,
        result: { label: "Total emissions", value: 2, unit: "tCO2e" },
        assumptions: [
          {
            assumption: "IPCC 2006 default factor used for natural gas",
            category: "emission-factor-selection",
            source: "IPCC 2006 GL vol. 2",
          },
        ],
        confidenceFactors: { dataQuality: 0.9, coverage: 1, uncertainty: 0.8 },
        evidence: [{ title: "Gas invoice 2024-03", type: "invoice" }],
      },
      { llm: new DeterministicLlmClient() },
    );
  });

  it("renders every step in order", () => {
    render(<ExplanationPanel explanation={explanation} />);

    expect(screen.getByTestId("explanation-panel")).toBeTruthy();
    const steps = screen.getByTestId("explanation-steps").querySelectorAll("li");
    expect(steps).toHaveLength(traces.length);
    expect(steps[0].textContent).toContain("Convert activity quantity");
    expect(steps[1].textContent).toContain("Apply emission factor");
    expect(steps[2].textContent).toContain("Convert to tonnes");
  });

  it("renders every formula verbatim in the trace list", () => {
    render(<ExplanationPanel explanation={explanation} />);
    for (const trace of traces) {
      // The formula also appears inside the narrative paragraph, hence getAllByText.
      const matches = screen.getAllByText(
        new RegExp(trace.formula.replace(/[()×÷]/g, ".")),
      );
      expect(matches.length).toBeGreaterThan(0);
    }
  });

  it("labels a deterministic narrative as deterministic", () => {
    render(<ExplanationPanel explanation={explanation} />);
    expect(screen.getByText(/narrative: deterministic/)).toBeTruthy();
  });

  it("renders the assumption log, confidence breakdown and evidence", () => {
    render(<ExplanationPanel explanation={explanation} />);
    expect(screen.getAllByText(/IPCC 2006 default factor/).length).toBeGreaterThan(0);
    expect(screen.getByText("dataQuality")).toBeTruthy();
    expect(screen.getByText("Gas invoice 2024-03")).toBeTruthy();
  });
});

describe("LineageGraph", () => {
  it("renders one SVG node per provenance node", () => {
    const graph = buildGraph({
      nodes: [
        { key: "entry-1", name: "Gas meter 2024-03", type: "ACTIVITY_DATA" },
        { key: "factor-1", name: "IPCC natural gas", type: "EMISSION_FACTOR" },
        { key: "result-1", name: "Ulsan boiler result", type: "EMISSION_RESULT" },
      ],
      edges: [
        { sourceKey: "entry-1", targetKey: "result-1", relationship: "DERIVED_FROM" },
        { sourceKey: "factor-1", targetKey: "result-1", relationship: "APPLIED_TO" },
      ],
    });
    const tree = toProvenanceTree(graph, "result-1");

    const { container } = render(<LineageGraph tree={tree} />);
    expect(container.querySelectorAll("rect")).toHaveLength(3);
    expect(container.querySelectorAll("path[marker-end]")).toHaveLength(2);
    expect(screen.getByText(/3 nodes, 2 edges/)).toBeTruthy();
  });
});
