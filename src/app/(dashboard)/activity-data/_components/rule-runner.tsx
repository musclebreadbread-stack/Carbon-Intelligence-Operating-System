"use client";

/**
 * Runs a validation rule set against a candidate context.
 *
 * The same `executeRuleSetAction` the entry path uses, exposed directly so an
 * administrator can see what a rule set does to a given value before it starts
 * rejecting operators' entries. Every evaluated rule is recorded, matched or not —
 * "this rule ran and did not fire" is the evidence a verifier asks for.
 */

import * as React from "react";
import { Play } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { FormField } from "@/components/shared/form/form-field";
import { SubmitButton } from "@/components/shared/form/submit-button";
import { ActionError } from "@/components/shared/form/action-error";
import { IDLE_ACTION_STATE, type ActionState } from "@/lib/actions/types";

export type ExecuteRuleSetResult = {
  readonly blocked: boolean;
  readonly matchedRules: number;
  readonly evaluatedRules: number;
  readonly executionIds: readonly string[];
  readonly effects: readonly {
    readonly type: string;
    readonly severity: string;
    readonly blocking: boolean;
    readonly message: string;
  }[];
  readonly fieldUpdates: Readonly<Record<string, string | null>>;
};

export function RuleRunner({
  organizationId,
  ruleSets,
  units,
  executeRuleSet,
}: {
  readonly organizationId: string;
  readonly ruleSets: readonly { readonly value: string; readonly label: string }[];
  readonly units: readonly { readonly value: string; readonly label: string }[];
  readonly executeRuleSet: (input: unknown) => Promise<ActionState<ExecuteRuleSetResult>>;
}) {
  const [state, formAction, pending] = React.useActionState<
    ActionState<ExecuteRuleSetResult>,
    FormData
  >(async (_previous, formData) => {
    const quantity = Number(formData.get("quantity"));
    return executeRuleSet({
      organizationId,
      ruleSetId: String(formData.get("ruleSetId") ?? ""),
      entityType: "ActivityDataEntry",
      entityId: String(formData.get("entityId") ?? "preview"),
      context: {
        quantity: Number.isFinite(quantity) ? quantity : 0,
        unit: String(formData.get("unit") ?? ""),
        isEstimated: formData.get("isEstimated") !== null,
        uncertainty: Number(formData.get("uncertainty") ?? 0),
      },
    });
  }, IDLE_ACTION_STATE as ActionState<ExecuteRuleSetResult>);

  return (
    <form action={formAction} className="space-y-4" data-testid="rule-runner">
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField
          name="ruleSetId"
          label="Rule set"
          type="select"
          required
          options={ruleSets}
        />
        <FormField
          name="entityId"
          label="Entity id"
          defaultValue="preview"
          description="Recorded on the RuleExecution row."
        />
        <FormField name="quantity" label="Quantity" type="number" step="any" required />
        <FormField name="unit" label="Unit" type="select" required options={units} />
        <FormField
          name="uncertainty"
          label="Uncertainty (0–1)"
          type="number"
          step="any"
          defaultValue={0}
        />
        <FormField name="isEstimated" label="Estimated" type="checkbox" />
      </div>

      <ActionError state={state} showSuccess={false} />

      <SubmitButton pending={pending} pendingLabel="Running…">
        <Play className="size-3.5" />
        Execute rule set
      </SubmitButton>

      {state.status === "success" && (
        <Alert
          variant={state.data.blocked ? "destructive" : "default"}
          data-testid="rule-run-result"
        >
          <AlertTitle>
            {state.data.matchedRules} of {state.data.evaluatedRules} rule
            {state.data.evaluatedRules === 1 ? "" : "s"} matched
            {state.data.blocked ? " — the row would be rejected" : ""}
          </AlertTitle>
          <AlertDescription className="space-y-1.5">
            {state.data.effects.length === 0 ? (
              <p className="text-xs">No effects raised: the value passes every active rule.</p>
            ) : (
              <ul className="space-y-1">
                {state.data.effects.map((effect, index) => (
                  <li key={`${index}-${effect.message}`} className="text-xs">
                    <Badge variant={effect.blocking ? "destructive" : "outline"} className="mr-1.5">
                      {effect.type} · {effect.severity}
                    </Badge>
                    {effect.message}
                  </li>
                ))}
              </ul>
            )}
            {Object.keys(state.data.fieldUpdates).length > 0 && (
              <p className="text-xs">
                Field updates the caller should apply:{" "}
                <span className="font-mono">{JSON.stringify(state.data.fieldUpdates)}</span>
              </p>
            )}
          </AlertDescription>
        </Alert>
      )}
    </form>
  );
}
