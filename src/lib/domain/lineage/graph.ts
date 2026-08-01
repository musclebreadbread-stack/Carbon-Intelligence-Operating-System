/**
 * Data-lineage graph construction and traversal.
 *
 * `buildGraph` turns the descriptors an engine emits into
 * `DataLineageNode` / `DataLineageEdge` / `DataTransformation` shaped records
 * with stable synthetic ids, so re-running a calculation produces the same graph
 * and diffing two graphs is meaningful.
 *
 * Traversal is breadth-first with a visited set, so a cyclic graph — which
 * should not occur but can be produced by bad data — terminates instead of
 * hanging.
 *
 * Pure TypeScript — no framework, database or network imports.
 */

import { CalculationError, NotFoundError } from "@/lib/core/errors";

import type {
  LineageDescriptorSet,
  LineageNodeType,
  LineageRelationship,
  LineageTransformationDescriptor,
} from "./types";

/** Plain object shaped to `DataLineageNode`. */
export type LineageNode = {
  readonly id: string;
  /** The descriptor key this node was built from. */
  readonly key: string;
  readonly name: string;
  readonly type: LineageNodeType;
  readonly entityType: string | null;
  readonly entityId: string | null;
  readonly metadata: Readonly<Record<string, unknown>> | null;
};

/** Plain object shaped to `DataTransformation`. */
export type LineageTransformation = {
  readonly id: string;
  readonly edgeId: string;
  readonly name: string;
  readonly type: string;
  readonly description: string | null;
  readonly logic: string | null;
  readonly parameters: Readonly<Record<string, unknown>> | null;
  readonly version: string | null;
};

/** Plain object shaped to `DataLineageEdge`. */
export type LineageEdge = {
  readonly id: string;
  readonly sourceNodeId: string;
  readonly targetNodeId: string;
  readonly relationship: LineageRelationship;
  readonly transformationType: string | null;
  readonly metadata: Readonly<Record<string, unknown>> | null;
  readonly transformation: LineageTransformation | null;
};

export type LineageGraph = {
  readonly nodes: readonly LineageNode[];
  readonly edges: readonly LineageEdge[];
  /** Node lookup by synthetic id. */
  readonly nodeById: ReadonlyMap<string, LineageNode>;
  /** Node lookup by descriptor key. */
  readonly nodeByKey: ReadonlyMap<string, LineageNode>;
  readonly outgoing: ReadonlyMap<string, readonly LineageEdge[]>;
  readonly incoming: ReadonlyMap<string, readonly LineageEdge[]>;
};

/**
 * Deterministic id from a descriptor key.
 *
 * Prefixed so ids are self-describing in a database dump, and slugged so they
 * stay URL-safe for the lineage explorer's deep links.
 */
export function lineageNodeId(key: string): string {
  return `ln_${slug(key)}`;
}

export function lineageEdgeId(
  sourceKey: string,
  targetKey: string,
  relationship: string,
): string {
  return `le_${slug(sourceKey)}__${slug(relationship)}__${slug(targetKey)}`;
}

