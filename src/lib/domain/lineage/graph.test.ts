import { describe, expect, it } from "vitest";

import { calendarYear } from "@/lib/core/period";
import { CalculationError, NotFoundError } from "@/lib/core/errors";

import { runCalculation } from "../emissions/orchestrator";
import type { EmissionFactorLike } from "../factors/types";

import {
  attachTransformation,
  buildGraph,
  hasCycle,
  leafNodes,
  lineageEdgeId,
  lineageNodeId,
  rootNodes,
  toProvenanceTree,
  traceDownstream,
  traceUpstream,
} from "./graph";
import type { LineageDescriptorSet } from "./types";

const simple: LineageDescriptorSet = {
  nodes: [
    { key: "source:erp", name: "ERP export", type: "DATA_SOURCE", entityType: "DataSource", entityId: "ds-1" },
    { key: "activity:a1", name: "Gas invoice", type: "ACTIVITY_DATA", entityType: "ActivityDataEntry", entityId: "a1" },
    { key: "factor:f1", name: "DEFRA gas factor", type: "EMISSION_FACTOR", entityType: "EmissionFactor", entityId: "f1" },
    { key: "result:r1", name: "Gas result", type: "EMISSION_RESULT", entityType: "EmissionResult", entityId: "r1" },
    { key: "inventory:2024", name: "FY2024 inventory", type: "INVENTORY" },
  ],
  edges: [
    { sourceKey: "source:erp", targetKey: "activity:a1", relationship: "DERIVED_FROM" },
    {
      sourceKey: "activity:a1",
      targetKey: "result:r1",
      relationship: "INPUT_TO",
      transformationType: "stationary-combustion",
      transformation: {
        name: "Stationary combustion",
        type: "emission-calculation",
        logic: "activity × EF(CO2)",
        parameters: { gwpVersion: "AR6" },
        version: "1",
      },
    },
    { sourceKey: "factor:f1", targetKey: "result:r1", relationship: "APPLIED_TO" },
    { sourceKey: "result:r1", targetKey: "inventory:2024", relationship: "AGGREGATED_INTO" },
  ],
};

describe("buildGraph", () => {
  const graph = buildGraph(simple);

  it("creates one node per descriptor with a deterministic id", () => {
    expect(graph.nodes).toHaveLength(5);
    expect(graph.nodeByKey.get("activity:a1")?.id).toBe(lineageNodeId("activity:a1"));
    expect(buildGraph(simple).nodes.map((n) => n.id)).toEqual(graph.nodes.map((n) => n.id));
  });

  it("preserves the DataLineageNode fields", () => {
    const node = graph.nodeByKey.get("factor:f1");
    expect(node).toMatchObject({
      name: "DEFRA gas factor",
      type: "EMISSION_FACTOR",
      entityType: "EmissionFactor",
      entityId: "f1",
    });
    expect(graph.nodeByKey.get("inventory:2024")?.entityType).toBeNull();
  });

  it("creates one edge per descriptor with a deterministic id", () => {
    expect(graph.edges).toHaveLength(4);
    const edge = graph.edges.find((e) => e.relationship === "INPUT_TO");
    expect(edge?.id).toBe(lineageEdgeId("activity:a1", "result:r1", "INPUT_TO"));
    expect(edge?.sourceNodeId).toBe(lineageNodeId("activity:a1"));
    expect(edge?.targetNodeId).toBe(lineageNodeId("result:r1"));
  });

  it("builds the DataTransformation record on edges that declare one", () => {
    const edge = graph.edges.find((e) => e.relationship === "INPUT_TO");
    expect(edge?.transformation).toMatchObject({
      edgeId: edge?.id,
      name: "Stationary combustion",
      type: "emission-calculation",
      logic: "activity × EF(CO2)",
      version: "1",
    });
    expect(edge?.transformation?.parameters).toEqual({ gwpVersion: "AR6" });
    // Edges without a declared transformation keep it null.
    expect(graph.edges.find((e) => e.relationship === "APPLIED_TO")?.transformation).toBeNull();
  });

  it("de-duplicates repeated node keys and edges", () => {
    const duplicated = buildGraph({
      nodes: [...simple.nodes, simple.nodes[2], simple.nodes[2]],
      edges: [...simple.edges, simple.edges[2]],
    });
    expect(duplicated.nodes).toHaveLength(simple.nodes.length);
    expect(duplicated.edges).toHaveLength(simple.edges.length);
  });

  it("indexes edges by both directions", () => {
    const resultId = lineageNodeId("result:r1");
    expect(graph.incoming.get(resultId)).toHaveLength(2);
    expect(graph.outgoing.get(resultId)).toHaveLength(1);
  });

  it("rejects an empty key and an edge pointing at an unknown node", () => {
    expect(() => buildGraph({ nodes: [{ key: "  ", name: "x", type: "INVENTORY" }], edges: [] })).toThrow(
      CalculationError,
    );
    expect(() =>
      buildGraph({
        nodes: [simple.nodes[0]],
        edges: [{ sourceKey: "source:erp", targetKey: "nope", relationship: "INPUT_TO" }],
      }),
    ).toThrow(/unknown target node/);
    expect(() =>
      buildGraph({
        nodes: [simple.nodes[0]],
        edges: [{ sourceKey: "nope", targetKey: "source:erp", relationship: "INPUT_TO" }],
      }),
    ).toThrow(/unknown source node/);
  });
});

