"use client";

import { Loader2 } from "lucide-react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";

export type SubmitButtonProps = {
  readonly children: React.ReactNode;
  readonly pendingLabel?: string;
  /** Set when the form is driven by `useTransition` rather than a form action. */
  readonly pending?: boolean;
  readonly disabled?: boolean;
  readonly variant?: "default" | "outline" | "secondary" | "ghost" | "destructive";
  readonly size?: "default" | "sm" | "lg";
  readonly className?: string;
};

/**
 * Submit control that disables itself while the action is in flight.
 *
 * `useFormStatus` only reports for the nearest enclosing `<form>`, which is exactly
 * the semantics wanted here; forms that submit through `useTransition` instead pass
 * `pending` explicitly.
 */
export function SubmitButton({
  children,
  pendingLabel,
  pending,
  disabled,
  variant = "default",
  size = "sm",
  className,
}: SubmitButtonProps) {
  const status = useFormStatus();
  const busy = pending ?? status.pending;

  return (
    <Button
      type="submit"
      variant={variant}
      size={size}
      disabled={busy || disabled}
      className={className}
    >
      {busy && <Loader2 className="size-3.5 animate-spin" />}
      {busy ? (pendingLabel ?? children) : children}
    </Button>
  );
}
