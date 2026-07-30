/**
 * Verification finding management and audit readiness.
 *
 * `VerificationFinding.severity` and `.status` are free-text columns in the
 * schema, so this module owns the vocabulary: a fixed severity ladder with
 * explicit weights, and an explicit list of statuses that count as open. Both are
 * normalised case-insensitively, because findings are often imported from a
 * verifier's own spreadsheet.
 *
 * `readinessScore` answers the question a sustainability lead actually asks
 * before an engagement: *are we ready?* — as a weighted score with the specific
 * blockers named.
 *
 * Pure TypeScript — no framework, database or network imports.
 */

import { CalculationError } from "@/lib/core/errors";
import { clamp, roundTo, safeDivide, sum } from "@/lib/core/number";
import { MS_PER_DAY } from "@/lib/core/period";

/** Severity ladder, most serious first. */
export const FINDING_SEVERITIES = ["CRITICAL", "MAJOR", "MINOR", "OBSERVATION"] as const;
export type FindingSeverity = (typeof FINDING_SEVERITIES)[number];

/** Penalty each open finding of a severity applies to the readiness score. */
export const FINDING_SEVERITY_WEIGHT: Readonly<Record<FindingSeverity, number>> = {
  CRITICAL: 40,
  MAJOR: 15,
  MINOR: 5,
  OBSERVATION: 1,
};

/** Statuses that mean the finding still needs work. */
export const OPEN_FINDING_STATUSES = [
  "open",
  "in_progress",
  "pending_response",
  "reopened",
] as const;

/** Statuses that mean the finding is settled. */
export const CLOSED_FINDING_STATUSES = ["resolved", "closed", "accepted"] as const;

/** The `VerificationFinding` fields the rollup depends on. */
export type VerificationFindingLike = {
  readonly id: string;
  readonly type: string;
  readonly severity: string;
  readonly title: string;
  readonly description?: string | null;
  readonly recommendation?: string | null;
  readonly response?: string | null;
  readonly status?: string;
  readonly dueDate?: Date | null;
  readonly resolvedAt?: Date | null;
  readonly assignedToId?: string | null;
};

export function normalizeSeverity(severity: string): FindingSeverity {
  const upper = severity.trim().toUpperCase();
  if ((FINDING_SEVERITIES as readonly string[]).includes(upper)) {
    return upper as FindingSeverity;
  }
  // Common synonyms seen in verifier spreadsheets.
  if (upper === "HIGH") return "MAJOR";
  if (upper === "MEDIUM") return "MINOR";
  if (upper === "LOW" || upper === "INFO") return "OBSERVATION";
  throw new CalculationError(`Unknown finding severity: ${severity}`, { severity });
}

export function isOpenFinding(finding: VerificationFindingLike): boolean {
  if (finding.resolvedAt) return false;
  const status = (finding.status ?? "open").trim().toLowerCase();
  if ((CLOSED_FINDING_STATUSES as readonly string[]).includes(status)) return false;
  return (OPEN_FINDING_STATUSES as readonly string[]).includes(status) || status.length > 0;
}

// ---------------------------------------------------------------------------
// Severity rollup
// ---------------------------------------------------------------------------

export type SeverityBucket = {
  readonly severity: FindingSeverity;
  readonly total: number;
  readonly open: number;
  readonly closed: number;
  readonly overdue: number;
};

export type SeverityRollup = {
  readonly bySeverity: readonly SeverityBucket[];
  readonly total: number;
  readonly open: number;
  readonly closed: number;
  readonly overdue: number;
  /** Sum of `FINDING_SEVERITY_WEIGHT` over the open findings. */
  readonly openWeight: number;
  /** Most serious severity with an open finding, or `null`. */
  readonly highestOpenSeverity: FindingSeverity | null;
  readonly closureRate: number;
};

/** Counts findings by severity, splitting open, closed and overdue. */
export function severityRollup(
  findings: readonly VerificationFindingLike[],
  asOf: Date = new Date(Date.UTC(2024, 0, 1)),
): SeverityRollup {
  const buckets = new Map<FindingSeverity, { total: number; open: number; closed: number; overdue: number }>(
    FINDING_SEVERITIES.map((severity) => [severity, { total: 0, open: 0, closed: 0, overdue: 0 }]),
  );

  let openWeight = 0;
  for (const finding of findings) {
    const severity = normalizeSeverity(finding.severity);
    const bucket = buckets.get(severity);
    if (!bucket) continue;
    bucket.total += 1;
    if (isOpenFinding(finding)) {
      bucket.open += 1;
      openWeight += FINDING_SEVERITY_WEIGHT[severity];
      if (finding.dueDate && finding.dueDate.getTime() < asOf.getTime()) bucket.overdue += 1;
    } else {
      bucket.closed += 1;
    }
  }

  const bySeverity: SeverityBucket[] = FINDING_SEVERITIES.map((severity) => {
    const bucket = buckets.get(severity);
    return {
      severity,
      total: bucket?.total ?? 0,
      open: bucket?.open ?? 0,
      closed: bucket?.closed ?? 0,
      overdue: bucket?.overdue ?? 0,
    };
  });

  const total = sum(bySeverity.map((bucket) => bucket.total));
  const open = sum(bySeverity.map((bucket) => bucket.open));
  const closed = sum(bySeverity.map((bucket) => bucket.closed));

  return {
    bySeverity,
    total,
    open,
    closed,
    overdue: sum(bySeverity.map((bucket) => bucket.overdue)),
    openWeight,
    highestOpenSeverity:
      bySeverity.find((bucket) => bucket.open > 0)?.severity ?? null,
    closureRate: safeDivide(closed, total),
  };
}

