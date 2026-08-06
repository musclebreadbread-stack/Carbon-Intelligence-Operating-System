"use server";

/**
 * Third-party-verification and MRV actions.
 *
 * The assurance opinion is *derived*, never typed in: `assessMaterialityAction`
 * runs the misstatement aggregate over the engagement's own findings and writes
 * the resulting `opinionType` back onto the engagement. A verifier who wants a
 * different opinion has to change the findings, which is exactly the discipline
 * ISO 14064-3 expects.
 */

import { NotFoundError } from "@/lib/core/errors";
import { buildEvidencePackage } from "@/lib/domain/mrv/plan";
import {
  aggregateMisstatements,
  type MisstatementLike,
} from "@/lib/domain/verification/materiality";
import { readinessScore, severityRollup } from "@/lib/domain/verification/findings";
import { listReportingYears } from "@/lib/data/repositories/activity-data";
import { getInventory } from "@/lib/data/repositories/calculation";
import { getMrvCoverage } from "@/lib/data/repositories/mrv";
import {
  computeDataQualityScore,
  computeEvidenceCompleteness,
} from "@/lib/data/repositories/verification";
import { prisma } from "@/lib/prisma";
import { getObjectStorageClient } from "@/lib/storage/factory";
import {
  evidencePackageInputSchema,
  materialityAssessmentInputSchema,
  verificationEngagementInputSchema,
  verificationFindingInputSchema,
} from "@/lib/validation";

import { auditEntry, runAction } from "./runtime";
import type { ActionState } from "./types";

const PATHS = ["/third-party-verification", "/digital-mrv", "/dashboard"] as const;

/** Opens a verification engagement. */
export async function createVerificationEngagementAction(
  rawInput: unknown,
): Promise<ActionState<{ readonly id: string }>> {
  return runAction(
    {
      name: "createVerificationEngagement",
      resource: "verification",
      action: "create",
      schema: verificationEngagementInputSchema,
      revalidate: [...PATHS],
      handler: async ({ session, input, organizationId }) => {
        const created = await prisma.verificationEngagement.create({
          data: {
            organizationId,
            name: input.name,
            verifierName: input.verifierName ?? null,
            verifierOrg: input.verifierOrg ?? null,
            framework: input.framework ?? null,
            scope: input.scope ?? null,
            level: input.level ?? null,
            status: input.status,
            startDate: input.startDate ?? null,
            endDate: input.endDate ?? null,
            opinionType: input.opinionType ?? null,
          },
          select: { id: true },
        });
        return {
          data: { id: created.id },
          message: `Opened engagement "${input.name}".`,
          messageKey: "action.success.createVerificationEngagement",
          audit: [
            auditEntry(session, {
              entityType: "VerificationEngagement",
              entityId: created.id,
              action: "create",
              after: {
                name: input.name,
                verifierOrg: input.verifierOrg ?? null,
                level: input.level ?? null,
                status: input.status,
              },
            }),
          ],
        };
      },
    },
    rawInput,
  );
}

export type FindingResult = {
  readonly id: string;
  readonly openCritical: number;
  readonly openMajor: number;
  /** Sum of the severity weights over the open findings. */
  readonly openWeight: number;
};

