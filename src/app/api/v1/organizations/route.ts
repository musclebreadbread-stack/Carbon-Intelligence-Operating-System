/**
 * `GET /api/v1/organizations`
 *
 * Returns the organisation the API key belongs to plus its hierarchy tree. It does
 * **not** list every organisation in the database: an API key is scoped to one
 * tenant, and returning the others would leak the customer list.
 */

import { getHierarchyTree, getOrganization } from "@/lib/data/repositories/organization";

import { jsonError, jsonOk, withApiKey } from "../_lib/handler";

export const GET = withApiKey(
  async ({ organizationId }) => {
    const [organization, hierarchy] = await Promise.all([
      getOrganization(organizationId),
      getHierarchyTree(organizationId),
    ]);
    if (!organization) {
      return jsonError("NOT_FOUND", `Organization ${organizationId} was not found.`);
    }
    return jsonOk(
      { organization, hierarchy },
      { meta: { organizationId } },
    );
  },
  { resource: "organization", action: "read" },
);