function slug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Builds a graph from descriptors, de-duplicating repeated nodes and edges. */
export function buildGraph(descriptors: LineageDescriptorSet): LineageGraph {
  const nodeByKey = new Map<string, LineageNode>();

  for (const descriptor of descriptors.nodes) {
    if (!descriptor.key.trim()) {
      throw new CalculationError("Lineage node descriptors require a non-empty key", {
        name: descriptor.name,
      });
    }
    // A repeated key is a legitimate re-declaration (the same factor used twice);
    // the first declaration wins so the graph is order-stable.
    if (nodeByKey.has(descriptor.key)) continue;

    nodeByKey.set(descriptor.key, {
      id: lineageNodeId(descriptor.key),
      key: descriptor.key,
      name: descriptor.name,
      type: descriptor.type,
      entityType: descriptor.entityType ?? null,
      entityId: descriptor.entityId ?? null,
      metadata: descriptor.metadata ?? null,
    });
  }

  const edgeById = new Map<string, LineageEdge>();

  for (const descriptor of descriptors.edges) {
    const source = nodeByKey.get(descriptor.sourceKey);
    const target = nodeByKey.get(descriptor.targetKey);
    if (!source) {
      throw new CalculationError(
        `Lineage edge references unknown source node "${descriptor.sourceKey}"`,
        { edge: descriptor },
      );
    }
    if (!target) {
      throw new CalculationError(
        `Lineage edge references unknown target node "${descriptor.targetKey}"`,
        { edge: descriptor },
      );
    }

    const id = lineageEdgeId(
      descriptor.sourceKey,
      descriptor.targetKey,
      descriptor.relationship,
    );
    if (edgeById.has(id)) continue;

    edgeById.set(id, {
      id,
      sourceNodeId: source.id,
      targetNodeId: target.id,
      relationship: descriptor.relationship,
      transformationType: descriptor.transformationType ?? null,
      metadata: descriptor.metadata ?? null,
      transformation: descriptor.transformation
        ? buildTransformation(id, descriptor.transformation)
        : null,
    });
  }

  const nodes = [...nodeByKey.values()];
  const edges = [...edgeById.values()];
  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  const outgoing = new Map<string, LineageEdge[]>();
  const incoming = new Map<string, LineageEdge[]>();
  const push = (map: Map<string, LineageEdge[]>, key: string, edge: LineageEdge): void => {
    const bucket = map.get(key);
    if (bucket) bucket.push(edge);
    else map.set(key, [edge]);
  };
  for (const edge of edges) {
    push(outgoing, edge.sourceNodeId, edge);
    push(incoming, edge.targetNodeId, edge);
  }

  return { nodes, edges, nodeById, nodeByKey, outgoing, incoming };
}

function buildTransformation(
  edgeId: string,
  descriptor: LineageTransformationDescriptor,
): LineageTransformation {
  return {
    id: `lt_${slug(edgeId)}`,
    edgeId,
    name: descriptor.name,
    type: descriptor.type,
    description: descriptor.description ?? null,
    logic: descriptor.logic ?? null,
    parameters: descriptor.parameters ?? null,
    version: descriptor.version ?? null,
  };
}

/** Attaches (or replaces) the transformation record on an edge. */
export function attachTransformation(
  edge: LineageEdge,
  transformation: LineageTransformationDescriptor,
): LineageEdge {
  return { ...edge, transformation: buildTransformation(edge.id, transformation) };
}

function resolveNode(graph: LineageGraph, nodeIdOrKey: string): LineageNode {
  const node = graph.nodeById.get(nodeIdOrKey) ?? graph.nodeByKey.get(nodeIdOrKey);
  if (!node) {
    throw new NotFoundError(`No lineage node for "${nodeIdOrKey}"`, { nodeIdOrKey });
  }
  return node;
}

export type TraversalStep = {
  readonly node: LineageNode;
  /** Hops from the starting node; the start itself is depth 0. */
  readonly depth: number;
  /** Edge traversed to reach this node, `null` for the starting node. */
  readonly via: LineageEdge | null;
};

export type TraversalOptions = {
  /** Stop after this many hops. Unlimited by default. */
  readonly maxDepth?: number;
  /** Only traverse these relationships. */
  readonly relationships?: readonly LineageRelationship[];
};

function traverse(
  graph: LineageGraph,
  nodeIdOrKey: string,
  direction: "upstream" | "downstream",
  options: TraversalOptions = {},
): readonly TraversalStep[] {
  const start = resolveNode(graph, nodeIdOrKey);
  const maxDepth = options.maxDepth ?? Number.POSITIVE_INFINITY;
  const allowed = options.relationships ? new Set(options.relationships) : null;

  const visited = new Set<string>([start.id]);
  const steps: TraversalStep[] = [{ node: start, depth: 0, via: null }];
  let frontier: readonly TraversalStep[] = steps;

  for (let depth = 1; depth <= maxDepth && frontier.length > 0; depth += 1) {
    const next: TraversalStep[] = [];
    for (const step of frontier) {
      const edges =
        direction === "upstream"
          ? (graph.incoming.get(step.node.id) ?? [])
          : (graph.outgoing.get(step.node.id) ?? []);

      for (const edge of edges) {
        if (allowed && !allowed.has(edge.relationship)) continue;
        const neighbourId =
          direction === "upstream" ? edge.sourceNodeId : edge.targetNodeId;
        // The visited set is what makes a cyclic graph terminate.
        if (visited.has(neighbourId)) continue;
        visited.add(neighbourId);
        const neighbour = graph.nodeById.get(neighbourId);
        if (!neighbour) continue;
        next.push({ node: neighbour, depth, via: edge });
      }
    }
    steps.push(...next);
    frontier = next;
  }

  return steps;
}

