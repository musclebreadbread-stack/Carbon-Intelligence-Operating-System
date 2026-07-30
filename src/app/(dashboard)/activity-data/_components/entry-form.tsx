"use client";

/**
 * Activity-entry create/edit form.
 *
 * react-hook-form + `zodResolver`, so a bad value is caught before the round trip;
 * `activityDataEntryInputSchema` on the server stays authoritative and its
 * `fieldErrors` are merged back into the same fields via `setError`.
 *
 * The resolver schema is a *client mirror* of the server schema rather than the
 * schema itself: HTML inputs hand back strings, and the server schema declares
 * `z.number()` / `z.coerce.date()`. Mirroring keeps the coercion explicit and the
 * messages identical.
 *
 * `createActivityEntryAction` returns `data.ruleFlags` — non-blocking rule-engine
 * warnings — which are surfaced inline. A *blocking* `reject` comes back as
 * `VALIDATION_ERROR` with the messages joined, so that is rendered as a rejection
 * banner rather than attached to a field.
 */

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, Ban, Info } from "lucide-react";
import { z } from "zod";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/shared/form/form-field";
import { SubmitButton } from "@/components/shared/form/submit-button";
import { ActionError } from "@/components/shared/form/action-error";
import { IDLE_ACTION_STATE, type ActionState } from "@/lib/actions/types";

export const entryFormSchema = z
  .object({
    activityDataId: z.string().min(1, "Select the activity data set"),
    emissionSourceId: z.string().optional(),
    quantity: z.coerce
      .number({ invalid_type_error: "Quantity must be a number" })
      .positive("Quantity must be greater than zero"),
    unit: z.string().min(1, "Select a unit"),
    startDate: z.string().min(1, "Start date is required"),
    endDate: z.string().min(1, "End date is required"),
    notes: z.string().optional(),
    evidenceUrl: z.string().optional(),
    isEstimated: z.boolean().optional(),
    uncertainty: z.coerce
      .number()
      .min(0, "Uncertainty is a 0–1 fraction")
      .max(1, "Uncertainty is a 0–1 fraction")
      .optional(),
  })
  .refine(
    (value) =>
      value.startDate === "" ||
      value.endDate === "" ||
      new Date(value.endDate).getTime() >= new Date(value.startDate).getTime(),
    { message: "End date must be on or after the start date", path: ["endDate"] },
  );

export type EntryFormValues = z.input<typeof entryFormSchema>;

export type CreateEntryResult = {
  readonly id: string;
  readonly ruleFlags: readonly string[];
};

export type EntryFormProps = {
  readonly activityDataOptions: readonly { readonly value: string; readonly label: string }[];
  readonly emissionSourceOptions: readonly { readonly value: string; readonly label: string }[];
  readonly unitOptions: readonly { readonly value: string; readonly label: string }[];
  readonly createEntry: (input: unknown) => Promise<ActionState<CreateEntryResult>>;
  readonly defaultActivityDataId?: string;
  readonly onSaved?: () => void;
};

