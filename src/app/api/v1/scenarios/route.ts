/**
 * `GET  /api/v1/scenarios` — stored scenarios with their projections.
 * `POST /api/v1/scenarios` — project a scenario.
 *
 * `?persist=false` on the POST routes to `previewScenarioAction`, which is
 * read-only and therefore answers in demo mode. That is deliberate: scenario
 * modelling is the one thing an evaluator wants to try before provisioning a
 * database, and refusing it would make the API look broken on a clean deployment.
 */

import { previewScenarioAction, simulateScenarioAction } from "@/lib/actions/scenario";
import { listScenarioProjections } from "@/lib/data/repositories/scenario";
import { simulateScenarioInputSchema } from "@/lib/validation";

import { fromActionState, jsonOk, parseBody, withApiKey } from "../_lib/handler";

export const GET = withApiKey(
  async ({ organizationId }) => {
    const projections = await listScenarioProjections(organizationId);
    return jsonOk(projections, { meta: { organizationId } });
  },
  { resource: "scenario", action: "read" },
);

export const POST = withApiKey(
  async ({ request, organizationId }) => {
    const parsed = await parseBody(request, simulateScenarioInputSchema);
    if (!parsed.ok) return parsed.response;

    const payload = { ...parsed.data, organizationId };
    const state = parsed.data.persist
      ? await simulateScenarioAction(payload)
      : await previewScenarioAction(payload);
    return fromActionState(state, { status: parsed.data.persist ? 201 : 200 });
  },
  { resource: "scenario", action: "create", cost: 5 },
);
