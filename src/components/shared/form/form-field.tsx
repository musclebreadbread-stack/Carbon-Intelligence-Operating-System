"use client";

/**
 * Field wrapper shared by every form.
 *
 * Deliberately un-opinionated about *how* the value is managed: it accepts either a
 * react-hook-form registration (spread onto `inputProps`) or nothing at all for a
 * plain uncontrolled field read from `FormData`. What it standardises is the parts
 * that must not vary — the label/control association, the description, the
 * `aria-invalid` wiring and where the error message appears.
 *
 * Errors arrive from two directions and are merged here:
 *   - client-side, from `zodResolver` via react-hook-form
 *   - server-side, from `ActionState.fieldErrors` keyed by dotted path
 *
 * Native `<select>` is used rather than the Base UI `Select`, so the value is
 * submitted with the form and the field works without JavaScript.
 */

import * as React from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export type SelectOption = {
  readonly value: string;
  readonly label: string;
};

export type FormFieldProps = {
  readonly name: string;
  readonly label: string;
  readonly type?:
    | "text"
    | "number"
    | "date"
    | "email"
    | "password"
    | "url"
    | "select"
    | "textarea"
    | "checkbox";
  readonly options?: readonly SelectOption[];
  readonly defaultValue?: string | number | boolean;
  readonly placeholder?: string;
  readonly description?: string;
  readonly required?: boolean;
  readonly disabled?: boolean;
  readonly step?: string;
  readonly min?: string | number;
  readonly max?: string | number;
  /** Client-side error from react-hook-form. */
  readonly error?: string;
  /** Server-side errors for this path, from `ActionState.fieldErrors`. */
  readonly serverErrors?: readonly string[];
  readonly className?: string;
  /** Extra props merged onto the control, e.g. a react-hook-form registration. */
  readonly inputProps?: Record<string, unknown>;
  readonly children?: React.ReactNode;
};

export function FormField({
  name,
  label,
  type = "text",
  options = [],
  defaultValue,
  placeholder,
  description,
  required,
  disabled,
  step,
  min,
  max,
  error,
  serverErrors,
  className,
  inputProps,
  children,
}: FormFieldProps) {
  const messages = [error, ...(serverErrors ?? [])].filter(
    (message): message is string => typeof message === "string" && message.length > 0,
  );
  const invalid = messages.length > 0;
  const describedBy = [
    description ? `${name}-description` : null,
    invalid ? `${name}-error` : null,
  ]
    .filter(Boolean)
    .join(" ");

  const shared = {
    id: name,
    name,
    disabled,
    required,
    "aria-invalid": invalid || undefined,
    "aria-describedby": describedBy.length > 0 ? describedBy : undefined,
    ...inputProps,
  };

  return (
    <div className={cn("space-y-1.5", className)}>
      {type === "checkbox" ? (
        <div className="flex items-center gap-2">
          <Checkbox
            id={name}
            name={name}
            defaultChecked={defaultValue === true}
            disabled={disabled}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy.length > 0 ? describedBy : undefined}
            {...(inputProps as Record<string, never>)}
          />
          <Label htmlFor={name} className="text-sm font-normal">
            {label}
          </Label>
        </div>
      ) : (
        <>
          <Label htmlFor={name}>
            {label}
            {required && <span className="ml-0.5 text-destructive">*</span>}
          </Label>
          {children ??
            (type === "select" ? (
              <select
                {...shared}
                defaultValue={defaultValue === undefined ? undefined : String(defaultValue)}
                className={cn(
                  "h-8 w-full rounded-lg border border-input bg-background px-2 text-sm",
                  "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                  "aria-invalid:border-destructive",
                )}
              >
                {!required && <option value="">—</option>}
                {options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            ) : type === "textarea" ? (
              <Textarea
                {...shared}
                defaultValue={defaultValue === undefined ? undefined : String(defaultValue)}
                placeholder={placeholder}
                rows={3}
              />
            ) : (
              <Input
                {...shared}
                type={type}
                defaultValue={defaultValue === undefined ? undefined : String(defaultValue)}
                placeholder={placeholder}
                step={step}
                min={min}
                max={max}
              />
            ))}
        </>
      )}

      {description && (
        <p id={`${name}-description`} className="text-xs text-muted-foreground">
          {description}
        </p>
      )}
      {invalid && (
        <p id={`${name}-error`} role="alert" className="text-xs text-destructive">
          {messages.join(" ")}
        </p>
      )}
    </div>
  );
}
