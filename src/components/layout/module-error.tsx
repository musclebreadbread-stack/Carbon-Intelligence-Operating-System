"use client";

/**
 * Shared error-boundary UI.
 *
 * Every `error.tsx` in the app renders this so the recovery affordances are
 * identical everywhere: `unstable_retry()` (the Next 16 replacement for `reset()`,
 * which re-fetches as well as re-renders), and a targeted link for the two cases a
 * retry can never fix — an expired session and a missing permission.
 */

import * as React from "react";
import { AlertOctagon, KeyRound, RefreshCw, ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { LinkButton } from "@/components/shared/link-button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { boundaryCopy } from "@/lib/error-boundary";

export type ModuleErrorProps = {
  readonly error: Error & { readonly digest?: string };
  /** Next 16 error-boundary prop; re-fetches and re-renders the segment. */
  readonly retry?: () => void;
  /** Module name, used in the generic title. */
  readonly segment?: string;
};

export function ModuleError({ error, retry, segment }: ModuleErrorProps) {
  React.useEffect(() => {
    console.error(`[boundary${segment ? `:${segment}` : ""}]`, error);
  }, [error, segment]);

  const copy = boundaryCopy(error, segment);
  const Icon =
    copy.kind === "forbidden" ? ShieldAlert : copy.kind === "unauthorized" ? KeyRound : AlertOctagon;

  return (
    <Card className="mx-auto max-w-2xl" data-testid="module-error">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="size-4 text-destructive" />
          {copy.title}
        </CardTitle>
        <CardDescription>{copy.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {error.digest && (
          <p className="text-xs text-muted-foreground">
            Error digest: <span className="font-mono">{error.digest}</span>
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {copy.retryable && retry && (
            <Button size="sm" onClick={() => retry()}>
              <RefreshCw className="size-3.5" />
              Try again
            </Button>
          )}
          {copy.actionHref && copy.actionLabel && (
            <LinkButton size="sm" variant="outline" href={copy.actionHref}>
              {copy.actionLabel}
            </LinkButton>
          )}
          <LinkButton size="sm" variant="ghost" href="/dashboard">
            Back to dashboard
          </LinkButton>
        </div>
      </CardContent>
    </Card>
  );
}
