"use client";

/**
 * Run / preview a calculation.
 *
 * Two actions, deliberately side by side:
 *
 *   - `previewCalculationAction` is **read-only** and therefore permitted in demo
 *     mode. It runs the orchestrator and returns the totals without writing, which
 *     is how a deployment with no database still shows genuinely computed numbers.
 *   - `runCalculationAction` persists the calculation, its results, the uncertainty
 *     analysis, the traces and the lineage graph in one transaction, and is refused
 *     with `DEMO_MODE` when there is nowhere to write.
 */

import * as React from "react";
import { Calculator, Eye } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { FormField } from "@/components/shared/form/form-field";
import { SubmitButton } from "@/components/shared/form/submit-button";
import { ActionError } from "@/components/shared/form/action-error";
import { IDLE_ACTION_STATE, type ActionState } from "@/lib/actions/types";
import { formatEmissions, formatNumber, formatPercent } from "@/lib/format";

export type RunCalculationResult = {
  readonly calculationIds: readonly string[];
  readonly explanationId: string;
  readonly resultCount: number;
  readonly totalEmissions: number;
  readonly unit: string;
  readonly overallUncertainty: number;
  readonly dataQualityScore: number;
};

export type PreviewResult = {
  readonly totalEmissions: number;
  readonly unit: string;
  readonly resultCount: number;
  readonly scope1Total: number;
  readonly scope2Location: number;
  readonly scope2Market: number;
  readonly scope3Total: number;
};

type Option = { readonly value: string; readonly label: string };

export function RunCalculationPanel({
  organizationId,
  years,
  facilities,
  gwpVersions,
  consolidationApproaches,
  runCalculation,
  previewCalculation,
}: {
  readonly organizationId: string;
  readonly years: readonly number[];
  readonly facilities: readonly Option[];
  readonly gwpVersions: readonly Option[];
  readonly consolidationApproaches: readonly Option[];
  readonly runCalculation: (input: unknown) => Promise<ActionState<RunCalculationResult>>;
  readonly previewCalculation: (input: unknown) => Promise<ActionState<PreviewResult>>;
}) {
  const [state, formAction, pending] = React.useActionState<
    ActionState<RunCalculationResult | PreviewResult>,
    FormData
  >(async (_previous, formData) => {
    const reportingYear = Number(formData.get("reportingYear"));
    if (formData.get("__mode") === "preview") {
      return previewCalculation({ organizationId, reportingYear });
    }
    const facilityId = String(formData.get("facilityId") ?? "");
    return runCalculation({
      organizationId,
      name: String(formData.get("name") ?? ""),
      reportingYear,
      gwpVersion: String(formData.get("gwpVersion") ?? "AR6"),
      consolidationApproach: String(formData.get("consolidationApproach") ?? "OPERATIONAL_CONTROL"),
      scope2Basis: String(formData.get("scope2Basis") ?? "LOCATION"),
      facilityIds: facilityId.length > 0 ? [facilityId] : [],
      scopes: [],
    });
  }, IDLE_ACTION_STATE as ActionState<RunCalculationResult | PreviewResult>);

  const preview =
    state.status === "success" && "scope1Total" in state.data ? state.data : null;
  const run = state.status === "success" && "calculationIds" in state.data ? state.data : null;

  return (
    <form action={formAction} className="space-y-4" data-testid="run-calculation-panel">
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField
          name="name"
          label="Calculation name"
          required
          defaultValue={`${years[0] ?? new Date().getUTCFullYear()} GHG inventory`}
          description="Persisted on the EmissionCalculation record."
        />
        <FormField
          name="reportingYear"
          label="Reporting year"
          type="select"
          required
          options={years.map((year) => ({ value: String(year), label: String(year) }))}
        />
        <FormField
          name="gwpVersion"
          label="GWP version"
          type="select"
          required
          options={gwpVersions}
          defaultValue="AR6"
          description="AR6 CH4 = 27.9× vs AR5 28×; the choice changes the total."
        />
        <FormField
          name="consolidationApproach"
          label="Consolidation approach"
          type="select"
          required
          options={consolidationApproaches}
          defaultValue="OPERATIONAL_CONTROL"
        />
        <FormField
          name="scope2Basis"
          label="Scope 2 basis for the total"
          type="select"
          required
          defaultValue="LOCATION"
          options={[
            { value: "LOCATION", label: "Location-based" },
            { value: "MARKET", label: "Market-based" },
          ]}
        />
        <FormField
          name="facilityId"
          label="Limit to one facility"
          type="select"
          options={facilities}
          description="Leave blank to calculate the whole boundary."
        />
      </div>

      <ActionError state={state} showSuccess={false} />

      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton
          name="__mode"
          value="preview"
          pending={pending}
          pendingLabel="Computing…"
          variant="outline"
        >
          <Eye className="size-3.5" />
          Preview (no write)
        </SubmitButton>
        <SubmitButton name="__mode" value="run" pending={pending} pendingLabel="Running…">
          <Calculator className="size-3.5" />
          Run and persist
        </SubmitButton>
      </div>

      {preview && (
        <Alert className="border-emerald-500/40" data-testid="preview-result">
          <Eye className="text-emerald-600" />
          <AlertTitle>
            Preview: {formatEmissions(preview.totalEmissions)} {preview.unit} across{" "}
            {preview.resultCount} results — nothing was written
          </AlertTitle>
          <AlertDescription className="flex flex-wrap gap-1.5 pt-1">
            <Badge variant="outline">
              Scope 1 {formatEmissions(preview.scope1Total)} {preview.unit}
            </Badge>
            <Badge variant="outline">
              Scope 2 location {formatEmissions(preview.scope2Location)} {preview.unit}
            </Badge>
            <Badge variant="outline">
              Scope 2 market {formatEmissions(preview.scope2Market)} {preview.unit}
            </Badge>
            <Badge variant="outline">
              Scope 3 {formatEmissions(preview.scope3Total)} {preview.unit}
            </Badge>
          </AlertDescription>
        </Alert>
      )}

      {run && (
        <Alert className="border-emerald-500/40" data-testid="run-result">
          <Calculator className="text-emerald-600" />
          <AlertTitle>
            Persisted {run.calculationIds.length} calculation record
            {run.calculationIds.length === 1 ? "" : "s"} and {run.resultCount} results
          </AlertTitle>
          <AlertDescription className="flex flex-wrap gap-1.5 pt-1">
            <Badge variant="outline">
              Total {formatEmissions(run.totalEmissions)} {run.unit}
            </Badge>
            <Badge variant="outline">
              Uncertainty ±{formatPercent(run.overallUncertainty)}
            </Badge>
            <Badge variant="outline">
              Data quality {formatNumber(run.dataQualityScore, 1)} / 100
            </Badge>
            <Badge variant="outline">Explanation {run.explanationId}</Badge>
          </AlertDescription>
        </Alert>
      )}
    </form>
  );
}
