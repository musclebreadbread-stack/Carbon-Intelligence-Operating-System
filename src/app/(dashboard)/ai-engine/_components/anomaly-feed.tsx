"use client";

/**
 * Anomaly feed with severity badges and the resolve action.
 *
 * The anomalies are recomputed by `detectAnomalies()` on every read, so what is
 * shown is always the current verdict on the current data. Resolving one writes an
 * `AnomalyDetection` update and therefore needs a database — the refusal is shown
 * inline rather than swallowed.
 */

import * as React from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { ActionError } from "@/components/shared/form/action-error";
import { IDLE_ACTION_STATE, type ActionState } from "@/lib/actions/types";
import { formatDate, formatNumber, formatPercent } from "@/lib/format";

export type AnomalyRow = {
  readonly id: string;
  readonly metric: string;
  readonly sourceName: string;
  readonly label: string;
  readonly detectedValue: number;
  readonly expectedValue: number;
  readonly deviation: number;
  readonly deviationPercent: number;
  readonly severity: string;
  readonly description: string;
  readonly method: string;
  readonly direction: string;
  readonly score: number;
  readonly threshold: number;
  readonly unit: string;
  readonly detectedAt: string;
  readonly isResolved: boolean;
};

const SEVERITY_TONE: Readonly<Record<string, string>> = {
  CRITICAL: "border-red-500/50 bg-red-500/10 text-red-700 dark:text-red-300",
  HIGH: "border-orange-500/50 bg-orange-500/10 text-orange-700 dark:text-orange-300",
  MEDIUM: "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  LOW: "border-slate-400/50 bg-slate-400/10 text-slate-700 dark:text-slate-300",
};

export function AnomalyFeed({
  anomalies,
  resolveAnomaly,
}: {
  readonly anomalies: readonly AnomalyRow[];
  readonly resolveAnomaly: (
    input: unknown,
  ) => Promise<ActionState<{ readonly id: string; readonly resolution: string }>>;
}) {
  const [state, setState] = React.useState<
    ActionState<{ readonly id: string; readonly resolution: string }>
  >(IDLE_ACTION_STATE);
  const [pendingId, setPendingId] = React.useState<string | null>(null);

  async function resolve(id: string, resolution: string) {
    setPendingId(id);
    try {
      setState(await resolveAnomaly({ anomalyId: id, resolution }));
    } finally {
      setPendingId(null);
    }
  }

  if (anomalies.length === 0) {
    return (
      <EmptyState
        title="No anomalies detected"
        description="Every activity series is within its threshold, which is itself a result: detectAnomalies() ran and flagged nothing."
        icon={CheckCircle2}
      />
    );
  }

  return (
    <div className="space-y-3" data-testid="anomaly-feed">
      <ActionError state={state} />
      <ul className="space-y-2">
        {anomalies.map((anomaly) => (
          <li key={anomaly.id} className="rounded-lg border p-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <AlertTriangle className="size-4 text-amber-600" />
              <span className="text-sm font-medium">{anomaly.sourceName}</span>
              <Badge variant="outline" className={SEVERITY_TONE[anomaly.severity] ?? ""}>
                {anomaly.severity}
              </Badge>
              <Badge variant="outline">{anomaly.method}</Badge>
              <Badge variant="outline">{anomaly.label}</Badge>
              <span className="ml-auto text-xs text-muted-foreground">
                {formatDate(anomaly.detectedAt)}
              </span>
            </div>
            <p className="mt-1 text-xs">{anomaly.description}</p>
            <div className="mt-1 flex flex-wrap gap-3 font-mono text-[11px] text-muted-foreground">
              <span>
                observed {formatNumber(anomaly.detectedValue, 2)} {anomaly.unit}
              </span>
              <span>
                expected {formatNumber(anomaly.expectedValue, 2)} {anomaly.unit}
              </span>
              <span>
                deviation {formatNumber(anomaly.deviation, 2)} (
                {formatPercent(anomaly.deviationPercent)})
              </span>
              <span>
                score {formatNumber(anomaly.score, 2)} vs threshold{" "}
                {formatNumber(anomaly.threshold, 2)}
              </span>
              <span>{anomaly.direction} the expectation</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(["CONFIRMED", "FALSE_POSITIVE", "CORRECTED"] as const).map((resolution) => (
                <Button
                  key={resolution}
                  size="xs"
                  variant="outline"
                  disabled={pendingId === anomaly.id || anomaly.isResolved}
                  onClick={() => resolve(anomaly.id, resolution)}
                >
                  {resolution.replace(/_/g, " ").toLowerCase()}
                </Button>
              ))}
              {anomaly.isResolved && <Badge variant="secondary">resolved</Badge>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
