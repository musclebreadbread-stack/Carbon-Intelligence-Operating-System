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
  const [state, formAction, pending] = React.useActionState<
    ActionState<{ readonly id: string }>,
    FormData
  >(async (_previous, formData) => {
    const text = (key: string) => {
      const value = formData.get(key);
      return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
    };
    const misstatement = text("misstatementAmount");
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
    });
  }, IDLE_ACTION_STATE as ActionState<{ readonly id: string }>);

  return (
    <form action={formAction} className="space-y-4" data-testid="finding-form">
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField name="title" label="Title" required className="sm:col-span-2" />
        <FormField name="type" label="Type" type="select" required options={findingTypes} />
        <FormField name="severity" label="Severity" type="select" required options={severities} />
        <FormField
          name="misstatementAmount"
          label="Misstatement amount (tCO2e)"
          type="number"
          step="any"
          className="sm:col-span-2"
          description="Quantify the misstatement whenever it can be measured: assessMateriality() aggregates only quantified findings, so leaving this blank means the engagement will always return an unqualified opinion."
        />
        <FormField name="status" label="Status" type="select" required options={statuses} defaultValue="open" />
        <FormField
          name="assignedToId"
          label="Assigned to"
          type="select"
          options={users}
        />
        <FormField name="dueDate" label="Due date" type="date" />
        <FormField
          name="resolvedAt"
          label="Resolved at"
          type="date"
          description="Required when the status is resolved, closed or accepted."
        />
        <FormField
          name="description"
          label="Description"
          type="textarea"
          className="sm:col-span-2"
        />
        <FormField
          name="recommendation"
          label="Recommendation"
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
          "status",
          "assignedToId",
          "dueDate",
          "resolvedAt",
          "description",
          "recommendation",
        ]}
      />

      <SubmitButton pending={pending} pendingLabel="Recording…">
        <FilePlus2 className="size-3.5" />
        Record finding
      </SubmitButton>
    </form>
  );
}