/** Raises or updates a finding and reports the engagement's severity rollup. */
export async function recordFindingAction(
  rawInput: unknown,
): Promise<ActionState<FindingResult>> {
  return runAction(
    {
      name: "recordFinding",
      resource: "verification",
      action: "update",
      schema: verificationFindingInputSchema,
      revalidate: [...PATHS],
      handler: async ({ session, input, organizationId }) => {
        const engagement = await prisma.verificationEngagement.findUnique({
          where: { id: input.engagementId },
          select: { id: true, organizationId: true },
        });
        if (!engagement || engagement.organizationId !== organizationId) {
          throw new NotFoundError(`Engagement ${input.engagementId} was not found`);
        }

        const created = await prisma.verificationFinding.create({
          data: {
            engagementId: engagement.id,
            type: input.type,
            severity: input.severity,
            title: input.title,
            description: input.description ?? null,
            recommendation: input.recommendation ?? null,
            response: input.response ?? null,
            status: input.status,
            dueDate: input.dueDate ?? null,
            resolvedAt: input.resolvedAt ?? null,
            assignedToId: input.assignedToId ?? null,
            misstatementAmount: input.misstatementAmount ?? null,
            estimatedFinancialImpact: input.estimatedFinancialImpact ?? null,
            impactCurrency: input.impactCurrency ?? null,
          },
          select: { id: true },
        });

        const findings = await prisma.verificationFinding.findMany({
          where: { engagementId: engagement.id },
          select: {
            id: true,
            type: true,
            title: true,
            severity: true,
            status: true,
            dueDate: true,
            resolvedAt: true,
          },
        });
        const rollup = severityRollup(findings);

        return {
          data: {
            id: created.id,
            openCritical:
              rollup.bySeverity.find((bucket) => bucket.severity === "CRITICAL")?.open ?? 0,
            openMajor:
              rollup.bySeverity.find((bucket) => bucket.severity === "MAJOR")?.open ?? 0,
            openWeight: rollup.openWeight,
          },
          message: `Recorded a ${input.severity} finding: "${input.title}".`,
          messageKey: "action.success.recordFinding",
          audit: [
            auditEntry(session, {
              entityType: "VerificationFinding",
              entityId: created.id,
              action: "create",
              after: {
                type: input.type,
                severity: input.severity,
                title: input.title,
                status: input.status,
                misstatementAmount: input.misstatementAmount ?? null,
              },
            }),
          ],
        };
      },
    },
    rawInput,
  );
}

export type MaterialityResult = {
  readonly engagementId: string;
  readonly threshold: number;
  readonly thresholdQuantity: number;
  readonly netMisstatement: number;
  readonly uncorrectedMisstatement: number;
  readonly isMaterial: boolean;
  readonly isPervasive: boolean;
  readonly opinionType: string;
  readonly rationale: readonly string[];
  readonly unit: string;
};

/**
 * Aggregates the engagement's quantified findings and forms the opinion.
 *
 * The verified total comes from the computed inventory rather than the payload, so
 * the materiality threshold is always a percentage of a number the system can
 * itself reproduce.
 */
export async function assessMaterialityAction(
  rawInput: unknown,
): Promise<ActionState<MaterialityResult>> {
  return runAction(
    {
      name: "assessMateriality",
      resource: "verification",
      action: "approve",
      schema: materialityAssessmentInputSchema,
      revalidate: [...PATHS],
      handler: async ({ session, input, organizationId }) => {
        const engagement = await prisma.verificationEngagement.findUnique({
          where: { id: input.engagementId },
          select: { id: true, organizationId: true, level: true },
        });
        if (!engagement || engagement.organizationId !== organizationId) {
          throw new NotFoundError(`Engagement ${input.engagementId} was not found`);
        }

        const findings = await prisma.verificationFinding.findMany({
          where: { engagementId: engagement.id },
          select: {
            id: true,
            title: true,
            type: true,
            status: true,
            misstatementAmount: true,
          },
        });

        const misstatements: readonly MisstatementLike[] = findings.flatMap(
          (finding): MisstatementLike[] => {
            const deviation = finding.misstatementAmount;
            if (deviation === null) return [];
            return [
              {
                id: finding.id,
                title: finding.title,
                deviation,
                area: finding.type,
                // A finding the reporter has already corrected is excluded from
                // the uncorrected aggregate that drives the opinion.
                isCorrected: ["resolved", "closed"].includes(finding.status),
              },
            ];
          },
        );

        // The verified total is the server's own computed inventory for the
        // organisation's current reporting year — the same figure the
        // verification page displays — never a value the client asserts.
        const years = await listReportingYears(organizationId);
        const reportingYear = years[0] ?? new Date().getUTCFullYear();
        const inventory = await getInventory(organizationId, reportingYear);

        const aggregate = aggregateMisstatements(
          misstatements,
          inventory.totals.totalEmissions,
          {
            assuranceLevel: input.assuranceLevel,
            ...(input.threshold !== undefined
              ? { threshold: input.threshold / 100 }
              : {}),
          },
        );

        await prisma.verificationEngagement.update({
          where: { id: engagement.id },
          data: { opinionType: aggregate.opinionType, level: input.assuranceLevel },
        });

        return {
          data: {
            engagementId: engagement.id,
            threshold: aggregate.threshold,
            thresholdQuantity: aggregate.thresholdQuantity,
            netMisstatement: aggregate.netMisstatement,
            uncorrectedMisstatement: aggregate.uncorrectedMisstatement,
            isMaterial: aggregate.isMaterial,
            isPervasive: aggregate.isPervasive,
            opinionType: aggregate.opinionType,
            rationale: aggregate.rationale,
            unit: aggregate.unit,
          },
          message: `Opinion: ${aggregate.opinionType} (${misstatements.length} quantified misstatement(s), threshold ${aggregate.thresholdQuantity.toFixed(1)} ${aggregate.unit}).`,
          messageKey: "action.success.assessMateriality",
          audit: [
            auditEntry(session, {
              entityType: "VerificationEngagement",
              entityId: engagement.id,
              action: "update",
              after: {
                opinionType: aggregate.opinionType,
                assuranceLevel: input.assuranceLevel,
                isMaterial: aggregate.isMaterial,
                netMisstatement: aggregate.netMisstatement,
              },
              reason: aggregate.rationale.join("; "),
            }),
          ],
        };
      },
    },
    rawInput,
  );
}