describe("attachTransformation", () => {
  it("adds a transformation record to an edge that lacked one", () => {
    const graph = buildGraph(simple);
    const [edge] = graph.edges.filter((e) => e.relationship === "APPLIED_TO");
    expect(edge.transformation).toBeNull();
    const enriched = attachTransformation(edge, {
      name: "GWP application",
      type: "gwp-normalisation",
      logic: "mass × GWP100",
    });
    expect(enriched.transformation).toMatchObject({
      edgeId: edge.id,
      name: "GWP application",
      type: "gwp-normalisation",
    });
    // The original edge is not mutated.
    expect(edge.transformation).toBeNull();
  });
});

describe("traceUpstream / traceDownstream", () => {
  const graph = buildGraph(simple);

  it("reaches the activity entry and the emission factor from a result", () => {
    const upstream = traceUpstream(graph, "result:r1");
    const keys = upstream.map((step) => step.node.key);
    expect(keys).toContain("activity:a1");
    expect(keys).toContain("factor:f1");
    // And keeps going to the original data source.
    expect(keys).toContain("source:erp");
    expect(upstream.find((s) => s.node.key === "activity:a1")?.depth).toBe(1);
    expect(upstream.find((s) => s.node.key === "source:erp")?.depth).toBe(2);
  });

  it("records the edge each step was reached through", () => {
    const upstream = traceUpstream(graph, "result:r1");
    const viaFactor = upstream.find((s) => s.node.key === "factor:f1");
    expect(viaFactor?.via?.relationship).toBe("APPLIED_TO");
  });

  it("excludes the starting node", () => {
    expect(traceUpstream(graph, "result:r1").map((s) => s.node.key)).not.toContain("result:r1");
    expect(traceDownstream(graph, "activity:a1").map((s) => s.node.key)).not.toContain(
      "activity:a1",
    );
  });

  it("reaches the inventory downstream of an activity entry", () => {
    const downstream = traceDownstream(graph, "activity:a1");
    expect(downstream.map((s) => s.node.key)).toEqual(["result:r1", "inventory:2024"]);
  });

  it("returns nothing upstream of a root or downstream of a leaf", () => {
    expect(traceUpstream(graph, "source:erp")).toHaveLength(0);
    expect(traceDownstream(graph, "inventory:2024")).toHaveLength(0);
  });

  it("honours maxDepth and a relationship filter", () => {
    expect(traceUpstream(graph, "result:r1", { maxDepth: 1 }).map((s) => s.node.key).sort()).toEqual(
      ["activity:a1", "factor:f1"],
    );
    expect(
      traceUpstream(graph, "result:r1", { relationships: ["APPLIED_TO"] }).map((s) => s.node.key),
    ).toEqual(["factor:f1"]);
  });

  it("accepts either a node id or a descriptor key", () => {
    const byKey = traceUpstream(graph, "result:r1");
    const byId = traceUpstream(graph, lineageNodeId("result:r1"));
    expect(byId.map((s) => s.node.id)).toEqual(byKey.map((s) => s.node.id));
  });

  it("throws for an unknown node", () => {
    expect(() => traceUpstream(graph, "nope")).toThrow(NotFoundError);
  });
});

