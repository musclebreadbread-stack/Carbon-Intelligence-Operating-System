/**
 * `GET  /api/v1/emission-factors` — the factor library, with its sources and versions.
 * `POST /api/v1/emission-factors` — publish a factor version.
 *
 * Every returned factor carries its source and validity window, because a factor
 * quoted without its provenance cannot be used in a disclosure.
 */

import { createEmissionFactorAction } from "@/lib/actions/emission-factor";
import {
  listEmissionFactors,
  listFactorSources,
  listFactorVersions,
} from "@/lib/data/repositories/emission-factor";
import { emissionFactorInputSchema, emissionFactorQuerySchema } from "@/lib/validation";

import { fromActionState, jsonOk, parseBody, parseQuery, withApiKey } from "../_lib/handler";

const querySchema = emissionFactorQuerySchema.omit({ organizationId: true });

export const GET = withApiKey(
  async ({ request, organizationId }) => {
    const parsed = parseQuery(request, querySchema);
    if (!parsed.ok) return parsed.response;

    const [factors, sources, versions] = await Promise.all([
      listEmissionFactors({ ...parsed.data, organizationId }),
      listFactorSources(),
      listFactorVersions(),
    ]);
    return jsonOk(factors, {
      meta: {
        organizationId,
        // Returned alongside rather than joined per row: the same source is cited
        // by dozens of factors and repeating it would triple the payload.
        sources,
        versions,
        filters: parsed.data,
      },
    });
  },
  { resource: "emission_factor", action: "read" },
);

export const POST = withApiKey(
  async ({ request, organizationId }) => {
    const parsed = await parseBody(request, emissionFactorInputSchema);
    if (!parsed.ok) return parsed.response;
    const state = await createEmissionFactorAction({ ...parsed.data, organizationId });
    return fromActionState(state, { status: 201 });
  },
  { resource: "emission_factor", action: "create", cost: 2 },
);
