import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";

import { formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

export type StatDeltaProps = {
  /** Change in per cent; negative means the figure fell. */
  readonly change: number | null | undefined;
  /**
   * Which direction is good. For emissions a fall is an improvement, for target
   * achievement a rise is, so the colour cannot be inferred from the sign alone.
   */
  readonly goodDirection?: "down" | "up" | "neutral";
  readonly label?: string;
  readonly className?: string;
};

/** Signed change with a direction-aware colour, used by every KPI card. */
export function StatDelta({
  change,
  goodDirection = "down",
  label,
  className,
}: StatDeltaProps) {
  if (change === null || change === undefined || !Number.isFinite(change)) {
    return (
      <span className={cn("inline-flex items-center gap-1 text-xs text-muted-foreground", className)}>
        <ArrowRight className="size-3" />
        no comparison period
      </span>
    );
  }

  const flat = Math.abs(change) < 0.05;
  const improved =
    goodDirection === "neutral" ? null : goodDirection === "down" ? change < 0 : change > 0;
  const tone =
    flat || improved === null
      ? "text-muted-foreground"
      : improved
        ? "text-emerald-600"
        : "text-red-500";
  const Icon = flat ? ArrowRight : change < 0 ? ArrowDownRight : ArrowUpRight;

  return (
    <span className={cn("inline-flex items-center gap-1 text-xs", className)}>
      <Icon className={cn("size-3", tone)} />
      <span className={tone}>{formatPercent(Math.abs(change))}</span>
      {label && <span className="text-muted-foreground">{label}</span>}
    </span>
  );
}
