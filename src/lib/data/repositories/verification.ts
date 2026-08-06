/**
 * Third-party verification repository.
 *
 * Severity rollups, materiality opinions and the readiness score are computed from
 * the finding rows and the MRV coverage — the `opinionType` column is only ever a
 * record of what the verifier signed, never the source of the displayed opinion.
 */

import { aggregateMisstatements, MATERIALITY_THRESHOLDS } from "@/lib/domain/verification/materiality";
import {
  openFindingsByDueDate,
  readinessScore,
  severityRollup,
  type VerificationFindingLike,
} from "@/lib/domain/verification/findings";
import { buildEvidencePackage } from "@/lib/domain/mrv/plan";
import { prisma } from "@/lib/prisma";

import { withDb } from "../db";
import {
  DEMO_CURRENT_YEAR,
  DEMO_EVIDENCE_ITEMS,
  DEMO_VERIFICATION_ENGAGEMENT,
  DEMO_VERIFICATION_FINDINGS,
  DEMO_VERIFICATION_SCOPES,
  type DemoVerificationEngagement,
  type DemoVerificationScope,
} from "../demo";

import { getInventory } from "./calculation";
import { getMrvCoverage } from "./mrv";

/**
 * Fraction of the engagement's submitted evidence packages that have been
 * accepted. A package still `pending`/`submitted` counts as incomplete, and so
 * does one that was `rejected` — it must be resubmitted before it counts.
 */
export async function computeEvidenceCompleteness(engagementId: string): Promise<number> {
  return withDb(
    async () => {
      const packages = await prisma.evidencePackage.findMany({
        where: { engagementId },
        select: { status: true },
      });
      if (packages.length === 0) return 0;
      const accepted = packages.filter((row) => row.status === "accepted").length;
      return accepted / packages.length;
    },
    // Demo fixture: no packages exist to measure, so this is a stated placeholder
    // value rather than an average of real rows — matches readinessScore()'s own
    // 60-point default for an unset dimension being too pessimistic for a demo.
    () => 0.86,
  );
}

/** Average `DataQualityScore.overallScore` (0..100) across the organisation's activity data for the year. */
export async function computeDataQualityScore(
  organizationId: string,
  reportingYear: number,
): Promise<number> {
  return withDb(
    async () => {
      const result = await prisma.dataQualityScore.aggregate({
        where: { activityDataEntry: { activityData: { organizationId, reportingYear } } },
        _avg: { overallScore: true },
      });
      return result._avg.overallScore ?? 60;
    },
    () => 82,
  );
}

export type FindingRow = VerificationFindingLike & {
  readonly engagementId: string;
  readonly misstatementAmount: number | null;
  /** Informational only — not fed into materiality math. */
  readonly estimatedFinancialImpact: number | null;
  readonly impactCurrency: string | null;
};

export async function listVerificationEngagements(
  organizationId: string,
): Promise<readonly DemoVerificationEngagement[]> {
  return withDb<readonly DemoVerificationEngagement[]>(
    async () => {
      const rows = await prisma.verificationEngagement.findMany({
        where: { organizationId },
        orderBy: { startDate: "desc" },
      });
      return rows.map((row) => ({
        id: row.id,
        organizationId: row.organizationId,
        name: row.name,
        verifierName: row.verifierName ?? "",
        verifierOrg: row.verifierOrg ?? "",
        framework: row.framework ?? "GHG_PROTOCOL",
        scope: row.scope ?? "",
        level: row.level === "REASONABLE" ? "REASONABLE" : "LIMITED",
        status: row.status,
        startDate: row.startDate ?? row.createdAt,
        endDate: row.endDate ?? row.createdAt,
        opinionType: null,
      }));
    },
    () =>
      DEMO_VERIFICATION_ENGAGEMENT.organizationId === organizationId
        ? [DEMO_VERIFICATION_ENGAGEMENT]
        : [],
  );
}