// ---------------------------------------------------------------------------
// Due-date triage
// ---------------------------------------------------------------------------

export type TriagedFinding = {
  readonly id: string;
  readonly title: string;
  readonly severity: FindingSeverity;
  readonly status: string;
  readonly dueDate: Date | null;
  readonly daysUntilDue: number | null;
  readonly assignedToId: string | null;
};

export type FindingTriage = {
  readonly overdue: readonly TriagedFinding[];
  readonly dueSoon: readonly TriagedFinding[];
  readonly upcoming: readonly TriagedFinding[];
  readonly undated: readonly TriagedFinding[];
  readonly asOf: Date;
  readonly dueSoonDays: number;
  readonly openCount: number;
};

/**
 * Buckets the open findings by due date.
 *
 * Within each bucket the order is by due date and then by severity, so the most
 * urgent and most serious item is always first. Findings with no due date are
 * listed separately rather than being treated as not urgent — an undated
 * critical finding is a governance problem in its own right.
 */
export function openFindingsByDueDate(
  findings: readonly VerificationFindingLike[],
  asOf: Date = new Date(Date.UTC(2024, 0, 1)),
  dueSoonDays = 30,
): FindingTriage {
  if (!Number.isFinite(dueSoonDays) || dueSoonDays < 0) {
    throw new CalculationError("dueSoonDays must be a non-negative number", {
      dueSoonDays,
    });
  }

  const open = findings.filter(isOpenFinding).map<TriagedFinding>((finding) => ({
    id: finding.id,
    title: finding.title,
    severity: normalizeSeverity(finding.severity),
    status: (finding.status ?? "open").toLowerCase(),
    dueDate: finding.dueDate ?? null,
    daysUntilDue:
      finding.dueDate === undefined || finding.dueDate === null
        ? null
        : Math.floor((finding.dueDate.getTime() - asOf.getTime()) / MS_PER_DAY),
    assignedToId: finding.assignedToId ?? null,
  }));

  const bySeverityIndex = (severity: FindingSeverity) =>
    FINDING_SEVERITIES.indexOf(severity);
  const order = (a: TriagedFinding, b: TriagedFinding) =>
    (a.daysUntilDue ?? 0) - (b.daysUntilDue ?? 0) ||
    bySeverityIndex(a.severity) - bySeverityIndex(b.severity) ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

  const undated = open
    .filter((finding) => finding.daysUntilDue === null)
    .sort((a, b) => bySeverityIndex(a.severity) - bySeverityIndex(b.severity));

  return {
    overdue: open.filter((f) => f.daysUntilDue !== null && f.daysUntilDue < 0).sort(order),
    dueSoon: open
      .filter(
        (f) => f.daysUntilDue !== null && f.daysUntilDue >= 0 && f.daysUntilDue <= dueSoonDays,
      )
      .sort(order),
    upcoming: open
      .filter((f) => f.daysUntilDue !== null && f.daysUntilDue > dueSoonDays)
      .sort(order),
    undated,
    asOf,
    dueSoonDays,
    openCount: open.length,
  };
}

// ---------------------------------------------------------------------------
// Readiness
// ---------------------------------------------------------------------------

export const READINESS_DIMENSIONS = [
  "findings",
  "evidence",
  "dataQuality",
  "monitoringCoverage",
  "measurementCompleteness",
] as const;
export type ReadinessDimension = (typeof READINESS_DIMENSIONS)[number];

/** Rubric weights; must sum to 1. */
export const READINESS_WEIGHTS: Readonly<Record<ReadinessDimension, number>> = {
  findings: 0.3,
  evidence: 0.25,
  dataQuality: 0.2,
  monitoringCoverage: 0.15,
  measurementCompleteness: 0.1,
};

export const READINESS_LEVELS = ["READY", "NEARLY_READY", "NOT_READY", "BLOCKED"] as const;
export type ReadinessLevel = (typeof READINESS_LEVELS)[number];

