"use client";

/** Scope (or Scope 3 category) composition as a donut. */

import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { chartTooltipStyle, formatChartNumber, seriesColor, toNumber } from "./palette";

export type ScopeBreakdownSlice = {
  readonly name: string;
  readonly value: number;
  /** Optional explicit colour; falls back to the deterministic series palette. */
  readonly color?: string;
};

export type ScopeBreakdownProps = {
  readonly slices: readonly ScopeBreakdownSlice[];
  readonly unit?: string;
  readonly height?: number;
};

export function ScopeBreakdownChart({
  slices,
  unit = "tCO2e",
  height = 280,
}: ScopeBreakdownProps) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);

  return (
    <div style={{ height }} data-testid="scope-breakdown-chart">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={slices as ScopeBreakdownSlice[]}
            dataKey="value"
            nameKey="name"
            innerRadius="52%"
            outerRadius="80%"
            paddingAngle={1}
          >
            {slices.map((slice, index) => (
              <Cell key={slice.name} fill={slice.color ?? seriesColor(index)} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={chartTooltipStyle}
            formatter={(value: unknown, name: unknown): [string, string] => [
              `${formatChartNumber(value)} ${unit}` +
                (total > 0 ? ` (${((toNumber(value) / total) * 100).toFixed(1)}%)` : ""),
              String(name ?? ""),
            ]}
          />
          <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
