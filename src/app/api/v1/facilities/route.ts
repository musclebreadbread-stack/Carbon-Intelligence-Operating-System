/**
 * `GET  /api/v1/facilities` — the tenant's facilities.
 * `POST /api/v1/facilities` — create one, through the same action the UI uses.
 */

import { createFacilityAction } from "@/lib/actions/organization";
import { listEmissionSources, listFacilities } from "@/lib/data/repositories/organization";
import { facilityInputSchema } from "@/lib/validation";

import { fromActionState, jsonOk, parseBody, withApiKey } from "../_lib/handler";

export const GET = withApiKey(
  async ({ organizationId }) => {
    const [facilities, sources] = await Promise.all([
      listFacilities(organizationId),
      listEmissionSources(organizationId),
    ]);
    // The source count is what an integrator needs to know a facility is actually
    // wired up, and computing it here saves a second round trip per facility.
    const countBySite = new Map<string, number>();
    for (const source of sources) {
      const key = source.facilityId ?? "";
      countBySite.set(key, (countBySite.get(key) ?? 0) + 1);
    }
    return jsonOk(
      facilities.map((facility) => ({
        ...facility,
        emissionSourceCount: countBySite.get(facility.id) ?? 0,
      })),
      { meta: { organizationId } },
    );
  },
  { resource: "organization", action: "read" },
);

export const POST = withApiKey(
  async ({ request, organizationId }) => {
    const parsed = await parseBody(request, facilityInputSchema);
    if (!parsed.ok) return parsed.response;
    // The organisation comes from the key, never from the body, so a caller cannot
    // create a facility inside someone else's tenant.
    const state = await createFacilityAction({ ...parsed.data, organizationId });
    return fromActionState(state, { status: 201 });
  },
  { resource: "organization", action: "create", cost: 2 },
);
