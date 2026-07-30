"use client";

/**
 * Emissions trend: stacked area per scope over time.
 *
 * Every chart in this directory is a client component that takes already-computed
 * points as props. The arithmetic stays in `src/lib/domain/**`, so a chart can never
 * become a second, divergent implementation of an aggregation.
 */

import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { SCOPE_COLORS, chartTooltipStyle, quantityTooltip } from "./palette";

export type EmissionsTrendPoint = {
  readonly label: string;
  readonly scope1: number;
  readonly scope2: number;
  readonly scope3: number;
};

export type EmissionsTrendProps = {
  readonly points: readonly EmissionsTrendPoint[];
  readonly unit?: string;
  readonly height?: number;
};

export function EmissionsTrendChart({
  points,
  unit = "tCO2e",
  height = 280,
}: EmissionsTrendProps) {
  return (
    <div style={{ height }} data-testid="emissions-trend-chart">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points as EmissionsTrendPoint[]} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis dataKey="label" fontSize={11} tickMargin={6} />
          <YAxis fontSize={11} width={64} tickFormatter={(value: number) => value.toLocaleString("en-US")} />
          <Tooltip contentStyle={chartTooltipStyle} formatter={quantityTooltip(unit)} />
          <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
          <Area
            type="monotone"
            dataKey="scope1"
            name="Scope 1"
            stackId="scopes"
            stroke={SCOPE_COLORS.scope1}
            fill={SCOPE_COLORS.scope1}
            fillOpacity={0.5}
          />
          <Area
            type="monotone"
            dataKey="scope2"
            name="Scope 2"
            stackId="scopes"
            stroke={SCOPE_COLORS.scope2}
            fill={SCOPE_COLORS.scope2}
            fillOpacity={0.5}
          />
          <Area
            type="monotone"
            dataKey="scope3"
            name="Scope 3"
            stackId="scopes"
            stroke={SCOPE_COLORS.scope3}
            fill={SCOPE_COLORS.scope3}
            fillOpacity={0.5}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
