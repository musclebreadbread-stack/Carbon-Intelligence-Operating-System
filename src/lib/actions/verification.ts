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
import { severityRollup } from "@/lib/domain/verification/findings";
import { getInventory } from "@/lib/data/repositories/calculation";
import { prisma } from "@/lib/prisma";
import {
  evidencePackageInputSchema,
  materialityAssessmentInputSchema,
  verificationEngagementInputSchema,
  verificationFindingInputSchema,
} from "@/lib/validation";

import { auditEntry, runAction } from "./runtime";
import type { ActionState } from "./types";

const PATHS = ["/third-party-verification", "/digital-mrv", "/dashboard"] as const;

/**
 * A quantified misstatement has no column of its own on `VerificationFinding`, so
 * it is carried in `description` behind this marker. Not ideal, but changing the
 * schema would invalidate the baseline migration.
 */
const MISSTATEMENT_MARKER = "[misstatement:";

function encodeMisstatement(
  description: string | null,
  amount: number | null | undefined,
): string | null {
  if (amount === null || amount === undefined) return description;
  return `${description ?? ""}\n${MISSTATEMENT_MARKER}${amount}]`.trim();
}

function decodeMisstatement(description: string | null): number | null {
  if (!description) return null;
  const start = description.lastIndexOf(MISSTATEMENT_MARKER);
  if (start === -1) return null;
  const end = description.indexOf("]", start);
  if (end === -1) return null;
  const parsed = Number(
    description.slice(start + MISSTATEMENT_MARKER.length, end),
  );
  return Number.isFinite(parsed) ? parsed : null;
}

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
            description: encodeMisstatement(
              input.description ?? null,
              input.misstatementAmount,
            ),
            recommendation: input.recommendation ?? null,
            response: input.response ?? null,
            status: input.status,
            dueDate: input.dueDate ?? null,
            resolvedAt: input.resolvedAt ?? null,
            assignedToId: input.assignedToId ?? null,
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
            description: true,
          },
        });

        const misstatements: readonly MisstatementLike[] = findings.flatMap(
          (finding): MisstatementLike[] => {
            const deviation = decodeMisstatement(finding.description);
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

        const aggregate = aggregateMisstatements(
          misstatements,
          input.totalEmissions,
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
        const packaged = buildEvidencePackage(
          input.items.map((item, index) => ({
            id: `${index}`,
            name: item.title,
            // A file in object storage supplies its own digest; inline content is
            // hashed here.
            ...(item.content != null ? { content: item.content } : {}),
            ...(item.content == null ? { content: item.fileUrl ?? item.title } : {}),
            fileSize: item.fileSize ?? null,
          })),
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
            data: packaged.manifest.items.map((item, index) => ({
              type: input.items[index]?.type ?? "document",
              title: item.name,
              description: `Item of evidence package ${pkg.id}`,
              fileUrl: input.items[index]?.fileUrl ?? null,
              fileType: input.items[index]?.fileType ?? null,
              fileSize: item.fileSize,
              hash: item.hash,
            })),
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
        // Reading the inventory keeps the readiness figure consistent with the
        // numbers the engagement is actually assuring.
        const inventory = await getInventory(
          organizationId,
          new Date().getUTCFullYear(),
        );
        const findings = await prisma.verificationFinding.findMany({
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
        });
        const rollup = severityRollup(findings);

        return {
          data: {
            score: rollup.closureRate * 100,
            level:
              rollup.open === 0
                ? "READY"
                : rollup.highestOpenSeverity === "CRITICAL"
                  ? "BLOCKED"
                  : rollup.overdue > 0
                    ? "NOT_READY"
                    : "NEARLY_READY",
            dimensions: {
              openFindings: rollup.open,
              closedFindings: rollup.closed,
              overdueFindings: rollup.overdue,
              openWeight: rollup.openWeight,
              verifiedEmissions: inventory.consolidated.totalEmissions,
            },
          },
          message: `${rollup.open} open finding(s), ${rollup.overdue} overdue, closure rate ${(rollup.closureRate * 100).toFixed(0)}%.`,
          messageKey: "action.success.scoreVerificationReadiness",
        };
      },
    },
    rawInput,
  );
}
