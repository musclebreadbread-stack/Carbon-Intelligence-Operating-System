/**
 * Data-lineage repository.
 *
 * The graph is built by `buildGraph` from the descriptor set the orchestrator emits,
 * so the provenance tree the UI renders is derived from the same run that produced
 * the numbers, not from a separately maintained table.
 */

import {
  buildGraph,
  toProvenanceTree,
  traceDownstream,
  traceUpstream,
  type LineageGraph,
} from "@/lib/domain/lineage/graph";
import type { LineageDescriptorSet } from "@/lib/domain/lineage/types";
import { prisma } from "@/lib/prisma";

import { withDb } from "../db";

import { getCalculationOutcome } from "./calculation";

/** Lineage descriptors for one reporting year. */
export async function getLineageDescriptors(
  organizationId: string,
  reportingYear: number,
): Promise<LineageDescriptorSet> {
  const outcome = await getCalculationOutcome(organizationId, reportingYear);
  return outcome.lineage;
}

export async function getLineageGraph(
  organizationId: string,
  reportingYear: number,
): Promise<LineageGraph> {
  const descriptors = await getLineageDescriptors(organizationId, reportingYear);
  return buildGraph(descriptors);
}

export async function getUpstreamTrace(
  organizationId: string,
  reportingYear: number,
  nodeId: string,
) {
  const graph = await getLineageGraph(organizationId, reportingYear);
  return traceUpstream(graph, nodeId);
}

export async function getDownstreamTrace(
  organizationId: string,
  reportingYear: number,
  nodeId: string,
) {
  const graph = await getLineageGraph(organizationId, reportingYear);
  return traceDownstream(graph, nodeId);
}

export async function getProvenanceTree(
  organizationId: string,
  reportingYear: number,
  nodeId: string,
) {
  const graph = await getLineageGraph(organizationId, reportingYear);
  return toProvenanceTree(graph, nodeId);
}

export type DataTransformationRow = {
  readonly id: string;
  readonly type: string;
  readonly description: string | null;
  readonly appliedAt: Date;
};

/** Persisted `DataTransformation` rows; empty in demo mode. */
export async function listTransformations(
  organizationId: string,
): Promise<readonly DataTransformationRow[]> {
  return withDb<readonly DataTransformationRow[]>(
    async () => {
      // `DataTransformation` hangs off a lineage *edge*, and the graph carries the
      // tenant as a polymorphic `entityType`/`entityId` pair, so the filter walks
      // edge -> source node -> graph.
      const rows = await prisma.dataTransformation.findMany({
        where: {
          edge: {
            sourceNode: {
              graph: { entityType: "Organization", entityId: organizationId },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 200,
      });
      return rows.map((row) => ({
        id: row.id,
        type: row.type,
        description: row.description,
        appliedAt: row.createdAt,
      }));
    },
    () => [],
  );
}
