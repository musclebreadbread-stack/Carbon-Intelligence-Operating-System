/**
 * `GET  /api/v1/inventories` — the computed inventory for a reporting year.
 * `POST /api/v1/inventories` — publish it as an `EmissionInventory` snapshot.
 *
 * The GET returns *computed* totals rather than a stored snapshot, so it is correct
 * even before anything has been published — and correct in demo mode, where nothing
 * can be published at all. `publishedAt` on the response tells the two apart.
 */

import { publishInventoryAction } from "@/lib/actions/calculation";
import { getInventory, inventoryIntensity } from "@/lib/data/repositories/calculation";
import { listReportingYears } from "@/lib/data/repositories/activity-data";
import { emissionInventoryInputSchema } from "@/lib/validation";

import { z } from "zod";

import { fromActionState, jsonOk, parseBody, parseQuery, withApiKey } from "../_lib/handler";

const querySchema = z.object({
  reportingYear: z.coerce.number().int().min(1900).max(2100).optional(),
  /** Optional denominator so an intensity metric comes back in the same call. */
  denominator: z.coerce.number().positive().optional(),
  denominatorType: z
    .enum(["REVENUE", "PRODUCTION", "AREA", "FTE", "CUSTOM"])
    .default("REVENUE"),
  denominatorUnit: z.string().trim().max(30).optional(),
});

export const GET = withApiKey(
  async ({ request, organizationId }) => {
    const parsed = parseQuery(request, querySchema);
    if (!parsed.ok) return parsed.response;

    const years = await listReportingYears(organizationId);
    const reportingYear =
      parsed.data.reportingYear ?? years.at(-1) ?? new Date().getUTCFullYear();
    const view = await getInventory(organizationId, reportingYear);

    const intensity =
      parsed.data.denominator === undefined
        ? null
        : inventoryIntensity(view.consolidated, {
            type: parsed.data.denominatorType,
            value: parsed.data.denominator,
            unit: parsed.data.denominatorUnit ?? "unit",
          });

    return jsonOk(
      {
        reportingYear,
        totals: view.totals,
        consolidated: view.consolidated,
        byScope3Category: view.consolidated.scope3ByCategory,
        intensity,
      },
      { meta: { organizationId, availableYears: years } },
    );
  },
  { resource: "calculation", action: "read" },
);

export const POST = withApiKey(
  async ({ request, organizationId }) => {
    const parsed = await parseBody(request, emissionInventoryInputSchema);
    if (!parsed.ok) return parsed.response;
    const state = await publishInventoryAction({ ...parsed.data, organizationId });
    return fromActionState(state, { status: 201 });
  },
  { resource: "calculation", action: "approve", cost: 5 },
);
