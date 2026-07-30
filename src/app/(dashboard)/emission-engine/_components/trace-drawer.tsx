"use client";

/**
 * Calculation trace drawer.
 *
 * One expandable panel per emission result, listing the ordered trace steps the
 * engine emitted: formula string, inputs, output and unit. This is the record a
 * verifier re-performs the calculation from, so the formula is rendered verbatim
 * and never reformatted.
 */

import * as React from "react";
import { ChevronDown, ChevronRight, Sigma } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { formatEmissions, formatNumber, scopeLabel } from "@/lib/format";

export type TraceStepView = {
  readonly stepName: string;
  readonly formula: string;
  readonly inputs: Readonly<Record<string, number | string | boolean | null>>;
  readonly output: number;
  readonly unit: string;
  readonly notes: string | null;
  readonly orderIndex: number;
};

export type TracedResult = {
  readonly resultId: string;
  readonly label: string;
  readonly scope: string;
  readonly totalCO2e: number;
  readonly unit: string;
  readonly method: string;
  readonly dataQuality: string;
  readonly factorRationale: readonly string[];
  readonly steps: readonly TraceStepView[];
};

function inputSummary(inputs: Readonly<Record<string, number | string | boolean | null>>): string {
  const entries = Object.entries(inputs);
  if (entries.length === 0) return "no inputs";
  return entries.map(([key, value]) => `${key}=${value === null ? "null" : value}`).join(", ");
}

export function TraceDrawer({ results }: { readonly results: readonly TracedResult[] }) {
  const [openId, setOpenId] = React.useState<string | null>(results[0]?.resultId ?? null);

  if (results.length === 0) {
    return (
      <EmptyState
        title="No calculation traces"
        description="Run a calculation to produce a trace for every emission result."
        icon={Sigma}
      />
    );
  }

  return (
    <div className="divide-y rounded-lg border" data-testid="trace-drawer">
      {results.map((result) => {
        const open = openId === result.resultId;
        return (
          <div key={result.resultId}>
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setOpenId(open ? null : result.resultId)}
              className="flex w-full flex-wrap items-center gap-2 p-2.5 text-left hover:bg-muted/50"
            >
              {open ? (
                <ChevronDown className="size-3.5 text-muted-foreground" />
              ) : (
                <ChevronRight className="size-3.5 text-muted-foreground" />
              )}
              <span className="text-sm font-medium">{result.label}</span>
              <Badge variant="secondary">{scopeLabel(result.scope)}</Badge>
              <Badge variant="outline">{result.method}</Badge>
              <Badge variant="outline">quality {result.dataQuality}</Badge>
              <span className="ml-auto font-mono text-xs">
                {formatEmissions(result.totalCO2e)} {result.unit}
              </span>
            </button>

            {open && (
              <div className="space-y-3 border-t bg-muted/20 p-3">
                {result.factorRationale.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                      Factor selection rationale
                    </p>
                    <ul className="list-inside list-disc text-xs">
                      {result.factorRationale.map((line, index) => (
                        <li key={`${index}-${line}`}>{line}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <div>
                  <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    Trace ({result.steps.length} step{result.steps.length === 1 ? "" : "s"})
                  </p>
                  <ol className="mt-1 space-y-1">
                    {[...result.steps]
                      .sort((a, b) => a.orderIndex - b.orderIndex)
                      .map((step) => (
                        <li
                          key={step.orderIndex}
                          className="rounded-md bg-background p-2 text-[11px]"
                        >
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <span className="font-sans text-xs font-medium">
                              {step.orderIndex + 1}. {step.stepName}
                            </span>
                            <span className="font-mono">
                              {formatNumber(step.output, 4)} {step.unit}
                            </span>
                          </div>
                          <p className="font-mono break-all">{step.formula}</p>
                          <p className="font-mono break-all text-muted-foreground">
                            {inputSummary(step.inputs)}
                          </p>
                          {step.notes && (
                            <p className="text-muted-foreground">{step.notes}</p>
                          )}
                        </li>
                      ))}
                  </ol>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
