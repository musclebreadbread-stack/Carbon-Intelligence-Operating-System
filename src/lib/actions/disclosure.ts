"use server";

/**
 * ESG-disclosure actions.
 *
 * `generateDisclosureReportAction` auto-populates every requirement the inventory
 * can answer and leaves the narrative ones for a person. The two are distinguished
 * in the stored response (`isAutoPopulated` is recorded in `notes`), because a
 * verifier needs to know which numbers came from the ledger and which from a
 * drafter — and because an auto-populated response must be safe to overwrite on a
 * re-run while an authored one must not be.
 */

import { NotFoundError } from "@/lib/core/errors";
import {
  assembleReport,
  completeness,
  mapInventoryToRequirements,
} from "@/lib/domain/disclosure/map";
import { requirementsFor } from "@/lib/domain/disclosure/requirements";
import { getInventory } from "@/lib/data/repositories/calculation";
import { getCreditPortfolio } from "@/lib/data/repositories/credits";
import { prisma } from "@/lib/prisma";
import {
  disclosureReportInputSchema,
  disclosureResponseInputSchema,
  generateDisclosureReportSchema,
} from "@/lib/validation";

import { assertPeriodNotLocked } from "./inventory-close";
import { auditEntry, runAction } from "./runtime";
import type { ActionState } from "./types";

const PATHS = ["/esg-disclosure", "/dashboard"] as const;

/** Marker written into `notes` so a re-run can tell its own rows apart. */
const AUTO_MARKER = "[auto-populated from inventory]";

export type GenerateReportResult = {
  readonly reportId: string;
  readonly framework: string;
  readonly reportingYear: number;
  readonly requirementCount: number;
  readonly autoPopulated: number;
  readonly narrativeRequired: number;
  readonly unavailable: readonly string[];
  readonly mandatoryPercent: number;
  readonly percent: number;
  readonly isComplete: boolean;
  readonly status: string;
};

/**
 * Builds (or refreshes) a framework report from the computed inventory.
 *
 * Idempotent: the report row is upserted on organisation + framework + year, and
 * each auto-populated response is upserted on its requirement. Responses a person
 * authored are left untouched — the marker in `notes` is what makes that decidable.
 */