export type EvidencePackageResult = {
  readonly id: string;
  readonly hash: string;
  readonly fileCount: number;
  readonly totalSize: number | null;
  readonly itemHashes: readonly { readonly name: string; readonly hash: string }[];
};

/**
 * Hashes and submits an evidence package.
 *
 * Every item's digest is stored as an `AuditEvidence` row and the package-level
 * digest on `EvidencePackage`, so a verifier can prove a single file has not
 * changed without re-downloading the whole package.
 */
export async function submitEvidencePackageAction(
  rawInput: unknown,
): Promise<ActionState<EvidencePackageResult>> {
  return runAction(
    {
      name: "submitEvidencePackage",
      resource: "verification",
      action: "create",
      schema: evidencePackageInputSchema,
      revalidate: [...PATHS],
      handler: async ({ session, input, organizationId }) => {
        const engagement = await prisma.verificationEngagement.findUnique({
          where: { id: input.engagementId },
          select: { id: true, organizationId: true },
        });
        if (!engagement || engagement.organizationId !== organizationId) {
          throw new NotFoundError(`Engagement ${input.engagementId} was not found`);
        }

        const submittedAt = new Date();
        const storage = getObjectStorageClient();

        // Items with real content are uploaded and hashed from the actual bytes
        // in object storage. Items with only a `fileUrl` are a pointer this
        // codebase has no way to fetch and verify yet, so — unlike before —
        // they are hashed from a clearly-labelled reference string rather than
        // silently treated as if the bytes had been verified.
        const uploads = await Promise.all(
          input.items.map(async (item, index) => {
            if (item.content == null) return null;
            const key = `verification/${engagement.id}/${submittedAt.getTime()}-${index}`;
            const result = await storage.put(key, new TextEncoder().encode(item.content));
            return { index, key, result };
          }),
        );
        const uploadByIndex = new Map(
          uploads.filter((row) => row !== null).map((row) => [row.index, row]),
        );

        const packaged = buildEvidencePackage(
          input.items.map((item, index) => {
            const uploaded = uploadByIndex.get(index);
            return {
              id: `${index}`,
              name: item.title,
              // A pre-computed hash from real storage bytes short-circuits
              // hashEvidenceManifest's own hashing; a reference-only item is
              // labelled as such rather than pretending its URL is content.
              ...(uploaded
                ? { hash: uploaded.result.hash }
                : { content: `unfetched-reference:${item.fileUrl ?? item.title}` }),
              fileSize: item.fileSize ?? uploaded?.result.size ?? null,
            };
          }),
          {
            name: input.name,
            ...(input.description ? { description: input.description } : {}),
            ...(input.type ? { type: input.type } : {}),
            status: input.status,
            submittedAt,
          },
        );

        const created = await prisma.$transaction(async (tx) => {
          const pkg = await tx.evidencePackage.create({
            data: {
              engagementId: engagement.id,
              name: packaged.name,
              description: packaged.description,
              type: packaged.type,
              fileCount: packaged.fileCount,
              totalSize: packaged.totalSize,
              hash: packaged.hash,
              status: packaged.status,
              submittedAt: packaged.submittedAt,
            },
            select: { id: true },
          });

          await tx.auditEvidence.createMany({
            data: packaged.manifest.items.map((item, index) => {
              const uploaded = uploadByIndex.get(index);
              return {
                type: input.items[index]?.type ?? "document",
                title: item.name,
                description: `Item of evidence package ${pkg.id}`,
                fileUrl: input.items[index]?.fileUrl ?? null,
                fileType: input.items[index]?.fileType ?? null,
                fileSize: item.fileSize,
                hash: item.hash,
                storageKey: uploaded?.key ?? null,
                storageProvider: uploaded ? storage.provider : null,
              };
            }),
          });

          return pkg.id;
        });

        return {
          data: {
            id: created,
            hash: packaged.hash,
            fileCount: packaged.fileCount,
            totalSize: packaged.totalSize,
            itemHashes: packaged.manifest.items.map((item) => ({
              name: item.name,
              hash: item.hash,
            })),
          },
          message: `Submitted ${packaged.fileCount} item(s); package hash ${packaged.hash.slice(0, 12)}…`,
          messageKey: "action.success.submitEvidencePackage",
          audit: [
            auditEntry(session, {
              entityType: "EvidencePackage",
              entityId: created,
              action: "create",
              after: {
                name: packaged.name,
                fileCount: packaged.fileCount,
                hash: packaged.hash,
                status: packaged.status,
              },
            }),
          ],
        };
      },
    },
    rawInput,
  );
}

