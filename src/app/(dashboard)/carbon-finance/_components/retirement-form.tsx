"use client";

/**
 * Credit-retirement form.
 *
 * `retireCreditsAction` selects credits FIFO by vintage and returns the ordered
 * rationale, which is what a retirement certificate has to carry. Over-retirement
 * is rejected by the domain rather than silently under-delivered, so the failure is
 * rendered verbatim.
 */

import * as React from "react";
import { Flame } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { FormField } from "@/components/shared/form/form-field";
import { SubmitButton } from "@/components/shared/form/submit-button";
import { ActionError } from "@/components/shared/form/action-error";
import { IDLE_ACTION_STATE, type ActionState } from "@/lib/actions/types";
import { formatEmissions, formatPercent } from "@/lib/format";

export type RetireCreditsResult = {
  readonly totalRetired: number;
  readonly unit: string;
  readonly remainingAvailable: number;
  readonly offsetIds: readonly string[];
  readonly creditsAffected: number;
  readonly rationale: readonly string[];
  readonly grossEmissions: number;
  readonly netEmissions: number;
  readonly offsetShare: number;
};

export function RetirementForm({
  organizationId,
  reportingYear,
  vintages,
  registries,
  available,
  unit,
  retireCredits,
}: {
  readonly organizationId: string;
  readonly reportingYear: number;
  readonly vintages: readonly number[];
  readonly registries: readonly string[];
  readonly available: number;
  readonly unit: string;
  readonly retireCredits: (input: unknown) => Promise<ActionState<RetireCreditsResult>>;
}) {
  const [state, formAction, pending] = React.useActionState<
    ActionState<RetireCreditsResult>,
    FormData
  >(async (_previous, formData) => {
    const text = (key: string) => {
      const value = formData.get(key);
      return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
    };
    const vintage = text("vintage");
    return retireCredits({
      organizationId,
      quantity: Number(formData.get("quantity")),
      vintage: vintage === null ? null : Number(vintage),
      registry: text("registry"),
      purpose: text("purpose") ?? "",
      reportingYear: Number(formData.get("reportingYear")),
      notes: text("notes"),
    });
  }, IDLE_ACTION_STATE as ActionState<RetireCreditsResult>);

  return (
    <form action={formAction} className="space-y-4" data-testid="retirement-form">
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField
          name="quantity"
          label={`Quantity to retire (${unit})`}
          type="number"
          step="any"
          required
          max={available}
          description={`${formatEmissions(available)} ${unit} currently retirable.`}
        />
        <FormField
          name="reportingYear"
          label="Claim against reporting year"
          type="number"
          required
          defaultValue={reportingYear}
          description="A retirement can only be claimed once, in one year."
        />
        <FormField
          name="vintage"
          label="Vintage"
          type="select"
          options={vintages.map((vintage) => ({
            value: String(vintage),
            label: String(vintage),
          }))}
          description="Leave blank to let FIFO pick the oldest eligible vintage."
        />
        <FormField
          name="registry"
          label="Registry"
          type="select"
          options={registries.map((registry) => ({ value: registry, label: registry }))}
        />
        <FormField
          name="purpose"
          label="Purpose"
          required
          className="sm:col-span-2"
          placeholder="2024 residual emissions neutralisation"
          description="Required: an untagged retirement cannot be attributed to a claim."
        />
        <FormField name="notes" label="Notes" type="textarea" className="sm:col-span-2" />
      </div>

      <ActionError state={state} showSuccess={false} />

      <SubmitButton pending={pending} pendingLabel="Retiring…">
        <Flame className="size-3.5" />
        Retire credits
      </SubmitButton>

      {state.status === "success" && (
        <Alert className="border-emerald-500/40" data-testid="retirement-result">
          <AlertTitle className="flex flex-wrap items-center gap-2">
            <span>
              Retired {formatEmissions(state.data.totalRetired)} {state.data.unit}
            </span>
            <Badge variant="outline">
              {state.data.creditsAffected} credit
              {state.data.creditsAffected === 1 ? "" : "s"}
            </Badge>
            <Badge variant="outline">
              {formatEmissions(state.data.remainingAvailable)} {state.data.unit} left
            </Badge>
          </AlertTitle>
          <AlertDescription className="space-y-1 pt-1 text-xs">
            <p>
              Gross {formatEmissions(state.data.grossEmissions)} → net{" "}
              {formatEmissions(state.data.netEmissions)} {state.data.unit} (
              {formatPercent(state.data.offsetShare * 100)} covered)
            </p>
            <ol className="list-inside list-decimal">
              {state.data.rationale.map((line, index) => (
                <li key={`${index}-${line}`}>{line}</li>
              ))}
            </ol>
          </AlertDescription>
        </Alert>
      )}
    </form>
  );
}