export type VerificationEngagementLike = {
  readonly id?: string;
  readonly name?: string;
  readonly findings: readonly VerificationFindingLike[];
  /** Share of the required evidence that is attached, 0..1. */
  readonly evidenceCompleteness?: number;
  /** Inventory-level data-quality score, 0..100 (see `aggregateQuality`). */
  readonly dataQualityScore?: number;
  /** Share of emission sources covered by a monitoring parameter, 0..1. */
  readonly monitoringCoverage?: number;
  /** Share of expected measurements actually recorded, 0..1. */
  readonly measurementCompleteness?: number;
  readonly asOf?: Date;
};

export type ReadinessScore = {
  readonly score: number;
  readonly level: ReadinessLevel;
  readonly components: Readonly<Record<ReadinessDimension, number>>;
  readonly weights: Readonly<Record<ReadinessDimension, number>>;
  /** Issues that cap the level at BLOCKED regardless of the score. */
  readonly blockers: readonly string[];
  readonly recommendations: readonly string[];
  readonly rollup: SeverityRollup;
  readonly methodology: string;
};

/**
 * Weighted audit-readiness score.
 *
 * Any open CRITICAL finding forces the level to BLOCKED: a critical
 * non-conformity is not something a good score elsewhere can compensate for.
 * Dimensions with no data score a neutral 60 rather than 0, so a missing input
 * does not read as a failure.
 */
export function readinessScore(engagement: VerificationEngagementLike): ReadinessScore {
  const asOf = engagement.asOf ?? new Date(Date.UTC(2024, 0, 1));
  const rollup = severityRollup(engagement.findings, asOf);

  const share = (value: number | undefined, label: string): number => {
    if (value === undefined) return 60;
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      throw new CalculationError(`${label} must be a fraction between 0 and 1`, {
        [label]: value,
      });
    }
    return value * 100;
  };

  const dataQuality = (() => {
    if (engagement.dataQualityScore === undefined) return 60;
    if (
      !Number.isFinite(engagement.dataQualityScore) ||
      engagement.dataQualityScore < 0 ||
      engagement.dataQualityScore > 100
    ) {
      throw new CalculationError("dataQualityScore must be between 0 and 100", {
        dataQualityScore: engagement.dataQualityScore,
      });
    }
    return engagement.dataQualityScore;
  })();

  const components: Record<ReadinessDimension, number> = {
    findings: clamp(100 - rollup.openWeight, 0, 100),
    evidence: share(engagement.evidenceCompleteness, "evidenceCompleteness"),
    dataQuality,
    monitoringCoverage: share(engagement.monitoringCoverage, "monitoringCoverage"),
    measurementCompleteness: share(
      engagement.measurementCompleteness,
      "measurementCompleteness",
    ),
  };

  const score = clamp(
    sum(
      READINESS_DIMENSIONS.map(
        (dimension) => components[dimension] * READINESS_WEIGHTS[dimension],
      ),
    ),
    0,
    100,
  );

  const blockers: string[] = [];
  const criticalOpen = rollup.bySeverity.find((bucket) => bucket.severity === "CRITICAL");
  if ((criticalOpen?.open ?? 0) > 0) {
    blockers.push(
      `${criticalOpen?.open} open CRITICAL finding(s) must be closed before the engagement can conclude.`,
    );
  }
  if (rollup.overdue > 0) {
    blockers.push(`${rollup.overdue} finding(s) are past their due date.`);
  }
  if ((engagement.evidenceCompleteness ?? 1) < 0.5) {
    blockers.push("Less than half of the required evidence is attached.");
  }

  const recommendations: string[] = [];
  for (const dimension of READINESS_DIMENSIONS) {
    if (components[dimension] < 70) {
      recommendations.push(
        `Improve ${dimension} (currently ${roundTo(components[dimension], 1)} / 100, weight ${READINESS_WEIGHTS[dimension] * 100} %).`,
      );
    }
  }
  if (recommendations.length === 0) {
    recommendations.push("All readiness dimensions are at or above 70; the engagement can proceed.");
  }

  const level: ReadinessLevel =
    blockers.length > 0 && (criticalOpen?.open ?? 0) > 0
      ? "BLOCKED"
      : score >= 85
        ? "READY"
        : score >= 70
          ? "NEARLY_READY"
          : score >= 50
            ? "NOT_READY"
            : "BLOCKED";

  return {
    score,
    level,
    components,
    weights: READINESS_WEIGHTS,
    blockers,
    recommendations,
    rollup,
    methodology:
      "CIOS verification-readiness rubric v1: findings 30 %, evidence 25 %, data quality 20 %, monitoring coverage 15 %, measurement completeness 10 %; any open CRITICAL finding forces BLOCKED",
  };
}
