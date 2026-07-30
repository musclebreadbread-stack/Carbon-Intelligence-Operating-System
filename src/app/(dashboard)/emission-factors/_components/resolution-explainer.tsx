"use client";

/**
 * "Which factor applies, and why?"
 *
 * Calls `explainFactorResolutionAction`, which runs the same `resolveFactor()` the
 * calculation engine uses and returns its `selectionRationale` — the ordered
 * justification a verifier asks for. The action is read-only, so this works with no
 * database.
 */

import * as React from "react";
import { Search } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { FormField } from "@/components/shared/form/form-field";
import { SubmitButton } from "@/components/shared/form/submit-button";
import { ActionError } from "@/components/shared/form/action-error";
import { IDLE_ACTION_STATE, type ActionState } from "@/lib/actions/types";
import { formatNumber } from "@/lib/format";

export type FactorResolutionExplanation = {
  readonly factorId: string;
  readonly factorName: string;
  readonly value: number;
  readonly unit: string;
  readonly specificity: string;
  readonly score: number;
  readonly rationale: readonly string[];
  readonly runnersUp: readonly { readonly id: string; readonly name: string }[];
  readonly rejected: readonly { readonly factorId: string; readonly reason: string }[];
};

type Option = { readonly value: string; readonly label: string };

export function ResolutionExplainer({
  organizationId,
  scopes,
  scope3Categories,
  sectors,
  units,
  defaultDate,
  explainResolution,
}: {
  readonly organizationId: string;
  readonly scopes: readonly Option[];
  readonly scope3Categories: readonly Option[];
  readonly sectors: readonly Option[];
  readonly units: readonly Option[];
  readonly defaultDate: string;
  readonly explainResolution: (
    input: unknown,
  ) => Promise<ActionState<FactorResolutionExplanation>>;
}) {
  const [state, formAction, pending] = React.useActionState<
    ActionState<FactorResolutionExplanation>,
    FormData
  >(async (_previous, formData) => {
    const text = (key: string) => {
      const value = formData.get(key);
      return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
    };
    return explainResolution({
      organizationId,
      date: text("date") ?? defaultDate,
      scope: text("scope") ?? "SCOPE_1",
      scope3Category: text("scope3Category"),
      region: text("region"),
      country: text("country"),
      sector: text("sector"),
      unit: text("unit"),
      gasType: text("gasType"),
    });
  }, IDLE_ACTION_STATE as ActionState<FactorResolutionExplanation>);

  return (
    <form action={formAction} className="space-y-4" data-testid="resolution-explainer">
      <div className="grid gap-3 sm:grid-cols-3">
        <FormField name="date" label="Activity date" type="date" required defaultValue={defaultDate} />
        <FormField name="scope" label="Scope" type="select" required options={scopes} />
        <FormField
          name="scope3Category"
          label="Scope 3 category"
          type="select"
          options={scope3Categories}
        />
        <FormField name="region" label="Region" placeholder="APAC, GLOBAL…" />
        <FormField name="country" label="Country (ISO-2)" placeholder="KR" />
        <FormField name="sector" label="Sector" type="select" options={sectors} />
        <FormField name="unit" label="Factor unit" type="select" options={units} />
        <FormField name="gasType" label="Gas" placeholder="CO2e, CO2, CH4_FOSSIL…" />
      </div>

      <ActionError state={state} showSuccess={false} />

      <SubmitButton pending={pending} pendingLabel="Resolving…">
        <Search className="size-3.5" />
        Explain the selection
      </SubmitButton>

      {state.status === "success" && (
        <Alert className="border-emerald-500/40" data-testid="resolution-result">
          <AlertTitle className="flex flex-wrap items-center gap-2">
            <span>{state.data.factorName}</span>
            <Badge variant="outline">
              {formatNumber(state.data.value, 5)} {state.data.unit}
            </Badge>
            <Badge variant="secondary">{state.data.specificity}</Badge>
            <Badge variant="outline">score {formatNumber(state.data.score, 0)}</Badge>
          </AlertTitle>
          <AlertDescription className="space-y-2 pt-1">
            <div>
              <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Selection rationale
              </p>
              <ol className="list-inside list-decimal text-xs">
                {state.data.rationale.map((line, index) => (
                  <li key={`${index}-${line}`}>{line}</li>
                ))}
              </ol>
            </div>
            {state.data.runnersUp.length > 0 && (
              <div>
                <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  Runners-up
                </p>
                <p className="text-xs">
                  {state.data.runnersUp.map((factor) => factor.name).join(" · ")}
                </p>
              </div>
            )}
            {state.data.rejected.length > 0 && (
              <details>
                <summary className="cursor-pointer text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  Rejected candidates ({state.data.rejected.length})
                </summary>
                <ul className="list-inside list-disc pt-1 text-xs">
                  {state.data.rejected.map((rejection) => (
                    <li key={rejection.factorId}>
                      <span className="font-mono">{rejection.factorId}</span> —{" "}
                      {rejection.reason}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </AlertDescription>
        </Alert>
      )}
    </form>
  );
}