describe("cycle safety", () => {
  const cyclic = buildGraph({
    nodes: [
      { key: "a", name: "A", type: "ACTIVITY_DATA" },
      { key: "b", name: "B", type: "CALCULATION" },
      { key: "c", name: "C", type: "EMISSION_RESULT" },
    ],
    edges: [
      { sourceKey: "a", targetKey: "b", relationship: "INPUT_TO" },
      { sourceKey: "b", targetKey: "c", relationship: "DERIVED_FROM" },
      // Deliberate cycle back to A.
      { sourceKey: "c", targetKey: "a", relationship: "DERIVED_FROM" },
    ],
  });

  it("detects the cycle", () => {
    expect(hasCycle(cyclic)).toBe(true);
    expect(hasCycle(buildGraph(simple))).toBe(false);
  });

  it("terminates an upstream traversal instead of hanging", () => {
    const upstream = traceUpstream(cyclic, "a");
    expect(upstream.map((s) => s.node.key)).toEqual(["c", "b"]);
  });

  it("terminates a downstream traversal instead of hanging", () => {
    const downstream = traceDownstream(cyclic, "a");
    expect(downstream.map((s) => s.node.key)).toEqual(["b", "c"]);
  });

  it("terminates the provenance tree and marks the truncated branch", () => {
    const tree = toProvenanceTree(cyclic, "a");
    expect(tree.node.key).toBe("a");
    expect(tree.children[0].node.key).toBe("c");
    expect(tree.children[0].children[0].node.key).toBe("b");
    const looped = tree.children[0].children[0].children[0];
    expect(looped.node.key).toBe("a");
    expect(looped.truncated).toBe(true);
    expect(looped.children).toHaveLength(0);
  });
});

describe("toProvenanceTree", () => {
  const graph = buildGraph(simple);

  it("nests the upstream sources of a result", () => {
    const tree = toProvenanceTree(graph, "result:r1");
    expect(tree.node.key).toBe("result:r1");
    expect(tree.via).toBeNull();
    expect(tree.children.map((c) => c.node.key).sort()).toEqual(["activity:a1", "factor:f1"]);
    const activity = tree.children.find((c) => c.node.key === "activity:a1");
    expect(activity?.via?.relationship).toBe("INPUT_TO");
    expect(activity?.children.map((c) => c.node.key)).toEqual(["source:erp"]);
    expect(activity?.children[0].children).toHaveLength(0);
  });

  it("marks a branch truncated when maxDepth cuts it short", () => {
    const tree = toProvenanceTree(graph, "result:r1", { maxDepth: 1 });
    const activity = tree.children.find((c) => c.node.key === "activity:a1");
    expect(activity?.children).toHaveLength(0);
    expect(activity?.truncated).toBe(true);
    // The factor node has no upstream, so it is complete rather than truncated.
    expect(tree.children.find((c) => c.node.key === "factor:f1")?.truncated).toBe(false);
  });
});

describe("rootNodes / leafNodes", () => {
  const graph = buildGraph(simple);

  it("identifies the graph boundaries", () => {
    expect(rootNodes(graph).map((n) => n.key).sort()).toEqual(["factor:f1", "source:erp"]);
    expect(leafNodes(graph).map((n) => n.key)).toEqual(["inventory:2024"]);
  });
});

describe("integration with the calculation orchestrator", () => {
  const factors: readonly EmissionFactorLike[] = [
    {
      id: "ef-grid",
      name: "Grid factor",
      value: 0.4,
      unit: "KG_CO2E_PER_KWH",
      gasType: "CO2e",
      scope: "SCOPE_2_LOCATION",
      isActive: true,
    },
  ];

  const outcome = runCalculation({
    organizationId: "org-1",
    name: "FY2024",
    reportingYear: 2024,
    period: calendarYear(2024),
    gwpVersion: "AR6",
    candidateFactors: factors,
    entries: [
      {
        id: "entry-1",
        name: "Electricity",
        quantity: 1_000_000,
        unit: "kWh",
        scope: "SCOPE_2_LOCATION",
      },
    ],
  });

  const graph = buildGraph(outcome.lineage);

  it("builds a graph directly from the orchestrator's descriptors", () => {
    expect(graph.nodes.map((n) => n.type).sort()).toEqual([
      "ACTIVITY_DATA",
      "CALCULATION",
      "EMISSION_FACTOR",
      "EMISSION_RESULT",
    ]);
    expect(hasCycle(graph)).toBe(false);
  });

  it("traces an emission result back to its activity entry and factor", () => {
    const resultKey = `result:${outcome.results[0].id}`;
    const upstream = traceUpstream(graph, resultKey);
    const entityIds = upstream.map((step) => step.node.entityId);
    expect(entityIds).toContain("entry-1");
    expect(entityIds).toContain("ef-grid");
  });

  it("traces an activity entry forward to the calculation", () => {
    const downstream = traceDownstream(graph, "activity:entry-1");
    expect(downstream.map((s) => s.node.type)).toEqual(["EMISSION_RESULT", "CALCULATION"]);
  });

  it("carries the calculation formula on the transformation record", () => {
    const edge = graph.edges.find((e) => e.relationship === "INPUT_TO");
    expect(edge?.transformation?.type).toBe("emission-calculation");
    expect(edge?.transformation?.logic).toContain("activity × EF");
  });
});
