/**
 * Per-scope inventory totals.
 *
 * The figures are `buildInventory()` output, handed in by the page — this component
 * performs no arithmetic beyond formatting, which is what makes it assertable: the
 * item-36 test computes `buildInventory()` over the fixture dataset itself and
 * checks that the rendered strings match.
 */

import { Badge } from "@/components/ui/badge";
import type { InventoryTotals } from "@/lib/domain/emissions/aggregate";
import { formatEmissions, formatPercent } from "@/lib/format";
import { isScope3Category, scope3Definition } from "@/lib/reference/scope3-categories";

export type ScopeTotalsProps = {
  readonly totals: InventoryTotals;
  /** Shown alongside each scope when a consolidated view is also available. */
  readonly consolidated?: InventoryTotals;
};

function share(part: number, whole: number): number {
  return whole === 0 ? 0 : (part / whole) * 100;
}

export function ScopeTotals({ totals, consolidated }: ScopeTotalsProps) {
  const rows = [
    {
      key: "scope1",
      label: "Scope 1 (direct)",
      value: totals.scope1Total,
      consolidatedValue: consolidated?.scope1Total,
      note: "Stationary, mobile, process and fugitive sources",
    },
    {
      key: "scope2Location",
      label: "Scope 2 (location-based)",
      value: totals.scope2Location,
      consolidatedValue: consolidated?.scope2Location,
      note: "Grid average factor × purchased energy",
    },
    {
      key: "scope2Market",
      label: "Scope 2 (market-based)",
      value: totals.scope2Market,
      consolidatedValue: consolidated?.scope2Market,
      note: "Contractual instruments applied, residual mix for the remainder",
    },
    {
      key: "scope3",
      label: "Scope 3 (value chain)",
      value: totals.scope3Total,
      consolidatedValue: consolidated?.scope3Total,
      note: `${Object.keys(totals.scope3ByCategory).length} of 15 categories reported`,
    },
  ] as const;

  return (
    <div className="space-y-4" data-testid="scope-totals">
      <div className="grid gap-3 sm:grid-cols-2">
        {rows.map((row) => (
          <div key={row.key} className="rounded-lg border p-3" data-testid={`scope-total-${row.key}`}>
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-xs text-muted-foreground">{row.label}</p>
              <span className="text-xs text-muted-foreground">
                {formatPercent(share(row.value, totals.totalEmissions))}
              </span>
            </div>
            <p className="text-xl font-semibold">
              <span data-testid={`scope-value-${row.key}`}>{formatEmissions(row.value)}</span>{" "}
              <span className="text-sm font-normal text-muted-foreground">{totals.unit}</span>
            </p>
            {row.consolidatedValue !== undefined && (
              <p className="text-[11px] text-muted-foreground">
                consolidated: {formatEmissions(row.consolidatedValue)} {totals.unit}
              </p>
            )}
            <p className="text-[11px] text-muted-foreground">{row.note}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-baseline gap-3 rounded-lg border bg-muted/40 p-3">
        <div>
          <p className="text-xs text-muted-foreground">
            Total (Scope 2 {totals.scope2Basis.toLowerCase()} basis)
          </p>
          <p className="text-2xl font-semibold">
            <span data-testid="scope-value-total">{formatEmissions(totals.totalEmissions)}</span>{" "}
            <span className="text-sm font-normal text-muted-foreground">{totals.unit}</span>
          </p>
        </div>
        <div className="ml-auto space-y-1 text-right">
          <Badge variant="outline">{totals.resultCount} emission results</Badge>
          <p className="text-[11px] text-muted-foreground">
            Biogenic CO₂ reported separately:{" "}
            <span data-testid="scope-value-biogenic">
              {formatEmissions(totals.biogenicCO2)}
            </span>{" "}
            {totals.unit}
          </p>
        </div>
      </div>

      {Object.keys(totals.scope3ByCategory).length > 0 && (
        <div className="space-y-1.5">
          <p className="text-sm font-medium">Scope 3 by category</p>
          <ul className="space-y-1" data-testid="scope3-categories">
            {Object.entries(totals.scope3ByCategory)
              .sort(([, a], [, b]) => (b ?? 0) - (a ?? 0))
              .map(([category, value]) => {
                const definition = isScope3Category(category)
                  ? scope3Definition(category)
                  : undefined;
                return (
                  <li key={category} className="flex items-center gap-2 text-xs">
                    <span className="w-8 shrink-0 font-mono text-muted-foreground">
                      {definition ? `#${definition.number}` : "—"}
                    </span>
                    <span className="w-56 shrink-0 truncate">
                      {definition ? `${definition.nameEn} / ${definition.nameKo}` : category}
                    </span>
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <span
                        className="block h-full rounded-full bg-emerald-500"
                        style={{
                          width: `${Math.min(100, share(value ?? 0, totals.scope3Total))}%`,
                        }}
                      />
                    </span>
                    <span className="w-28 shrink-0 text-right font-mono">
                      {formatEmissions(value ?? 0)} {totals.unit}
                    </span>
                  </li>
                );
              })}
          </ul>
        </div>
      )}
    </div>
  );
}
