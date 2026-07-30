"use client";

/**
 * Renders an `ActionState` from `src/lib/actions/**`.
 *
 * Switches on `code`, not on the message, because the code is the stable contract.
 * Two codes get special treatment:
 *
 *   - `DEMO_MODE` is an *explanation*, not a failure: no database is configured, so
 *     nothing was saved and the figures on screen are still genuinely computed. It
 *     is rendered as a neutral notice so a reviewer exploring the app is not told
 *     they did something wrong.
 *   - `FORBIDDEN` and `UNAUTHORIZED` are distinct: 403 means ask an administrator,
 *     401 means sign in again. Conflating them sends the user round a loop.
 *
 * Field-level messages are *not* rendered here — they belong next to their input,
 * via `FormField`. Only errors whose path is unknown to the form are listed.
 */

import Link from "next/link";
import {
  CheckCircle2,
  Database,
  Info,
  KeyRound,
  ShieldAlert,
  TriangleAlert,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SETUP_GUIDE_PATH, resolveMessage } from "@/lib/i18n/messages";
import type { ActionState } from "@/lib/actions/types";
import { cn } from "@/lib/utils";

export type ActionErrorProps = {
  readonly state: ActionState<unknown>;
  /** Field paths the form renders inline; their messages are suppressed here. */
  readonly handledFields?: readonly string[];
  /** Show the success state as well as failures. */
  readonly showSuccess?: boolean;
  readonly className?: string;
};

export function ActionError({
  state,
  handledFields = [],
  showSuccess = true,
  className,
}: ActionErrorProps) {
  if (state.status === "success") {
    if (!showSuccess) return null;
    return (
      <Alert className={cn("border-emerald-500/40", className)} data-testid="action-success">
        <CheckCircle2 className="text-emerald-600" />
        <AlertTitle>{resolveMessage(state.messageKey, state.message)}</AlertTitle>
      </Alert>
    );
  }

  // The idle state carries no message; nothing has been submitted yet.
  if (state.messageKey === "action.idle" || state.message === "") return null;

  const message = resolveMessage(state.messageKey, state.message);
  const unhandled = Object.entries(state.fieldErrors ?? {}).filter(
    ([path]) => !handledFields.includes(path),
  );

  switch (state.code) {
    case "DEMO_MODE":
      return (
        <Alert className={cn("border-amber-400/60", className)} data-testid="action-demo-mode">
          <Database className="text-amber-600" />
          <AlertTitle>Not saved — no database is configured</AlertTitle>
          <AlertDescription className="space-y-1">
            <p>{message}</p>
            <p className="text-xs">
              Provision PostgreSQL and set <code>DATABASE_URL</code> to enable writes. The
              steps are in <code>{SETUP_GUIDE_PATH}</code>.
            </p>
          </AlertDescription>
        </Alert>
      );

    case "UNAUTHORIZED":
      return (
        <Alert variant="destructive" className={className} data-testid="action-unauthorized">
          <KeyRound />
          <AlertTitle>Your session has ended</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>{message}</p>
            <Button size="sm" variant="outline" render={<Link href="/login" />}>
              Sign in again
            </Button>
          </AlertDescription>
        </Alert>
      );

    case "FORBIDDEN":
      return (
        <Alert variant="destructive" className={className} data-testid="action-forbidden">
          <ShieldAlert />
          <AlertTitle>You do not have permission for this</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>{message}</p>
            <p className="text-xs">
              You are signed in — this is a missing permission, not a missing session.
            </p>
            <Button size="sm" variant="outline" render={<Link href="/security" />}>
              View roles and permissions
            </Button>
          </AlertDescription>
        </Alert>
      );

    case "VALIDATION_ERROR":
      return (
        <Alert variant="destructive" className={className} data-testid="action-validation-error">
          <TriangleAlert />
          <AlertTitle>{message}</AlertTitle>
          {unhandled.length > 0 && (
            <AlertDescription>
              <ul className="list-inside list-disc text-xs">
                {unhandled.map(([path, messages]) => (
                  <li key={path}>
                    <span className="font-medium">{path}</span>: {messages.join(" ")}
                  </li>
                ))}
              </ul>
            </AlertDescription>
          )}
        </Alert>
      );

    case "LLM_ERROR":
    case "RATE_LIMITED":
      return (
        <Alert className={className} data-testid={`action-${state.code.toLowerCase()}`}>
          <Info />
          <AlertTitle>{message}</AlertTitle>
        </Alert>
      );

    default:
      return (
        <Alert variant="destructive" className={className} data-testid="action-error">
          <TriangleAlert />
          <AlertTitle>{message}</AlertTitle>
          <AlertDescription className="text-xs">Code: {state.code}</AlertDescription>
        </Alert>
      );
  }
}