export function EntryForm({
  activityDataOptions,
  emissionSourceOptions,
  unitOptions,
  createEntry,
  defaultActivityDataId,
  onSaved,
}: EntryFormProps) {
  const [state, setState] = React.useState<ActionState<CreateEntryResult>>(
    IDLE_ACTION_STATE as ActionState<CreateEntryResult>,
  );
  const [pending, setPending] = React.useState(false);

  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors },
  } = useForm<EntryFormValues>({
    resolver: zodResolver(entryFormSchema),
    defaultValues: {
      activityDataId: defaultActivityDataId ?? activityDataOptions[0]?.value ?? "",
      unit: unitOptions[0]?.value ?? "",
      quantity: undefined,
      startDate: "",
      endDate: "",
      isEstimated: false,
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setPending(true);
    try {
      const result = await createEntry({
        activityDataId: values.activityDataId,
        emissionSourceId: values.emissionSourceId || null,
        quantity: Number(values.quantity),
        unit: values.unit,
        startDate: values.startDate,
        endDate: values.endDate,
        notes: values.notes || null,
        evidenceUrl: values.evidenceUrl || null,
        isEstimated: values.isEstimated ?? false,
        uncertainty:
          values.uncertainty === undefined || values.uncertainty === null
            ? null
            : Number(values.uncertainty),
      });
      setState(result);

      if (result.status === "error" && result.fieldErrors) {
        for (const [path, messages] of Object.entries(result.fieldErrors)) {
          setError(path as keyof EntryFormValues, { message: messages.join(" ") });
        }
      }
      if (result.status === "success") {
        reset();
        onSaved?.();
      }
    } finally {
      setPending(false);
    }
  });

  const ruleFlags = state.status === "success" ? state.data.ruleFlags : [];
  // A blocking `reject` effect arrives as VALIDATION_ERROR with no fieldErrors:
  // it is a rejection of the row as a whole, not a problem with one input.
  const rejection =
    state.status === "error" &&
    state.code === "VALIDATION_ERROR" &&
    (state.fieldErrors === undefined || Object.keys(state.fieldErrors).length === 0)
      ? state.message
      : null;

  return (
    <form onSubmit={onSubmit} className="space-y-4" data-testid="activity-entry-form" noValidate>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField
          name="activityDataId"
          label="Activity data set"
          type="select"
          required
          options={activityDataOptions}
          error={errors.activityDataId?.message}
          inputProps={register("activityDataId")}
        />
        <FormField
          name="emissionSourceId"
          label="Emission source"
          type="select"
          options={emissionSourceOptions}
          description="Determines which scope engine and factor criteria apply."
          error={errors.emissionSourceId?.message}
          inputProps={register("emissionSourceId")}
        />
        <FormField
          name="quantity"
          label="Quantity"
          type="number"
          step="any"
          required
          error={errors.quantity?.message}
          inputProps={register("quantity")}
        />
        <FormField
          name="unit"
          label="Unit"
          type="select"
          required
          options={unitOptions}
          description="Must exist in the unit registry, or conversion would fail at calculation time."
          error={errors.unit?.message}
          inputProps={register("unit")}
        />
        <FormField
          name="startDate"
          label="Period start"
          type="date"
          required
          error={errors.startDate?.message}
          inputProps={register("startDate")}
        />
        <FormField
          name="endDate"
          label="Period end"
          type="date"
          required
          error={errors.endDate?.message}
          inputProps={register("endDate")}
        />
        <FormField
          name="uncertainty"
          label="Uncertainty (0–1)"
          type="number"
          step="any"
          min={0}
          max={1}
          description="Relative uncertainty of the quantity; feeds the Monte Carlo pass."
          error={errors.uncertainty?.message}
          inputProps={register("uncertainty")}
        />
        <FormField
          name="evidenceUrl"
          label="Evidence URL"
          type="url"
          description="An entry with evidence scores higher on reliability."
          error={errors.evidenceUrl?.message}
          inputProps={register("evidenceUrl")}
        />
        <FormField
          name="notes"
          label="Notes"
          type="textarea"
          className="sm:col-span-2"
          error={errors.notes?.message}
          inputProps={register("notes")}
        />
        <FormField
          name="isEstimated"
          label="Estimated (not metered)"
          type="checkbox"
          error={errors.isEstimated?.message}
          inputProps={register("isEstimated")}
        />
      </div>

      {rejection && (
        <Alert variant="destructive" data-testid="entry-rejection">
          <Ban />
          <AlertTitle>Rejected by a validation rule</AlertTitle>
          <AlertDescription>{rejection}</AlertDescription>
        </Alert>
      )}

      {!rejection && (
        <ActionError
          state={state}
          handledFields={[
            "activityDataId",
            "emissionSourceId",
            "quantity",
            "unit",
            "startDate",
            "endDate",
            "notes",
            "evidenceUrl",
            "isEstimated",
            "uncertainty",
          ]}
        />
      )}

      {ruleFlags.length > 0 && (
        <Alert data-testid="entry-rule-flags">
          <AlertTriangle className="text-amber-600" />
          <AlertTitle>
            Saved with {ruleFlags.length} non-blocking warning
            {ruleFlags.length === 1 ? "" : "s"}
          </AlertTitle>
          <AlertDescription>
            <ul className="list-inside list-disc text-xs">
              {ruleFlags.map((flag) => (
                <li key={flag}>{flag}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <div className="flex items-center gap-2">
        <SubmitButton pending={pending} pendingLabel="Saving…">
          Save entry
        </SubmitButton>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => {
            reset();
            setState(IDLE_ACTION_STATE as ActionState<CreateEntryResult>);
          }}
        >
          Reset
        </Button>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Info className="size-3" />
          Validation rules run server-side on save.
        </span>
      </div>
    </form>
  );
}
