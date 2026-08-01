"use client";

/**
 * Marginal abatement cost curve.
 *
 * A MACC is a step chart: each measure's bar is as wide as its abatement potential
 * and as tall as its marginal cost, cheapest first. Recharts has no native
 * variable-width bar, so the curve is drawn as an SVG step path over a numeric
 * x-axis of cumulative abatement — which is the correct reading of the curve
 * anyway, because the x position of a measure is what tells you how much abatement
 * you have already bought.
 */

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { MaccPoint } from "@/lib/domain/finance/macc";
import { chartTooltipStyle, formatChartNumber } from "./palette";

export type MaccChartProps = {
  readonly points: readonly MaccPoint[];
  readonly currency?: string;
  /** Abatement required, drawn as a vertical marker. */
  readonly abatementTarget?: number | null;
  readonly height?: number;
};

type Datum = {
  readonly name: string;
  readonly marginalCost: number;
  readonly abatementPotential: number;
  readonly cumulativeAbatement: number;
  readonly category: string | null;
};

export function MaccChart({
  points,
  currency = "USD",
  abatementTarget,
  height = 320,
}: MaccChartProps) {
  const data: Datum[] = points.map((point) => ({
    name: point.name,
    marginalCost: point.marginalCost,
    abatementPotential: point.abatementPotential,
    cumulativeAbatement: point.cumulativeAbatement,
    category: point.category,
  }));

  // Cheapest measures are negative-cost (they save money) and are worth showing
  // in a different colour: they are the "do this first regardless" set.
  const barColour = (cost: number) => (cost < 0 ? "#10b981" : cost < 50 ? "#f59e0b" : "#ef4444");

  const cumulativeAtTarget = abatementTarget
    ? data.find((datum) => datum.cumulativeAbatement >= abatementTarget)?.name
    : undefined;

  return (
    <div style={{ height }} data-testid="macc-chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 56, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis
            dataKey="name"
            fontSize={10}
            angle={-35}
            textAnchor="end"
            interval={0}
            height={56}
          />
          <YAxis
            fontSize={11}
            width={72}
            tickFormatter={(value: number) => value.toLocaleString("en-US")}
            label={{
              value: `${currency}/tCO2e`,
              angle: -90,
              position: "insideLeft",
              fontSize: 10,
            }}
          />
          <Tooltip
            contentStyle={chartTooltipStyle}
            formatter={(value: unknown, name: unknown, item: unknown): [string, string] => {
              const payload = (item as { payload?: Datum } | undefined)?.payload;
              return [
                `${formatChartNumber(value)} ${currency}/tCO2e · ` +
                  `${(payload?.abatementPotential ?? 0).toLocaleString("en-US")} tCO2e potential · ` +
                  `cumulative ${(payload?.cumulativeAbatement ?? 0).toLocaleString("en-US")} tCO2e`,
                name === "marginalCost" ? "Marginal cost" : String(name ?? ""),
              ];
            }}
          />
          <ReferenceLine y={0} stroke="currentColor" className="text-muted-foreground" />
          {cumulativeAtTarget && (
            <ReferenceLine
              x={cumulativeAtTarget}
              stroke="#6366f1"
              strokeDasharray="4 4"
              label={{ value: "target met", fontSize: 10, position: "insideTopRight" }}
            />
          )}
          <Bar dataKey="marginalCost" name="marginalCost">
            {data.map((datum) => (
              <Cell key={datum.name} fill={barColour(datum.marginalCost)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
