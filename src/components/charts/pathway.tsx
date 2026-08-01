"use client";

/**
 * Target pathway versus actuals and an optional scenario projection.
 *
 * Three series on one axis is exactly the comparison SBTi progress reporting asks
 * for: the required trajectory, what happened, and what a plan would deliver.
 */

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { PATHWAY_COLORS, chartTooltipStyle, quantityTooltip } from "./palette";

export type PathwayPoint = {
  readonly year: number;
  readonly pathway?: number | null;
  readonly actual?: number | null;
  readonly scenario?: number | null;
};

export type PathwayChartProps = {
  readonly points: readonly PathwayPoint[];
  readonly unit?: string;
  readonly height?: number;
  /** Vertical marker, e.g. the target year. */
  readonly markerYear?: number | null;
  readonly markerLabel?: string;
  readonly scenarioLabel?: string;
};

export function PathwayChart({
  points,
  unit = "tCO2e",
  height = 300,
  markerYear,
  markerLabel = "Target year",
  scenarioLabel = "Scenario",
}: PathwayChartProps) {
  return (
    <div style={{ height }} data-testid="pathway-chart">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points as PathwayPoint[]} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis dataKey="year" fontSize={11} tickMargin={6} />
          <YAxis fontSize={11} width={64} tickFormatter={(value: number) => value.toLocaleString("en-US")} />
          <Tooltip contentStyle={chartTooltipStyle} formatter={quantityTooltip(unit)} />
          <Legend iconType="line" wrapperStyle={{ fontSize: 11 }} />
          {markerYear ? (
            <ReferenceLine
              x={markerYear}
              stroke={PATHWAY_COLORS.budget}
              strokeDasharray="4 4"
              label={{ value: markerLabel, fontSize: 10, position: "insideTopRight" }}
            />
          ) : null}
          <Line
            type="monotone"
            dataKey="pathway"
            name="Required pathway"
            stroke={PATHWAY_COLORS.pathway}
            strokeWidth={2}
            dot={false}
            connectNulls
          />
          <Line
            type="monotone"
            dataKey="actual"
            name="Actual"
            stroke={PATHWAY_COLORS.actual}
            strokeWidth={2}
            dot={{ r: 3 }}
            connectNulls
          />
          <Line
            type="monotone"
            dataKey="scenario"
            name={scenarioLabel}
            stroke={PATHWAY_COLORS.scenario}
            strokeWidth={2}
            strokeDasharray="5 3"
            dot={false}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