export async function generateDisclosureReportAction(
  rawInput: unknown,
): Promise<ActionState<GenerateReportResult>> {
  return runAction(
    {
      name: "generateDisclosureReport",
      resource: "disclosure",
      action: "create",
      schema: generateDisclosureReportSchema,
      revalidate: [...PATHS],
      attributes: (input) => ({
        reportingYear: input.reportingYear,
        framework: input.framework,
      }),
      handler: async ({ session, input, organizationId }) => {
        // Block report generation on a locked period.
        await assertPeriodNotLocked(organizationId, input.reportingYear);

        const [inventoryView, portfolio] = await Promise.all([
          getInventory(organizationId, input.reportingYear),
          getCreditPortfolio(organizationId),
        ]);

        const retiredCredits = portfolio.offsets
          .filter(
            (offset) =>
              offset.reportingYear === null ||
              offset.reportingYear === undefined ||
              offset.reportingYear === input.reportingYear,
          )
          .reduce((total, offset) => total + offset.quantity, 0);

        const context = {
          inventory: inventoryView.consolidated,
          reportingYear: input.reportingYear,
          retiredCredits,
          ...(input.revenue != null ? { revenue: input.revenue } : {}),
          ...(input.revenueUnit != null ? { revenueUnit: input.revenueUnit } : {}),
          ...(input.energyConsumption != null
            ? { energyConsumption: input.energyConsumption }
            : {}),
          ...(input.renewableShare != null
            ? { renewableShare: input.renewableShare }
            : {}),
          ...(input.internalCarbonPrice != null
            ? { internalCarbonPrice: input.internalCarbonPrice }
            : {}),
          ...(input.baseYear != null ? { baseYear: input.baseYear } : {}),
          ...(input.baseYearEmissions != null
            ? { baseYearEmissions: input.baseYearEmissions }
            : {}),
        };

        const mapping = mapInventoryToRequirements(context, input.framework);
        const requirements = requirementsFor(input.framework);

        const persisted = await prisma.$transaction(async (tx) => {
          const existingReport = await tx.disclosureReport.findFirst({
            where: {
              organizationId,
              framework: input.framework,
              reportingYear: input.reportingYear,
            },
            select: { id: true },
          });

          const reportId =
            existingReport?.id ??
            (
              await tx.disclosureReport.create({
                data: {
                  organizationId,
                  name: `${input.framework} ${input.reportingYear}`,
                  framework: input.framework,
                  reportingYear: input.reportingYear,
                  status: "IN_PROGRESS",
                },
                select: { id: true },
              })
            ).id;

          // The catalogue rows must exist before responses can reference them.
          // They are seeded by item 32, but a report generated against a database
          // that predates a catalogue addition should still work.
          const requirementRows = await tx.disclosureRequirement.findMany({
            where: {
              code: { in: requirements.map((requirement) => requirement.code) },
              framework: { code: input.framework },
            },
            select: { id: true, code: true },
          });
          const requirementIdByCode = new Map(
            requirementRows.map((row) => [row.code, row.id]),
          );

          const existingResponses = await tx.disclosureResponse.findMany({
            where: { reportId },
            select: { id: true, requirementId: true, notes: true },
          });
          const existingByRequirementId = new Map(
            existingResponses.map((row) => [row.requirementId, row]),
          );

          let written = 0;
          const skippedCodes: string[] = [];
          for (const response of mapping.responses) {
            const requirementId = requirementIdByCode.get(response.requirementCode);
            if (!requirementId) {
              skippedCodes.push(response.requirementCode);
              continue;
            }
            const existing = existingByRequirementId.get(requirementId);
            const isAuthored =
              existing !== undefined && !(existing.notes ?? "").includes(AUTO_MARKER);
            if (isAuthored) continue;
            if (!response.isAutoPopulated) continue;

            const notes = [response.notes, AUTO_MARKER]
              .filter((part): part is string => Boolean(part))
              .join(" ");
            if (existing) {
              await tx.disclosureResponse.update({
                where: { id: existing.id },
                data: {
                  value: response.value,
                  numericValue: response.numericValue,
                  status: response.status,
                  notes,
                },
              });
            } else {
              await tx.disclosureResponse.create({
                data: {
                  reportId,
                  requirementId,
                  value: response.value,
                  numericValue: response.numericValue,
                  status: response.status,
                  notes,
                },
              });
            }
            written += 1;
          }

          // Completeness is scored from what is actually stored, not from the
          // mapping: an authored response that was preserved must count.
          const storedResponses = await tx.disclosureResponse.findMany({
            where: { reportId },
            select: {
              value: true,
              numericValue: true,
              status: true,
              requirement: { select: { code: true } },
            },
          });
          const report = assembleReport(
            input.framework,
            storedResponses.map((row) => ({
              requirementCode: row.requirement.code,
              value: row.value,
              numericValue: row.numericValue,
              status: row.status,
            })),
            context,
          );

          await tx.disclosureReport.update({
            where: { id: reportId },
            data: { status: report.status },
          });
          await tx.reportGeneration.upsert({
            where: { reportId },
            create: {
              reportId,
              status: "completed",
              format: input.format,
              templateUsed: `${input.framework} auto-mapping`,
              generatedAt: new Date(),
            },
            update: {
              status: "completed",
              format: input.format,
              templateUsed: `${input.framework} auto-mapping`,
              generatedAt: new Date(),
              errorMessage: null,
            },
          });

          return { reportId, written, skippedCodes, report };
        });

        const scored = persisted.report.completeness;

        return {
          data: {
            reportId: persisted.reportId,
            framework: input.framework,
            reportingYear: input.reportingYear,
            requirementCount: requirements.length,
            autoPopulated: persisted.written,
            narrativeRequired: mapping.narrativeCodes.length,
            unavailable: [
              ...mapping.unavailableCodes,
              ...persisted.skippedCodes.map((code) => `${code} (not catalogued)`),
            ],
            mandatoryPercent: scored.mandatoryPercent,
            percent: scored.percent,
            isComplete: scored.isComplete,
            status: persisted.report.status,
          },
          message: `${input.framework} ${input.reportingYear}: ${persisted.written} datapoint(s) auto-populated, ${scored.mandatoryPercent.toFixed(0)}% of mandatory requirements answered.`,
          messageKey: "action.success.generateDisclosureReport",
          audit: [
            auditEntry(session, {
              entityType: "DisclosureReport",
              entityId: persisted.reportId,
              action: "update",
              after: {
                framework: input.framework,
                reportingYear: input.reportingYear,
                autoPopulated: persisted.written,
                mandatoryPercent: scored.mandatoryPercent,
                status: persisted.report.status,
              },
              reason: "Report generated from the computed inventory",
            }),
          ],
        };
      },
    },
    rawInput,
  );
}