export async function listVerificationScopes(
  engagementId: string,
): Promise<readonly DemoVerificationScope[]> {
  return withDb<readonly DemoVerificationScope[]>(
    async () => {
      const rows = await prisma.verificationScope.findMany({
        where: { engagementId },
        orderBy: { category: "asc" },
      });
      return rows.map((row) => ({
        id: row.id,
        engagementId: row.engagementId,
        category: row.category,
        description: row.description ?? "",
        boundaries: row.boundaries ?? "",
        materialityThreshold: row.materialityThreshold ?? MATERIALITY_THRESHOLDS.LIMITED,
        status: row.status,
      }));
    },
    () => DEMO_VERIFICATION_SCOPES.filter((scope) => scope.engagementId === engagementId),
  );
}

export async function listFindings(engagementId: string): Promise<readonly FindingRow[]> {
  return withDb<readonly FindingRow[]>(
    async () => {
      const rows = await prisma.verificationFinding.findMany({
        where: { engagementId },
        orderBy: [{ severity: "asc" }, { dueDate: "asc" }],
      });
      return rows.map((row) => ({
        id: row.id,
        engagementId: row.engagementId,
        type: row.type,
        severity: row.severity,
        title: row.title,
        description: row.description,
        recommendation: row.recommendation,
        response: row.response,
        status: row.status,
        dueDate: row.dueDate,
        resolvedAt: row.resolvedAt,
        assignedToId: row.assignedToId,
        misstatementAmount: row.misstatementAmount,
        estimatedFinancialImpact: row.estimatedFinancialImpact,
        impactCurrency: row.impactCurrency,
      }));
    },
    () => DEMO_VERIFICATION_FINDINGS.filter((finding) => finding.engagementId === engagementId),
  );
}

/** Engagement dashboard: rollup, triage, materiality opinion and readiness. */
export async function getVerificationView(
  organizationId: string,
  options: { readonly engagementId?: string; readonly asOf?: Date } = {},
) {
  const engagements = await listVerificationEngagements(organizationId);
  const engagement = options.engagementId
    ? engagements.find((row) => row.id === options.engagementId)
    : engagements[0];
  if (!engagement) return null;

  const asOf = options.asOf ?? new Date(Date.UTC(DEMO_CURRENT_YEAR + 1, 1, 15));
  const [scopes, findings, inventory, coverage, evidenceCompleteness, dataQualityScore] =
    await Promise.all([
      listVerificationScopes(engagement.id),
      listFindings(engagement.id),
      getInventory(organizationId, DEMO_CURRENT_YEAR),
      getMrvCoverage(organizationId),
      computeEvidenceCompleteness(engagement.id),
      computeDataQualityScore(organizationId, DEMO_CURRENT_YEAR),
    ]);

  const rollup = severityRollup(findings, asOf);
  const misstatements = aggregateMisstatements(
    findings
      .filter((finding) => finding.misstatementAmount !== null)
      .map((finding) => ({
        id: finding.id,
        title: finding.title,
        deviation: finding.misstatementAmount as number,
        area: finding.type,
        isCorrected: finding.status === "resolved" || finding.status === "closed",
      })),
    inventory.totals.totalEmissions,
    { assuranceLevel: engagement.level },
  );

  return {
    engagement,
    scopes,
    findings,
    rollup,
    triage: openFindingsByDueDate(findings, asOf),
    misstatements,
    readiness: readinessScore({
      id: engagement.id,
      name: engagement.name,
      findings,
      evidenceCompleteness,
      dataQualityScore,
      monitoringCoverage: coverage.coverage?.coverage,
      measurementCompleteness: coverage.completeness?.completeness,
      asOf,
    }),
  };
}

/** Evidence package with per-file digests, ready to persist. */
export async function getEvidencePackage(
  organizationId: string,
  options: { readonly engagementId?: string } = {},
) {
  const engagements = await listVerificationEngagements(organizationId);
  const engagement = options.engagementId
    ? engagements.find((row) => row.id === options.engagementId)
    : engagements[0];
  if (!engagement) return null;

  return buildEvidencePackage(
    DEMO_EVIDENCE_ITEMS.map((item) => ({
      id: item.id,
      name: item.title,
      content: item.content,
      fileSize: item.fileSize,
    })),
    {
      name: `${engagement.name} 증빙 패키지 (evidence package)`,
      description: "Evidence supporting the reported inventory, with SHA-256 digests.",
      type: "ASSURANCE",
    },
  );
}
