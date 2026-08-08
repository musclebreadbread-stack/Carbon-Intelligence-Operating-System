"use server";

/**
 * Public "free trial" lead capture from the landing page.
 *
 * Deliberately not built on `runAction`: every other action assumes an
 * authenticated session, but a prospect filling out this form has none by
 * definition. It still refuses to fake success in demo mode — the row simply
 * would not exist to review later — and still validates with zod, matching
 * the rest of the codebase's write path even without the session/permission
 * steps.
 *
 * v1 onboarding is manual (see the commercialisation plan): this action only
 * records the lead and best-effort notifies the operator. Nothing here
 * creates an `Organization` or sends a login link — that happens by hand
 * once the operator reviews the request.
 */

import { canWrite } from "@/lib/data/db";
import { getNotificationChannel } from "@/lib/notifications/factory";
import { prisma } from "@/lib/prisma";
import { trialRequestInputSchema } from "@/lib/validation/trial-request";

import { actionSuccess, demoModeFailure, validationFailure, type ActionState } from "./types";

export type TrialRequestResult = { readonly id: string };

export async function submitTrialRequestAction(
  rawInput: unknown,
): Promise<ActionState<TrialRequestResult>> {
  const parsed = trialRequestInputSchema.safeParse(rawInput);
  if (!parsed.success) return validationFailure(parsed.error);
  const input = parsed.data;

  if (!(await canWrite())) return demoModeFailure();

  const created = await prisma.trialRequest.create({
    data: {
      companyName: input.companyName,
      contactName: input.contactName,
      email: input.email,
      phone: input.phone ?? null,
      facilityCount: input.facilityCount ?? null,
      message: input.message ?? null,
    },
    select: { id: true },
  });

  const notifyEmail = process.env.SALES_NOTIFICATION_EMAIL;
  if (notifyEmail) {
    await getNotificationChannel().send({
      recipient: notifyEmail,
      subject: `[CIOS] 무료체험 신청 — ${input.companyName}`,
      body: [
        `담당자: ${input.contactName} <${input.email}>${input.phone ? ` · ${input.phone}` : ""}`,
        `사업장 수: ${input.facilityCount ?? "미기재"}`,
        `메시지: ${input.message ?? "-"}`,
      ].join("\n"),
      severity: "info",
      metadata: { trialRequestId: created.id },
    });
  }

  return actionSuccess(
    { id: created.id },
    "무료체험 신청이 접수되었습니다. 담당자가 곧 연락드립니다.",
    "action.success.submitTrialRequest",
  );
}
