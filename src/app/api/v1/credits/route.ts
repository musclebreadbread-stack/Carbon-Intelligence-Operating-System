/**
 * `GET  /api/v1/credits` — the credit portfolio, its balance and net emissions.
 * `POST /api/v1/credits` — retire credits FIFO by vintage.
 *
 * The POST requires the `credits:retire` scope on top of the key owner's role.
 * Retirement is irreversible, so a read-only integration key must not be able to
 * perform it even if its owner happens to hold the permission in the UI.
 */

import { retireCreditsAction } from "@/lib/actions/credits";
import { getCarbonFinanceView, getCreditPortfolio } from "@/lib/data/repositories/credits";
import { retireCreditsInputSchema } from "@/lib/validation";

import { fromActionState, jsonOk, parseBody, withApiKey } from "../_lib/handler";

export const GET = withApiKey(
  async ({ organizationId }) => {
    const [portfolio, finance] = await Promise.all([
      getCreditPortfolio(organizationId),
      getCarbonFinanceView(organizationId),
    ]);
    return jsonOk(portfolio.credits, {
      meta: {
        organizationId,
        balance: portfolio.balance,
        offsets: portfolio.offsets.length,
        finance,
      },
    });
  },
  { resource: "carbon_credit", action: "read" },
);

export const POST = withApiKey(
  async ({ request, organizationId }) => {
    const parsed = await parseBody(request, retireCreditsInputSchema);
    if (!parsed.ok) return parsed.response;
    const state = await retireCreditsAction({ ...parsed.data, organizationId });
    return fromActionState(state, { status: 201 });
  },
  {
    resource: "carbon_credit",
    action: "retire",
    scope: "credits:retire",
    cost: 5,
  },
);
