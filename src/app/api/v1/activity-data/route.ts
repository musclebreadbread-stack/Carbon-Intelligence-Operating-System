/**
 * `GET  /api/v1/activity-data` — list entries, filterable by facility/scope/period.
 * `POST /api/v1/activity-data` — create an entry through `createActivityEntryAction`,
 *   so the validation rule set (and its blocking `reject` effects) applies to an API
 *   submission exactly as it does to a form submission.
 */

import { createActivityEntryAction } from "@/lib/actions/activity-data";
import { listActivityData, listActivityEntries } from "@/lib/data/repositories/activity-data";
import {
  activityDataEntryInputSchema,
  activityDataQuerySchema,
} from "@/lib/validation";

import { fromActionState, jsonOk, parseBody, parseQuery, withApiKey } from "../_lib/handler";

/** The tenant is fixed by the API key, so it is not accepted from the caller. */
const querySchema = activityDataQuerySchema.omit({ organizationId: true });

export const GET = withApiKey(
  async ({ request, organizationId }) => {
    const parsed = parseQuery(request, querySchema);
    if (!parsed.ok) return parsed.response;

    const query = { ...parsed.data, organizationId };
    const [headers, entries] = await Promise.all([
      listActivityData(query),
      listActivityEntries(query),
    ]);
    return jsonOk(entries, {
      meta: { organizationId, dataSetCount: headers.length, filters: parsed.data },
    });
  },
  { resource: "activity_data", action: "read" },
);

export const POST = withApiKey(
  async ({ request, organizationId }) => {
    const parsed = await parseBody(request, activityDataEntryInputSchema);
    if (!parsed.ok) return parsed.response;
    const state = await createActivityEntryAction({ ...parsed.data, organizationId });
    return fromActionState(state, { status: 201 });
  },
  { resource: "activity_data", action: "create", cost: 2 },
);
