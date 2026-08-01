"use client";

/**
 * Declarative form over a server action.
 *
 * The item-30 actions all share one signature — `(rawInput: unknown) =>
 * Promise<ActionState<T>>` — and all validate with a zod schema that expects real
 * types (`z.number()`, not a numeric string). This component is the single place
 * that bridges `FormData` to that shape: it coerces each value according to its
 * field spec, submits, and renders the returned `ActionState` through
 * `ActionError`, mapping `fieldErrors` back onto the inputs by dotted path.
 *
 * `useActionState`'s reducer is a client function that *calls* the server action,
 * which is what lets one component serve every action without a per-action wrapper.
 */

import * as React from "react";

import { ActionError } from "@/components/shared/form/action-error";
import { FormField, type SelectOption } from "@/components/shared/form/form-field";
import { SubmitButton } from "@/components/shared/form/submit-button";
import { IDLE_ACTION_STATE, type ActionState } from "@/lib/actions/types";
import { cn } from "@/lib/utils";

export type ActionFormFieldType =
  | "text"
  | "number"
  | "date"
  | "email"
  | "url"
  | "select"
  | "textarea"
  | "checkbox";

export type ActionFormField = {
  readonly name: string;
  readonly label: string;
  readonly type?: ActionFormFieldType;
  readonly options?: readonly SelectOption[];
  readonly defaultValue?: string | number | boolean;
  readonly placeholder?: string;
  readonly description?: string;
  readonly required?: boolean;
  readonly step?: string;
  readonly min?: string | number;
  readonly max?: string | number;
  /** Grid span within the form's two-column layout. */
  readonly wide?: boolean;
};

export type ActionFormProps<TData> = {
  readonly action: (input: unknown) => Promise<ActionState<TData>>;
  readonly fields: readonly ActionFormField[];
  /** Values submitted with the form but not shown, e.g. `organizationId`. */
  readonly hidden?: Readonly<Record<string, string | number | boolean | null>>;
  readonly submitLabel: string;
  readonly pendingLabel?: string;
  /** Called with the payload after a successful submission. */
  readonly onSuccess?: (data: TData) => void;
  /** Rendered between the fields and the submit row. */
  readonly children?: React.ReactNode;
  /** Rendered under the submit row when the last submission succeeded. */
  readonly renderSuccess?: (data: TData) => React.ReactNode;
  readonly className?: string;
  readonly columns?: 1 | 2;
};

/** Coerces one form value to the type the zod schema expects. */
function coerce(
  value: FormDataEntryValue | null,
  field: ActionFormField,
): string | number | boolean | null {
  if (field.type === "checkbox") return value !== null;
  if (value === null) return null;
  const text = typeof value === "string" ? value.trim() : "";
  if (text.length === 0) return field.required ? "" : null;
  if (field.type === "number") {
    const parsed = Number(text);
    // A non-numeric string is passed through so zod reports the field rather than
    // the form silently submitting NaN.
    return Number.isFinite(parsed) ? parsed : text;
  }
  return text;
}

export function ActionForm<TData>({
  action,
  fields,
  hidden = {},
  submitLabel,
  pendingLabel,
  onSuccess,
  children,
  renderSuccess,
  className,
  columns = 2,
}: ActionFormProps<TData>) {
  const formRef = React.useRef<HTMLFormElement>(null);

  const [state, formAction, pending] = React.useActionState<ActionState<TData>, FormData>(
    async (_previous, formData) => {
      const payload: Record<string, unknown> = { ...hidden };
      for (const field of fields) {
        payload[field.name] = coerce(formData.get(field.name), field);
      }
      return action(payload);
    },
    IDLE_ACTION_STATE as ActionState<TData>,
  );

  const succeeded = state.status === "success";
  React.useEffect(() => {
    if (state.status !== "success") return;
    onSuccess?.(state.data);
    formRef.current?.reset();
    // Only re-run when a new success arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const fieldErrors = state.status === "error" ? (state.fieldErrors ?? {}) : {};

  return (
    <form ref={formRef} action={formAction} className={cn("space-y-4", className)}>
      <div
        className={cn(
          "grid gap-3",
          columns === 2 ? "sm:grid-cols-2" : "grid-cols-1",
        )}
      >
        {fields.map((field) => (
          <FormField
            key={field.name}
            name={field.name}
            label={field.label}
            type={field.type}
            options={field.options}
            defaultValue={field.defaultValue}
            placeholder={field.placeholder}
            description={field.description}
            required={field.required}
            step={field.step}
            min={field.min}
            max={field.max}
            serverErrors={fieldErrors[field.name]}
            className={field.wide && columns === 2 ? "sm:col-span-2" : undefined}
          />
        ))}
      </div>

      {children}

      <ActionError
        state={state}
        handledFields={fields.map((field) => field.name)}
        showSuccess
      />

      <div className="flex items-center gap-2">
        <SubmitButton pending={pending} pendingLabel={pendingLabel}>
          {submitLabel}
        </SubmitButton>
      </div>

      {succeeded && renderSuccess ? renderSuccess(state.data) : null}
    </form>
  );
}
