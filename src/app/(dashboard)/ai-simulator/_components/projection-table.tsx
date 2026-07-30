/**
 * Year-by-year projection table.
 *
 * Renders `ScenarioResultPoint[]` exactly as `projectScenario()` produced them —
 * the item-37 test reads the 2030 cell out of this table and compares it with a
 * direct `projectScenario()` call, which is what proves the simulator is not
 * showing a canned series.
 */

import { Badge } from "@/components/ui/badge";
import type { ScenarioResultPoint } from "@/lib/domain/scenarios/project";
import { formatCurrency, formatEmissions, formatFraction, formatPercent } from "@/lib/format";

export type ProjectionTableProps = {
  readonly points: readonly ScenarioResultPoint[];
  readonly currency?: string;
  /** Years to show; every year is shown when omitted. */
  readonly highlightYears?: readonly number[];
};

export function ProjectionTable({
  points,
  currency = "USD",
  highlightYears,
}: ProjectionTableProps) {
  return (
    <div className="overflow-x-auto rounded-lg border" data-testid="projection-table">
      <table className="w-full text-xs">
        <thead className="bg-muted/50">
          <tr>
            <th className="px-2 py-1.5 text-left font-medium">Year</th>
            <th className="px-2 py-1.5 text-right font-medium">Scope 1</th>
            <th className="px-2 py-1.5 text-right font-medium">Scope 2</th>
            <th className="px-2 py-1.5 text-right font-medium">Scope 3</th>
            <th className="px-2 py-1.5 text-right font-medium">Total</th>
            <th className="px-2 py-1.5 text-right font-medium">Reduction</th>
            <th className="px-2 py-1.5 text-right font-medium">Renewable</th>
            <th className="px-2 py-1.5 text-right font-medium">Cost</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr
              key={point.year}
              className="border-t"
              data-testid={`projection-row-${point.year}`}
            >
              <td className="px-2 py-1 font-medium">
                {point.year}
                {highlightYears?.includes(point.year) && (
                  <Badge variant="outline" className="ml-1.5">
                    milestone
                  </Badge>
                )}
              </td>
              <td className="px-2 py-1 text-right font-mono">
                {formatEmissions(point.scope1Emissions)}
              </td>
              <td className="px-2 py-1 text-right font-mono">
                {formatEmissions(point.scope2Emissions)}
              </td>
              <td className="px-2 py-1 text-right font-mono">
                {formatEmissions(point.scope3Emissions)}
              </td>
              <td
                className="px-2 py-1 text-right font-mono font-semibold"
                data-testid={`projection-total-${point.year}`}
              >
                {formatEmissions(point.totalEmissions)}
              </td>
              <td className="px-2 py-1 text-right font-mono">
                {formatPercent(point.metadata.reductionPercent)}
              </td>
              <td className="px-2 py-1 text-right font-mono">
                {point.renewableShare === null ? "—" : formatFraction(point.renewableShare)}
              </td>
              <td className="px-2 py-1 text-right font-mono">
                {formatCurrency(point.costImplication, currency)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="border-t px-2 py-1.5 text-[11px] text-muted-foreground">
        Every figure is `projectScenario()` output for the scenario&apos;s own lever set;
        emissions are in {points[0]?.unit ?? "tCO2e"}.
      </p>
    </div>
  );
}
