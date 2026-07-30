/**
 * `GET  /api/v1/targets` — targets with their pathway, progress and SBTi warnings.
 * `POST /api/v1/targets` — create a target, screened against the SBTi criteria.
 *
 * The SBTi warnings are returned on the GET, not only on the POST: a target that
 * was compliant when it was set can stop being compliant as the criteria are
 * revised, and an integrator building a compliance dashboard needs to see that.
 */

import { createTargetAction } from "@/lib/actions/targets";
import { getNetZeroPlan, listTargets } from "@/lib/data/repositories/targets";
import { scienceBasedTargetInputSchema } from "@/lib/validation";

import { fromActionState, jsonOk, parseBody, withApiKey } from "../_lib/handler";

export const GET = withApiKey(
  async ({ organizationId }) => {
    const [targets, netZero] = await Promise.all([
      listTargets(organizationId),
      getNetZeroPlan(organizationId),
    ]);
    return jsonOk(targets, { meta: { organizationId, netZero } });
  },
  { resource: "target", action: "read" },
);

export const POST = withApiKey(
  async ({ request, organizationId }) => {
    const parsed = await parseBody(request, scienceBasedTargetInputSchema);
    if (!parsed.ok) return parsed.response;
    const state = await createTargetAction({ ...parsed.data, organizationId });
    return fromActionState(state, { status: 201 });
  },
  { resource: "target", action: "create", cost: 2 },
);