export type ReadinessResult = {
  readonly score: number;
  readonly level: string;
  readonly dimensions: Readonly<Record<string, number>>;
};

/**
 * Reports the engagement's assurance readiness.
 *
 * Read-only, so the readiness dial still works with no database configured.
 */
export async function scoreVerificationReadinessAction(
  rawInput: unknown,
): Promise<ActionState<ReadinessResult>> {
  return runAction(
    {
      name: "scoreVerificationReadiness",
      resource: "verification",
      action: "read",
      schema: materialityAssessmentInputSchema,
      readOnly: true,
      handler: async ({ input, organizationId }) => {
        // Same reporting-year resolution as `assessMaterialityAction`, and the
        // same `readinessScore()` inputs `getVerificationView` uses, so this
        // action and the engagement dashboard can never disagree about readiness.
        const years = await listReportingYears(organizationId);
        const reportingYear = years[0] ?? new Date().getUTCFullYear();

        const [inventory, coverage, evidenceCompleteness, dataQualityScore, findings] =
          await Promise.all([
            getInventory(organizationId, reportingYear),
            getMrvCoverage(organizationId, { reportingYear }),
            computeEvidenceCompleteness(input.engagementId),
            computeDataQualityScore(organizationId, reportingYear),
            prisma.verificationFinding.findMany({
              where: {
                engagementId: input.engagementId,
                engagement: { organizationId },
              },
              select: {
                id: true,
                type: true,
                title: true,
                severity: true,
                status: true,
                dueDate: true,
                resolvedAt: true,
              },
            }),
          ]);
        const readiness = readinessScore({
          id: input.engagementId,
          name: input.engagementId,
          findings,
          evidenceCompleteness,
          dataQualityScore,
          monitoringCoverage: coverage.coverage?.coverage,
          measurementCompleteness: coverage.completeness?.completeness,
        });

        return {
          data: {
            score: readiness.score,
            level: readiness.level,
            dimensions: {
              ...readiness.components,
              openFindings: readiness.rollup.open,
              closedFindings: readiness.rollup.closed,
              overdueFindings: readiness.rollup.overdue,
              verifiedEmissions: inventory.consolidated.totalEmissions,
            },
          },
          message: `Readiness ${readiness.score.toFixed(0)}/100 (${readiness.level}): ${readiness.rollup.open} open finding(s), ${readiness.rollup.overdue} overdue.`,
          messageKey: "action.success.scoreVerificationReadiness",
        };
      },
    },
    rawInput,
  );
}
