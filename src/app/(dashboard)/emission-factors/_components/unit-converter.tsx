"use client";

/**
 * Unit-conversion tool.
 *
 * Backed by `convertUnitAction`, which calls the same `convert()` the calculation
 * engines use — so a conversion checked here is the conversion the inventory will
 * apply, including the one-hop pivot through the canonical unit and the rejection of
 * incompatible dimensions.
 */

import * as React from "react";
import { ArrowRightLeft } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { FormField } from "@/components/shared/form/form-field";
import { SubmitButton } from "@/components/shared/form/submit-button";
import { ActionError } from "@/components/shared/form/action-error";
import { IDLE_ACTION_STATE, type ActionState } from "@/lib/actions/types";
import { formatNumber } from "@/lib/format";

export type ConversionResult = {
  readonly fromUnit: string;
  readonly toUnit: string;
  readonly factor: number;
};

export function UnitConverter({
  units,
  convertUnit,
}: {
  readonly units: readonly { readonly value: string; readonly label: string }[];
  readonly convertUnit: (input: unknown) => Promise<ActionState<ConversionResult>>;
}) {
  const [quantity, setQuantity] = React.useState("1000");

  const [state, formAction, pending] = React.useActionState<
    ActionState<ConversionResult>,
    FormData
  >(
    async (_previous, formData) =>
      convertUnit({
        fromUnit: String(formData.get("fromUnit") ?? ""),
        toUnit: String(formData.get("toUnit") ?? ""),
        // `unitConversionInputSchema` requires a positive `factor`; the tool asks
        // the engine for the 1:1 factor and scales the user's quantity by it.
        factor: 1,
      }),
    IDLE_ACTION_STATE as ActionState<ConversionResult>,
  );

  const parsedQuantity = Number(quantity);
  const converted =
    state.status === "success" && Number.isFinite(parsedQuantity)
      ? parsedQuantity * state.data.factor
      : null;

  return (
    <form action={formAction} className="space-y-4" data-testid="unit-converter">
      <div className="grid gap-3 sm:grid-cols-3">
        <FormField
          name="quantity"
          label="Quantity"
          type="number"
          step="any"
          inputProps={{
            value: quantity,
            onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
              setQuantity(event.target.value),
          }}
        />
        <FormField
          name="fromUnit"
          label="From"
          type="select"
          required
          options={units}
          defaultValue="MWh"
        />
        <FormField
          name="toUnit"
          label="To"
          type="select"
          required
          options={units}
          defaultValue="GJ"
        />
      </div>

      <ActionError state={state} showSuccess={false} />

      <SubmitButton pending={pending} pendingLabel="Converting…">
        <ArrowRightLeft className="size-3.5" />
        Convert
      </SubmitButton>

      {state.status === "success" && (
        <Alert className="border-emerald-500/40" data-testid="conversion-result">
          <AlertTitle>
            1 {state.data.fromUnit} = {formatNumber(state.data.factor, 6)} {state.data.toUnit}
          </AlertTitle>
          {converted !== null && (
            <AlertDescription>
              {formatNumber(parsedQuantity, 3)} {state.data.fromUnit} ={" "}
              <span className="font-mono">{formatNumber(converted, 6)}</span> {state.data.toUnit}
            </AlertDescription>
          )}
        </Alert>
      )}
    </form>
  );
}
