"use client";

/**
 * Year-on-year waterfall.
 *
 * Implemented with two stacked bars: an invisible "base" that lifts each step to
 * where the running total sits, and the visible delta on top. That is the standard
 * way to draw a waterfall with a stacked bar chart and it keeps the arithmetic in
 * the caller, which passes in already-computed deltas.
 */

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { chartTooltipStyle } from "./palette";

export type WaterfallStep = {
  readonly label: string;
  /** Signed contribution; positive increases emissions. */
  readonly delta: number;
  /** `true` for the opening and closing totals, drawn from zero. */
  readonly isTotal?: boolean;
};

export type WaterfallChartProps = {
  readonly steps: readonly WaterfallStep[];
  readonly unit?: string;
  readonly height?: number;
};

type Bucket = {
  readonly label: string;
  readonly base: number;
  readonly value: number;
  readonly delta: number;
  readonly isTotal: boolean;
  readonly runningTotal: number;
};

function toBuckets(steps: readonly WaterfallStep[]): Bucket[] {
  let running = 0;
  return steps.map((step) => {
    if (step.isTotal) {
      running = step.delta;
      return {
        label: step.label,
        base: 0,
        value: step.delta,
        delta: step.delta,
        isTotal: true,
        runningTotal: running,
      };
    }
    const start = running;
    running += step.delta;
    return {
      label: step.label,
      base: Math.min(start, running),
      value: Math.abs(step.delta),
      delta: step.delta,
      isTotal: false,
      runningTotal: running,
    };
  });
}

export function WaterfallChart({ steps, unit = "tCO2e", height = 300 }: WaterfallChartProps) {
  const buckets = toBuckets(steps);

  return (
    <div style={{ height }} data-testid="waterfall-chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={buckets} margin={{ top: 8, right: 8, bottom: 44, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis
            dataKey="label"
            fontSize={10}
            angle={-30}
            textAnchor="end"
            interval={0}
            height={44}
          />
          <YAxis fontSize={11} width={64} tickFormatter={(value: number) => value.toLocaleString("en-US")} />
          <Tooltip
            contentStyle={chartTooltipStyle}
            formatter={(value: unknown, name: unknown, item: unknown): [string, string] => {
              if (name === "base") return ["", ""];
              const payload = (item as { payload?: Bucket } | undefined)?.payload;
              const signed = payload?.delta ?? 0;
              return [
                `${signed > 0 && !payload?.isTotal ? "+" : ""}${signed.toLocaleString("en-US", {
                  maximumFractionDigits: 1,
                })} ${unit} · running total ${(payload?.runningTotal ?? 0).toLocaleString("en-US", {
                  maximumFractionDigits: 1,
                })} ${unit}`,
                payload?.isTotal ? "Total" : "Change",
              ];
            }}
          />
          <Bar dataKey="base" stackId="waterfall" fill="transparent" isAnimationActive={false} />
          <Bar dataKey="value" stackId="waterfall">
            {buckets.map((bucket) => (
              <Cell
                key={bucket.label}
                fill={
                  bucket.isTotal ? "#6b7280" : bucket.delta < 0 ? "#10b981" : "#ef4444"
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
