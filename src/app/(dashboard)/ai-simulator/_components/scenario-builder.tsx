"use client";

/**
 * Scenario builder.
 *
 * Every lever in `SCENARIO_LEVERS` is exposed, pre-filled from the selected
 * scenario type's published default set, so a one-click run reproduces a
 * defensible curve (IEA NZE, APS, STEPS) and an edited run is explicit about what
 * was changed.
 *
 * `previewScenarioAction` is read-only and therefore answers in demo mode;
 * `simulateScenarioAction` persists the `ScenarioResult` series and is refused
 * without a database.
 */

import * as React from "react";
import { FlaskConical, Save } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { FormField } from "@/components/shared/form/form-field";
import { SubmitButton } from "@/components/shared/form/submit-button";
import { ActionError } from "@/components/shared/form/action-error";
import { IDLE_ACTION_STATE, type ActionState } from "@/lib/actions/types";
import { formatCurrency, formatEmissions, formatFraction, formatPercent } from "@/lib/format";

export type SimulateScenarioResult = {
  readonly scenarioId: string | null;
  readonly persisted: boolean;
  readonly baselineEmissions: number;
  readonly targetEmissions: number;
  readonly targetReduction: number;
  readonly cumulativeEmissions: number;
  readonly cumulativeCost: number;
  readonly unit: string;
  readonly points: readonly {
    readonly year: number;
    readonly totalEmissions: number;
    readonly reductionPercent: number;
    readonly costImplication: number;
  }[];
};

export type LeverSpec = {
  readonly name: string;
  readonly label: string;
  readonly description: string;
  /** Default value per scenario type, so switching type re-seeds the form. */
  readonly defaultValue: number;
};

export function ScenarioBuilder({
  organizationId,
  scenarioTypes,
  levers,
  baseline,
  defaultTargetYear,
  currency,
  simulateScenario,
  previewScenario,
}: {
  readonly organizationId: string;
  readonly scenarioTypes: readonly { readonly value: string; readonly label: string }[];
  readonly levers: readonly LeverSpec[];
  readonly baseline: {
    readonly year: number;
    readonly scope1Emissions: number;
    readonly scope2Emissions: number;
    readonly scope3Emissions: number;
  };
  readonly defaultTargetYear: number;
  readonly currency: string;
  readonly simulateScenario: (input: unknown) => Promise<ActionState<SimulateScenarioResult>>;
  readonly previewScenario: (input: unknown) => Promise<ActionState<SimulateScenarioResult>>;
}) {
  const [state, formAction, pending] = React.useActionState<
    ActionState<SimulateScenarioResult>,
    FormData
  >(async (_previous, formData) => {
    const assumptions = levers
      .map((lever) => ({
        parameter: lever.name,
        value: Number(formData.get(lever.name)),
      }))
      .filter((assumption) => Number.isFinite(assumption.value));

    const payload = {
      organizationId,
      name: String(formData.get("name") ?? ""),
      type: String(formData.get("type") ?? "CUSTOM"),
      targetYear: Number(formData.get("targetYear")),
      baseline,
      assumptions,
      persist: formData.get("__mode") === "run",
    };
    return formData.get("__mode") === "run"
      ? simulateScenario(payload)
      : previewScenario(payload);
  }, IDLE_ACTION_STATE as ActionState<SimulateScenarioResult>);

  return (
    <form action={formAction} className="space-y-4" data-testid="scenario-builder">
      <div className="grid gap-3 sm:grid-cols-3">
        <FormField
          name="name"
          label="Scenario name"
          required
          defaultValue="Custom pathway"
          className="sm:col-span-2"
        />
        <FormField name="type" label="Type" type="select" required options={scenarioTypes} />
        <FormField
          name="targetYear"
          label="Target year"
          type="number"
          required
          defaultValue={defaultTargetYear}
          min={baseline.year + 1}
        />
        <div className="sm:col-span-2 self-end text-xs text-muted-foreground">
          Baseline {baseline.year}: Scope 1 {formatEmissions(baseline.scope1Emissions)}, Scope 2{" "}
          {formatEmissions(baseline.scope2Emissions)}, Scope 3{" "}
          {formatEmissions(baseline.scope3Emissions)} tCO2e — taken from the calculated
          inventory, not typed in.
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium">Assumption levers</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {levers.map((lever) => (
            <FormField
              key={lever.name}
              name={lever.name}
              label={lever.label}
              type="number"
              step="any"
              defaultValue={lever.defaultValue}
              description={lever.description}
            />
          ))}
        </div>
      </div>

      <ActionError state={state} showSuccess={false} />

      <div className="flex flex-wrap gap-2">
        <SubmitButton name="__mode" value="preview" pending={pending} variant="outline">
          <FlaskConical className="size-3.5" />
          Project (no write)
        </SubmitButton>
        <SubmitButton name="__mode" value="run" pending={pending}>
          <Save className="size-3.5" />
          Simulate and save
        </SubmitButton>
      </div>

      {state.status === "success" && (
        <Alert className="border-emerald-500/40" data-testid="scenario-result">
          <AlertTitle className="flex flex-wrap items-center gap-2">
            <span>
              {formatEmissions(state.data.baselineEmissions)} →{" "}
              {formatEmissions(state.data.targetEmissions)} {state.data.unit}
            </span>
            <Badge variant="outline">
              {formatFraction(state.data.targetReduction)} reduction
            </Badge>
            <Badge variant={state.data.persisted ? "secondary" : "outline"}>
              {state.data.persisted ? "saved" : "not saved"}
            </Badge>
          </AlertTitle>
          <AlertDescription className="space-y-1 pt-1 text-xs">
            <p>
              Cumulative emissions over the pathway:{" "}
              {formatEmissions(state.data.cumulativeEmissions)} {state.data.unit} · cumulative
              cost {formatCurrency(state.data.cumulativeCost, currency)}
            </p>
            <ul className="grid gap-0.5 sm:grid-cols-3">
              {state.data.points
                .filter((point, index) => index % 5 === 0 || index === state.data.points.length - 1)
                .map((point) => (
                  <li key={point.year} className="font-mono">
                    {point.year}: {formatEmissions(point.totalEmissions)} (
                    {formatPercent(point.reductionPercent)})
                  </li>
                ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
    </form>
  );
}
