/**
 * `GET  /api/v1/calculations` — recorded calculation runs.
 * `POST /api/v1/calculations` — run one, through `runCalculationAction`.
 *
 * The POST is the single heaviest endpoint in the gateway: it reads a whole year of
 * activity data, runs the orchestrator and writes the entire result graph. It is
 * charged 10 tokens against the caller's bucket for that reason — a client that can
 * fire 60 list requests a minute must not be able to fire 60 full inventory
 * recalculations in the same minute.
 */

import { runCalculationAction } from "@/lib/actions/calculation";
import { listCalculations } from "@/lib/data/repositories/calculation";
import { calculationQuerySchema, runCalculationRequestSchema } from "@/lib/validation";

import { fromActionState, jsonOk, parseBody, parseQuery, withApiKey } from "../_lib/handler";

const querySchema = calculationQuerySchema.omit({ organizationId: true });

export const GET = withApiKey(
  async ({ request, organizationId }) => {
    const parsed = parseQuery(request, querySchema);
    if (!parsed.ok) return parsed.response;

    const calculations = await listCalculations(organizationId, parsed.data);
    return jsonOk(calculations, { meta: { organizationId, filters: parsed.data } });
  },
  { resource: "calculation", action: "read" },
);

export const POST = withApiKey(
  async ({ request, organizationId }) => {
    const parsed = await parseBody(request, runCalculationRequestSchema);
    if (!parsed.ok) return parsed.response;
    const state = await runCalculationAction({ ...parsed.data, organizationId });
    return fromActionState(state, { status: 202 });
  },
  { resource: "calculation", action: "create", cost: 10 },
);
