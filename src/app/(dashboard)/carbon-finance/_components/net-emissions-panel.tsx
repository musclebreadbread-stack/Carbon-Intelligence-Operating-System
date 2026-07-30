/**
 * Gross versus net emissions.
 *
 * The GHG Protocol requires gross emissions to be reported unchanged and any
 * offsetting disclosed separately, which is exactly what `netEmissions()` returns:
 * `grossEmissions` is untouched, `netEmissions` is gross minus the retirements
 * claimed for the year, floored at zero, and `excessOffsets` records any
 * over-retirement rather than letting it create a negative inventory.
 *
 * The item-38 test reads these three cells and asserts net = gross − retired.
 */

import { Badge } from "@/components/ui/badge";
import type { NetEmissionsResult } from "@/lib/domain/credits/registry";
import { formatEmissions, formatPercent } from "@/lib/format";

export function NetEmissionsPanel({
  net,
  reportingYear,
}: {
  readonly net: NetEmissionsResult;
  readonly reportingYear: number;
}) {
  return (
    <div className="space-y-3" data-testid="net-emissions-panel">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Gross emissions ({reportingYear})</p>
          <p className="text-2xl font-semibold">
            <span data-testid="gross-emissions">{formatEmissions(net.grossEmissions)}</span>{" "}
            <span className="text-sm font-normal text-muted-foreground">{net.unit}</span>
          </p>
          <p className="text-[11px] text-muted-foreground">
            Unchanged by offsetting — this is the inventory figure.
          </p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Retired offsets</p>
          <p className="text-2xl font-semibold">
            <span data-testid="retired-offsets">{formatEmissions(net.offsetQuantity)}</span>{" "}
            <span className="text-sm font-normal text-muted-foreground">{net.unit}</span>
          </p>
          <p className="text-[11px] text-muted-foreground">
            {net.offsetCount} retirement{net.offsetCount === 1 ? "" : "s"} claimed for{" "}
            {reportingYear} · {formatPercent(net.offsetShare * 100)} of gross
          </p>
        </div>
        <div className="rounded-lg border bg-muted/40 p-3">
          <p className="text-xs text-muted-foreground">Net emissions</p>
          <p className="text-2xl font-semibold">
            <span data-testid="net-emissions">{formatEmissions(net.netEmissions)}</span>{" "}
            <span className="text-sm font-normal text-muted-foreground">{net.unit}</span>
          </p>
          <p className="text-[11px] text-muted-foreground">gross − retired offsets</p>
        </div>
      </div>

      {net.excessOffsets > 0 && (
        <Badge variant="outline" className="border-amber-500/50">
          {formatEmissions(net.excessOffsets)} {net.unit} of retirements exceed gross emissions
          and cannot be claimed
        </Badge>
      )}

      <p className="text-xs text-muted-foreground">{net.disclosure}</p>
    </div>
  );
}
