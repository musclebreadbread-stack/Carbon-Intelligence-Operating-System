import { Badge } from "@/components/ui/badge";
import { formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

export type ConfidenceBadgeProps = {
  /** `AIConfidenceScore.score`, a 0..1 fraction. */
  readonly score: number | null | undefined;
  /** `ConfidenceLevel` from `scoreConfidence`; derived from the score if absent. */
  readonly level?: string | null;
  readonly className?: string;
};

/** Level bands mirroring `CONFIDENCE_LEVEL_THRESHOLDS` in the domain. */
function levelFor(score: number): string {
  if (score >= 0.9) return "VERY_HIGH";
  if (score >= 0.75) return "HIGH";
  if (score >= 0.55) return "MEDIUM";
  if (score >= 0.35) return "LOW";
  return "VERY_LOW";
}

const LEVEL_STYLES: Readonly<Record<string, string>> = {
  VERY_HIGH: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  HIGH: "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300",
  MEDIUM: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  LOW: "border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-300",
  VERY_LOW: "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300",
};

const LEVEL_LABELS: Readonly<Record<string, string>> = {
  VERY_HIGH: "Very high",
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
  VERY_LOW: "Very low",
};

/**
 * Confidence chip.
 *
 * The score is always shown alongside the band: an audit reader needs the number,
 * not just the adjective.
 */
export function ConfidenceBadge({ score, level, className }: ConfidenceBadgeProps) {
  if (score === null || score === undefined || !Number.isFinite(score)) {
    return (
      <Badge variant="outline" className={className}>
        confidence not scored
      </Badge>
    );
  }
  const resolved = level ?? levelFor(score);
  return (
    <Badge
      variant="outline"
      className={cn(LEVEL_STYLES[resolved] ?? "", className)}
      title={`Confidence ${formatPercent(score * 100)} (${resolved})`}
    >
      {LEVEL_LABELS[resolved] ?? resolved} · {formatPercent(score * 100, 0)}
    </Badge>
  );
}
