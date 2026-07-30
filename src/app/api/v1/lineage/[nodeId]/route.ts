/**
 * `GET /api/v1/lineage/[nodeId]`
 *
 * Walks the provenance graph from one node. `?direction=upstream` (the default)
 * answers "where did this number come from?", which is the question an auditor asks;
 * `downstream` answers "what would change if this input were restated?", which is
 * the question a data steward asks before correcting an entry.
 */

import { z } from "zod";

import {
  getDownstreamTrace,
  getLineageGraph,
  getProvenanceTree,
  getUpstreamTrace,
} from "@/lib/data/repositories/lineage";

import { jsonError, jsonOk, parseQuery, withApiKey } from "../../_lib/handler";

const querySchema = z.object({
  direction: z.enum(["upstream", "downstream", "tree"]).default("upstream"),
  reportingYear: z.coerce.number().int().min(1900).max(2100).optional(),
});

/**
 * `withApiKey` hands the handler the raw `Request`, so the dynamic segment is read
 * from the URL rather than from the route context. One wrapper signature covers
 * every endpoint that way, instead of a second parameterised variant.
 */
function nodeIdFrom(request: Request): string | null {
  const segments = new URL(request.url).pathname.split("/").filter(Boolean);
  const last = segments.at(-1);
  return last !== undefined && last.length > 0 ? decodeURIComponent(last) : null;
}

export const GET = withApiKey(
  async ({ request, organizationId }) => {
    const parsed = parseQuery(request, querySchema);
    if (!parsed.ok) return parsed.response;

    const nodeId = nodeIdFrom(request);
    if (nodeId === null) {
      return jsonError("INVALID_REQUEST", "The lineage node id is missing.");
    }

    const reportingYear = parsed.data.reportingYear ?? new Date().getUTCFullYear();

    // A trace for a node that is not in the graph comes back empty, which is
    // indistinguishable from a genuine leaf. Checking membership first turns that
    // into an explicit 404.
    const graph = await getLineageGraph(organizationId, reportingYear);
    if (!graph.nodes.some((node) => node.id === nodeId)) {
      return jsonError(
        "NOT_FOUND",
        `Lineage node ${nodeId} is not present in the ${reportingYear} graph.`,
      );
    }

    const meta = { organizationId, nodeId, reportingYear, direction: parsed.data.direction };

    if (parsed.data.direction === "tree") {
      const tree = await getProvenanceTree(organizationId, reportingYear, nodeId);
      return jsonOk(tree, { meta });
    }
    const trace =
      parsed.data.direction === "downstream"
        ? await getDownstreamTrace(organizationId, reportingYear, nodeId)
        : await getUpstreamTrace(organizationId, reportingYear, nodeId);
    return jsonOk(trace, { meta });
  },
  { resource: "calculation", action: "read", cost: 3 },
);
