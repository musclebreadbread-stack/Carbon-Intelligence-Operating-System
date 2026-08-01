/**
 * `GET  /api/v1/disclosures` — framework completeness across every mapped framework.
 * `POST /api/v1/disclosures` — generate (or refresh) a framework report.
 *
 * TNFD is declared in the Prisma enum but has no requirement catalogue, so the
 * repository excludes it from the completeness list and the request schema refuses
 * it outright. Returning zero completeness for it would read as "nothing has been
 * answered" rather than "this framework is not mapped yet".
 */

import { generateDisclosureReportAction } from "@/lib/actions/disclosure";
import {
  listDisclosureFrameworks,
  listDisclosureReports,
  listFrameworkCompleteness,
} from "@/lib/data/repositories/disclosure";
import { generateDisclosureReportSchema } from "@/lib/validation";

import { fromActionState, jsonOk, parseBody, parseQuery, withApiKey } from "../_lib/handler";

import { z } from "zod";

const querySchema = z.object({
  reportingYear: z.coerce.number().int().min(1900).max(2100).optional(),
});

export const GET = withApiKey(
  async ({ request, organizationId }) => {
    const parsed = parseQuery(request, querySchema);
    if (!parsed.ok) return parsed.response;

    const reportingYear = parsed.data.reportingYear ?? new Date().getUTCFullYear();
    const [completeness, reports, frameworks] = await Promise.all([
      listFrameworkCompleteness(organizationId, reportingYear),
      listDisclosureReports(organizationId),
      listDisclosureFrameworks(),
    ]);
    return jsonOk(completeness, {
      meta: { organizationId, reportingYear, reports, frameworks },
    });
  },
  { resource: "disclosure", action: "read" },
);

export const POST = withApiKey(
  async ({ request, organizationId }) => {
    const parsed = await parseBody(request, generateDisclosureReportSchema);
    if (!parsed.ok) return parsed.response;
    const state = await generateDisclosureReportAction({ ...parsed.data, organizationId });
    return fromActionState(state, { status: 201 });
  },
  { resource: "disclosure", action: "create", cost: 10 },
);