/** Everything that fed into a node, nearest first. Excludes the node itself. */
export function traceUpstream(
  graph: LineageGraph,
  nodeIdOrKey: string,
  options?: TraversalOptions,
): readonly TraversalStep[] {
  return traverse(graph, nodeIdOrKey, "upstream", options).slice(1);
}

/** Everything a node feeds into, nearest first. Excludes the node itself. */
export function traceDownstream(
  graph: LineageGraph,
  nodeIdOrKey: string,
  options?: TraversalOptions,
): readonly TraversalStep[] {
  return traverse(graph, nodeIdOrKey, "downstream", options).slice(1);
}

export type ProvenanceTree = {
  readonly node: LineageNode;
  /** Edge from the parent to this node, `null` at the root. */
  readonly via: LineageEdge | null;
  readonly children: readonly ProvenanceTree[];
  /** True when the branch was cut short because the node was already visited. */
  readonly truncated: boolean;
};

/**
 * Upstream provenance as a tree, for rendering "where did this number come
 * from?" in the UI. Repeated nodes appear once per path but are marked
 * `truncated` on the second visit along that path, so a cycle cannot recurse
 * forever.
 */
export function toProvenanceTree(
  graph: LineageGraph,
  nodeIdOrKey: string,
  options: TraversalOptions = {},
): ProvenanceTree {
  const maxDepth = options.maxDepth ?? Number.POSITIVE_INFINITY;
  const allowed = options.relationships ? new Set(options.relationships) : null;

  const build = (
    node: LineageNode,
    via: LineageEdge | null,
    depth: number,
    path: ReadonlySet<string>,
  ): ProvenanceTree => {
    if (path.has(node.id)) {
      return { node, via, children: [], truncated: true };
    }
    if (depth >= maxDepth) {
      return { node, via, children: [], truncated: (graph.incoming.get(node.id) ?? []).length > 0 };
    }
    const nextPath = new Set(path).add(node.id);
    const children = (graph.incoming.get(node.id) ?? [])
      .filter((edge) => !allowed || allowed.has(edge.relationship))
      .map((edge) => {
        const parent = graph.nodeById.get(edge.sourceNodeId);
        return parent ? build(parent, edge, depth + 1, nextPath) : null;
      })
      .filter((child): child is ProvenanceTree => child !== null);

    return { node, via, children, truncated: false };
  };

  return build(resolveNode(graph, nodeIdOrKey), null, 0, new Set());
}

/** Nodes with no incoming edges: the roots of the lineage. */
export function rootNodes(graph: LineageGraph): readonly LineageNode[] {
  return graph.nodes.filter((node) => (graph.incoming.get(node.id) ?? []).length === 0);
}

/** Nodes with no outgoing edges: the terminal outputs. */
export function leafNodes(graph: LineageGraph): readonly LineageNode[] {
  return graph.nodes.filter((node) => (graph.outgoing.get(node.id) ?? []).length === 0);
}

/** True when the graph contains a directed cycle. */
export function hasCycle(graph: LineageGraph): boolean {
  const visiting = new Set<string>();
  const done = new Set<string>();

  const visit = (nodeId: string): boolean => {
    if (visiting.has(nodeId)) return true;
    if (done.has(nodeId)) return false;
    visiting.add(nodeId);
    for (const edge of graph.outgoing.get(nodeId) ?? []) {
      if (visit(edge.targetNodeId)) return true;
    }
    visiting.delete(nodeId);
    done.add(nodeId);
    return false;
  };

  return graph.nodes.some((node) => visit(node.id));
}
