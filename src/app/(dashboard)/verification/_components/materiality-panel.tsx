"use client";

/**
 * Materiality assessment and readiness scoring.
 *
 * `assessMaterialityAction` persists the derived opinion on the engagement, so it
 * needs a database; `scoreVerificationReadinessAction` is read-only and answers
 * either way. Both are exposed side by side because a verifier reads them together.
 */

import * as React from "react";
import { Gavel, Gauge } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { FormField } from "@/components/shared/form/form-field";
import { SubmitButton } from "@/components/shared/form/submit-button";
import { ActionError } from "@/components/shared/form/action-error";
import { IDLE_ACTION_STATE, type ActionState } from "@/lib/actions/types";
import { formatEmissions, formatNumber, formatPercent } from "@/lib/format";

export type MaterialityResult = {
  readonly engagementId: string;
  readonly threshold: number;
  readonly thresholdQuantity: number;
  readonly netMisstatement: number;
  readonly uncorrectedMisstatement: number;
  readonly isMaterial: boolean;
  readonly isPervasive: boolean;
  readonly opinionType: string;
  readonly rationale: readonly string[];
  readonly unit: string;
};

export type ReadinessResult = {
  readonly score: number;
  readonly level: string;
  readonly dimensions: Readonly<Record<string, number>>;
};

const OPINION_TONE: Readonly<Record<string, string>> = {
  unqualified: "border-emerald-500/50 text-emerald-700 dark:text-emerald-300",
  qualified: "border-amber-500/50 text-amber-700 dark:text-amber-300",
  adverse: "border-red-500/50 text-red-700 dark:text-red-300",
  disclaimer: "border-slate-400/50 text-slate-700 dark:text-slate-300",
};

export function MaterialityPanel({
  engagementId,
  totalEmissions,
  unit,
  assuranceLevels,
  defaultAssuranceLevel,
  assessMateriality,
  scoreReadiness,
}: {
  readonly engagementId: string;
  readonly totalEmissions: number;
  readonly unit: string;
  readonly assuranceLevels: readonly { readonly value: string; readonly label: string }[];
  readonly defaultAssuranceLevel: string;
  readonly assessMateriality: (input: unknown) => Promise<ActionState<MaterialityResult>>;
  readonly scoreReadiness: (input: unknown) => Promise<ActionState<ReadinessResult>>;
}) {
  const [state, formAction, pending] = React.useActionState<
    ActionState<MaterialityResult | ReadinessResult>,
    FormData
  >(async (_previous, formData) => {
    const threshold = Number(formData.get("threshold"));
    const payload = {
      engagementId,
      totalEmissions,
      assuranceLevel: String(formData.get("assuranceLevel") ?? defaultAssuranceLevel),
      ...(Number.isFinite(threshold) && threshold > 0 ? { threshold } : {}),
    };
    return formData.get("__mode") === "readiness"
      ? scoreReadiness(payload)
      : assessMateriality(payload);
  }, IDLE_ACTION_STATE as ActionState<MaterialityResult | ReadinessResult>);

  const materiality =
    state.status === "success" && "opinionType" in state.data ? state.data : null;
  const readiness = state.status === "success" && "level" in state.data ? state.data : null;

  return (
    <form action={formAction} className="space-y-4" data-testid="materiality-panel">
      <div className="grid gap-3 sm:grid-cols-3">
        <FormField
          name="assuranceLevel"
          label="Assurance level"
          type="select"
          required
          options={assuranceLevels}
          defaultValue={defaultAssuranceLevel}
          description="Limited assurance uses a 5% materiality threshold, reasonable 2%."
        />
        <FormField
          name="threshold"
          label="Threshold override (%)"
          type="number"
          step="any"
          description="Leave blank to use the assurance level's default."
        />
        <div className="self-end text-xs text-muted-foreground">
          Verified total: {formatEmissions(totalEmissions)} {unit}
        </div>
      </div>

      <ActionError state={state} showSuccess={false} />

      <div className="flex flex-wrap gap-2">
        <SubmitButton name="__mode" value="materiality" pending={pending}>
          <Gavel className="size-3.5" />
          Assess materiality
        </SubmitButton>
        <SubmitButton
          name="__mode"
          value="readiness"
          pending={pending}
          variant="outline"
        >
          <Gauge className="size-3.5" />
          Score readiness (no write)
        </SubmitButton>
      </div>

      {materiality && (
        <Alert data-testid="materiality-result">
          <AlertTitle className="flex flex-wrap items-center gap-2">
            <span>Opinion</span>
            <Badge variant="outline" className={OPINION_TONE[materiality.opinionType] ?? ""}>
              {materiality.opinionType}
            </Badge>
          </AlertTitle>
          <AlertDescription className="space-y-1 text-xs">
            <p>
              Net misstatement {formatEmissions(materiality.netMisstatement)}{" "}
              {materiality.unit} (uncorrected{" "}
              {formatEmissions(materiality.uncorrectedMisstatement)} {materiality.unit}) against a
              threshold of {formatEmissions(materiality.thresholdQuantity)} {materiality.unit} ={" "}
              {formatPercent(materiality.threshold * 100)} of the verified total ·{" "}
              {materiality.isMaterial ? "material" : "not material"}
              {materiality.isPervasive ? " and pervasive" : ""}
            </p>
            <ul className="list-inside list-disc">
              {materiality.rationale.map((line, index) => (
                <li key={`${index}-${line}`}>{line}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {readiness && (
        <Alert data-testid="readiness-result">
          <AlertTitle className="flex flex-wrap items-center gap-2">
            <span>Readiness {formatPercent(readiness.score, 0)}</span>
            <Badge variant="outline">{readiness.level}</Badge>
          </AlertTitle>
          <AlertDescription className="flex flex-wrap gap-1.5 pt-1 text-xs">
            {Object.entries(readiness.dimensions).map(([key, value]) => (
              <Badge key={key} variant="outline" className="font-mono">
                {key}={formatNumber(value, 2)}
              </Badge>
            ))}
          </AlertDescription>
        </Alert>
      )}
    </form>
  );
}