/** Creates an empty report shell for a framework and year. */
export async function createDisclosureReportAction(
  rawInput: unknown,
): Promise<ActionState<{ readonly id: string }>> {
  return runAction(
    {
      name: "createDisclosureReport",
      resource: "disclosure",
      action: "create",
      schema: disclosureReportInputSchema,
      revalidate: [...PATHS],
      handler: async ({ session, input, organizationId }) => {
        const created = await prisma.disclosureReport.create({
          data: {
            organizationId,
            name: input.name,
            framework: input.framework,
            reportingYear: input.reportingYear,
            status: input.status,
            dueDate: input.dueDate ?? null,
            notes: input.notes ?? null,
            createdById: input.createdById ?? null,
          },
          select: { id: true },
        });
        return {
          data: { id: created.id },
          message: `Created the ${input.framework} ${input.reportingYear} report.`,
          messageKey: "action.success.createDisclosureReport",
          audit: [
            auditEntry(session, {
              entityType: "DisclosureReport",
              entityId: created.id,
              action: "create",
              after: {
                name: input.name,
                framework: input.framework,
                reportingYear: input.reportingYear,
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

export type SaveResponseResult = {
  readonly id: string;
  readonly requirementCode: string;
  readonly mandatoryPercent: number;
};

/** Saves an authored narrative response and rescores the report's completeness. */
export async function saveDisclosureResponseAction(
  rawInput: unknown,
): Promise<ActionState<SaveResponseResult>> {
  return runAction(
    {
      name: "saveDisclosureResponse",
      resource: "disclosure",
      action: "update",
      schema: disclosureResponseInputSchema,
      revalidate: [...PATHS],
      handler: async ({ session, input, organizationId }) => {
        const requirement = await prisma.disclosureRequirement.findFirst({
          where: { code: input.requirementCode, framework: { code: input.framework } },
          select: { id: true },
        });
        if (!requirement) {
          throw new NotFoundError(
            `${input.requirementCode} is not catalogued for ${input.framework}`,
          );
        }
        if (input.reportId) {
          const report = await prisma.disclosureReport.findUnique({
            where: { id: input.reportId },
            select: { organizationId: true, reportingYear: true },
          });
          if (!report || report.organizationId !== organizationId) {
            throw new NotFoundError(`Report ${input.reportId} was not found`);
          }
          // Block writes to a locked period.
          await assertPeriodNotLocked(organizationId, report.reportingYear);
        }

        const existing = await prisma.disclosureResponse.findFirst({
          where: { requirementId: requirement.id, reportId: input.reportId ?? null },
          select: { id: true, value: true, numericValue: true, status: true },
        });

        const saved = existing
          ? await prisma.disclosureResponse.update({
              where: { id: existing.id },
              data: {
                value: input.value ?? null,
                numericValue: input.numericValue ?? null,
                status: input.status,
                // Authoring strips the auto marker, so a regeneration will not
                // overwrite what a person wrote.
                notes: input.notes ?? null,
                evidenceUrl: input.evidenceUrl ?? null,
                reviewedBy: input.reviewedBy ?? null,
                reviewedAt: input.reviewedAt ?? null,
              },
              select: { id: true },
            })
          : await prisma.disclosureResponse.create({
              data: {
                requirementId: requirement.id,
                reportId: input.reportId ?? null,
                value: input.value ?? null,
                numericValue: input.numericValue ?? null,
                status: input.status,
                notes: input.notes ?? null,
                evidenceUrl: input.evidenceUrl ?? null,
                reviewedBy: input.reviewedBy ?? null,
                reviewedAt: input.reviewedAt ?? null,
              },
              select: { id: true },
            });

        const stored = input.reportId
          ? await prisma.disclosureResponse.findMany({
              where: { reportId: input.reportId },
              select: {
                value: true,
                numericValue: true,
                status: true,
                requirement: { select: { code: true } },
              },
            })
          : [];
        const scored = completeness(
          stored.map((row) => ({
            requirementCode: row.requirement.code,
            value: row.value,
            numericValue: row.numericValue,
            status: row.status,
          })),
          requirementsFor(input.framework),
        );

        return {
          data: {
            id: saved.id,
            requirementCode: input.requirementCode,
            mandatoryPercent: scored.mandatoryPercent,
          },
          message: `Saved ${input.requirementCode}.`,
          messageKey: "action.success.saveDisclosureResponse",
          audit: [
            auditEntry(session, {
              entityType: "DisclosureResponse",
              entityId: saved.id,
              action: existing ? "update" : "create",
              before: existing
                ? {
                    value: existing.value,
                    numericValue: existing.numericValue,
                    status: existing.status,
                  }
                : null,
              after: {
                requirementCode: input.requirementCode,
                value: input.value ?? null,
                numericValue: input.numericValue ?? null,
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
