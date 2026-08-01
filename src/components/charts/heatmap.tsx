"use client";

/**
 * Categorical heatmap (facility × month, or facility × scope).
 *
 * Drawn as a CSS grid rather than with recharts: recharts has no heatmap primitive
 * and a grid of `div`s is accessible, printable and needs no measurement pass. The
 * colour ramp is computed from the supplied values only, so an outlier cannot be
 * hidden by a hard-coded maximum.
 */

import { formatEmissions } from "@/lib/format";
import { cn } from "@/lib/utils";

export type HeatmapCell = {
  readonly row: string;
  readonly column: string;
  readonly value: number;
};

export type HeatmapProps = {
  readonly cells: readonly HeatmapCell[];
  /** Explicit ordering; derived from the cells when omitted. */
  readonly rows?: readonly string[];
  readonly columns?: readonly string[];
  readonly unit?: string;
  readonly className?: string;
};

/** Green (low) → amber → red (high), interpolated in RGB. */
function rampColour(intensity: number): string {
  const clamped = Math.min(1, Math.max(0, intensity));
  const stops: readonly [number, readonly [number, number, number]][] = [
    [0, [237, 250, 244]],
    [0.5, [253, 230, 138]],
    [1, [239, 68, 68]],
  ];
  for (let index = 0; index < stops.length - 1; index += 1) {
    const [fromStop, fromColour] = stops[index];
    const [toStop, toColour] = stops[index + 1];
    if (clamped <= toStop) {
      const t = (clamped - fromStop) / (toStop - fromStop || 1);
      const mixed = fromColour.map((channel, channelIndex) =>
        Math.round(channel + (toColour[channelIndex] - channel) * t),
      );
      return `rgb(${mixed[0]}, ${mixed[1]}, ${mixed[2]})`;
    }
  }
  return `rgb(239, 68, 68)`;
}

export function Heatmap({ cells, rows, columns, unit = "tCO2e", className }: HeatmapProps) {
  const rowKeys = rows ?? [...new Set(cells.map((cell) => cell.row))];
  const columnKeys = columns ?? [...new Set(cells.map((cell) => cell.column))];
  const byKey = new Map(cells.map((cell) => [`${cell.row}\u0000${cell.column}`, cell.value]));
  const max = cells.reduce((peak, cell) => Math.max(peak, cell.value), 0);

  return (
    <div className={cn("overflow-x-auto", className)} data-testid="heatmap">
      <table className="w-full border-separate border-spacing-0.5 text-xs">
        <thead>
          <tr>
            <th className="sticky left-0 bg-background px-2 py-1 text-left font-medium text-muted-foreground">
              &nbsp;
            </th>
            {columnKeys.map((column) => (
              <th key={column} className="px-1 py-1 text-center font-medium text-muted-foreground">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rowKeys.map((row) => (
            <tr key={row}>
              <th
                scope="row"
                className="sticky left-0 max-w-[14rem] truncate bg-background px-2 py-1 text-left font-normal"
                title={row}
              >
                {row}
              </th>
              {columnKeys.map((column) => {
                const value = byKey.get(`${row}\u0000${column}`);
                if (value === undefined) {
                  return (
                    <td
                      key={column}
                      className="h-7 rounded-sm border border-dashed border-muted text-center text-muted-foreground/60"
                      title={`${row} · ${column}: no data`}
                    >
                      —
                    </td>
                  );
                }
                const intensity = max > 0 ? value / max : 0;
                return (
                  <td
                    key={column}
                    className="h-7 rounded-sm text-center text-[10px] text-slate-900"
                    style={{ backgroundColor: rampColour(intensity) }}
                    title={`${row} · ${column}: ${formatEmissions(value)} ${unit}`}
                  >
                    {formatEmissions(value)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
        <span>0</span>
        <span
          className="h-2 flex-1 rounded-full"
          style={{
            background: `linear-gradient(to right, ${rampColour(0)}, ${rampColour(0.5)}, ${rampColour(1)})`,
          }}
        />
        <span>
          {formatEmissions(max)} {unit}
        </span>
      </div>
    </div>
  );
}
