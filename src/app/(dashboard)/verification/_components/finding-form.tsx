"use client";

/**
 * Record a verification finding.
 *
 * `misstatementAmount` is the field that matters most here: `assessMateriality`
 * aggregates only findings that carry a quantified misstatement, so without it the
 * opinion is always unqualified regardless of what the verifier found. The form
 * therefore surfaces it prominently and explains the consequence.
 */

import * as React from "react";
import { FilePlus2 } from "lucide-react";

import { FormField } from "@/components/shared/form/form-field";
import { SubmitButton } from "@/components/shared/form/submit-button";
import { ActionError } from "@/components/shared/form/action-error";
import { useT } from "@/components/providers/locale-provider";
import { IDLE_ACTION_STATE, type ActionState } from "@/lib/actions/types";

type Option = { readonly value: string; readonly label: string };

export function FindingForm({
  engagementId,
  findingTypes,
  severities,
  statuses,
  users,
  recordFinding,
}: {
  readonly engagementId: string;
  readonly findingTypes: readonly Option[];
  readonly severities: readonly Option[];
  readonly statuses: readonly Option[];
  readonly users: readonly Option[];
  readonly recordFinding: (input: unknown) => Promise<ActionState<{ readonly id: string }>>;
}) {
  const t = useT();
  const [state, formAction, pending] = React.useActionState<
    ActionState<{ readonly id: string }>,
    FormData
  >(async (_previous, formData) => {
    const text = (key: string) => {
      const value = formData.get(key);
      return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
    };
    const misstatement = text("misstatementAmount");
    const financialImpact = text("estimatedFinancialImpact");
    return recordFinding({
      engagementId,
      type: text("type") ?? "OBSERVATION",
      severity: text("severity") ?? "MINOR",
      title: text("title") ?? "",
      description: text("description"),
      recommendation: text("recommendation"),
      status: text("status") ?? "open",
      dueDate: text("dueDate"),
      resolvedAt: text("resolvedAt"),
      assignedToId: text("assignedToId"),
      misstatementAmount: misstatement === null ? null : Number(misstatement),
      estimatedFinancialImpact: financialImpact === null ? null : Number(financialImpact),
      impactCurrency: text("impactCurrency"),
    });
  }, IDLE_ACTION_STATE as ActionState<{ readonly id: string }>);

  return (
    <form action={formAction} className="space-y-4" data-testid="finding-form">
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField name="title" label={t("verification.form.title")} required className="sm:col-span-2" />
        <FormField name="type" label={t("verification.form.type")} type="select" required options={findingTypes} />
        <FormField name="severity" label={t("verification.table.severity")} type="select" required options={severities} />
        <FormField
          name="misstatementAmount"
          label={t("verification.form.misstatementAmount")}
          type="number"
          step="any"
          className="sm:col-span-2"
          description={t("verification.form.misstatementAmountDesc")}
        />
        <FormField
          name="estimatedFinancialImpact"
          label={t("verification.form.estimatedFinancialImpact")}
          type="number"
          step="any"
          description={t("verification.form.estimatedFinancialImpactDesc")}
        />
        <FormField
          name="impactCurrency"
          label={t("verification.form.impactCurrency")}
          placeholder="USD"
        />
        <FormField name="status" label={t("verification.meta.status")} type="select" required options={statuses} defaultValue="open" />
        <FormField
          name="assignedToId"
          label={t("verification.form.assignedTo")}
          type="select"
          options={users}
        />
        <FormField name="dueDate" label={t("verification.form.dueDate")} type="date" />
        <FormField
          name="resolvedAt"
          label={t("verification.form.resolvedAt")}
          type="date"
          description={t("verification.form.resolvedAtDesc")}
        />
        <FormField
          name="description"
          label={t("verification.form.description")}
          type="textarea"
          className="sm:col-span-2"
        />
        <FormField
          name="recommendation"
          label={t("verification.form.recommendation")}
          type="textarea"
          className="sm:col-span-2"
        />
      </div>

      <ActionError
        state={state}
        handledFields={[
          "title",
          "type",
          "severity",
          "misstatementAmount",
          "estimatedFinancialImpact",
          "impactCurrency",
          "status",
          "assignedToId",
          "dueDate",
          "resolvedAt",
          "description",
          "recommendation",
        ]}
      />

      <SubmitButton pending={pending} pendingLabel={t("verification.form.recording")}>
        <FilePlus2 className="size-3.5" />
        {t("verification.tab.recordFinding")}
      </SubmitButton>
    </form>
  );
}
