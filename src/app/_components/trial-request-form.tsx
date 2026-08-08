"use client";

import * as React from "react";
import { Send } from "lucide-react";

import { FormField } from "@/components/shared/form/form-field";
import { SubmitButton } from "@/components/shared/form/submit-button";
import { ActionError } from "@/components/shared/form/action-error";
import { useT } from "@/components/providers/locale-provider";
import { IDLE_ACTION_STATE, type ActionState } from "@/lib/actions/types";
import type { TrialRequestResult } from "@/lib/actions/trial-request";

export function TrialRequestForm({
  submitTrialRequest,
}: {
  readonly submitTrialRequest: (input: unknown) => Promise<ActionState<TrialRequestResult>>;
}) {
  const t = useT();
  const [state, formAction, pending] = React.useActionState<
    ActionState<TrialRequestResult>,
    FormData
  >(async (_previous, formData) => {
    const text = (key: string) => {
      const value = formData.get(key);
      return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
    };
    return submitTrialRequest({
      companyName: text("companyName") ?? "",
      contactName: text("contactName") ?? "",
      email: text("email") ?? "",
      phone: text("phone"),
      facilityCount: text("facilityCount"),
      message: text("message"),
    });
  }, IDLE_ACTION_STATE as ActionState<TrialRequestResult>);

  if (state.status === "success") {
    return (
      <div
        className="rounded-lg border border-emerald-500/50 bg-emerald-500/10 p-6 text-sm text-emerald-800 dark:text-emerald-200"
        data-testid="trial-request-success"
      >
        {state.message}
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-3" data-testid="trial-request-form">
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField name="companyName" label={t("marketing.form.companyName")} required />
        <FormField name="contactName" label={t("marketing.form.contactName")} required />
        <FormField name="email" label={t("marketing.form.email")} type="email" required />
        <FormField name="phone" label={t("marketing.form.phone")} />
        <FormField
          name="facilityCount"
          label={t("marketing.form.facilityCount")}
          type="number"
          className="sm:col-span-2"
        />
      </div>
      <FormField name="message" label={t("marketing.form.message")} type="textarea" />

      <ActionError
        state={state}
        handledFields={["companyName", "contactName", "email", "phone", "facilityCount", "message"]}
      />

      <SubmitButton pending={pending} pendingLabel={t("marketing.form.submitting")}>
        <Send className="size-3.5" />
        {t("marketing.form.submit")}
      </SubmitButton>
    </form>
  );
}
