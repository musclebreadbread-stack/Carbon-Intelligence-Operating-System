"use server";

/**
 * Science-based-target actions.
 *
 * A target is screened against the SBTi near-term criteria *before* it is written,
 * and the blocking warnings are returned to the form. A target that would be
 * rejected by the validator is still saved as `DRAFT` — refusing to store it would
 * stop the user from working towards it — but it can never be saved as `APPROVED`
 * while a blocking warning stands.
 */

import { NotFoundError, ValidationError } from "@/lib/core/errors";
import {
  absoluteContractionPathway,
  evaluateProgress,
  netZeroPlan,
  sectoralDecarbonizationPathway,
  validateTargetAgainstCriteria,
  type TargetWarning,
} from "@/lib/domain/targets/sbti";
import { getInventory } from "@/lib/data/repositories/calculation";
import { prisma } from "@/lib/prisma";
import {
  netZeroCommitmentInputSchema,
  scienceBasedTargetInputSchema,
  targetPathwayRequestSchema,
  targetProgressInputSchema,
} from "@/lib/validation";

import { auditEntry, runAction } from "./runtime";
import type { ActionState } from "./types";

const PATHS = ["/target-management", "/dashboard", "/esg-disclosure"] as const;

export type CreateTargetResult = {
  readonly id: string;
  readonly impliedAnnualRate: number;
  readonly isEligible: boolean;
  readonly warnings: readonly TargetWarning[];
};

/** Creates a science-based target after screening it against the SBTi criteria. */
export async function createTargetAction(
  rawInput: unknown,
): Promise<ActionState<CreateTargetResult>> {
  return runAction(
    {
      name: "createTarget",
      resource: "target",
      action: "create",
      schema: scienceBasedTargetInputSchema,
      revalidate: [...PATHS],
      attributes: (input) => ({ reportingYear: input.baselineYear }),
      handler: async ({ session, input, organizationId }) => {
        // The base-year split comes from the computed inventory, not the payload,
        // so the Scope 3 threshold test cannot be dodged by omitting it.
        const baseline = await getInventory(organizationId, input.baselineYear);
        const validation = validateTargetAgainstCriteria({
          boundary: input.boundary,
          baselineYear: input.baselineYear,
          baselineEmissions:
            input.baselineEmissions ?? baseline.consolidated.totalEmissions,
          targetYear: input.targetYear,
          targetReduction: input.targetReduction,
          scope1Emissions: baseline.consolidated.scope1Total,
          scope2Emissions: baseline.consolidated.scope2Location,
          scope3Emissions: baseline.consolidated.scope3Total,
        });

        const blocking = validation.warnings.filter(
          (warning) => warning.severity === "BLOCKING",
        );
        if (input.status === "APPROVED" && blocking.length > 0) {
          throw new ValidationError(
            "A target with blocking SBTi warnings cannot be saved as approved.",
            { warnings: blocking.map((warning) => warning.message) },
          );
        }

        const created = await prisma.scienceBasedTarget.create({
          data: {
            organizationId,
            targetTypeId: input.targetTypeId ?? null,
            name: input.name,
            boundary: input.boundary,
            baselineYear: input.baselineYear,
            baselineEmissions:
              input.baselineEmissions ?? baseline.consolidated.totalEmissions,
            targetYear: input.targetYear,
            targetReduction: input.targetReduction,
            targetAbsolute: input.targetAbsolute ?? null,
            currentEmissions: input.currentEmissions ?? null,
            currentProgress: input.currentProgress,
            methodology: input.methodology ?? null,
            status: input.status,
            submittedAt: input.submittedAt ?? null,
            approvedAt: input.approvedAt ?? null,
            validatedBy: input.validatedBy ?? null,
          },
          select: { id: true },
        });

        return {
          data: {
            id: created.id,
            impliedAnnualRate: validation.impliedAnnualRate,
            isEligible: validation.isEligible,
            warnings: validation.warnings,
          },
          message: validation.isEligible
            ? `Created target "${input.name}".`
            : `Created target "${input.name}" with ${validation.warnings.length} SBTi warning(s).`,
          messageKey: "action.success.createTarget",
          audit: [
            auditEntry(session, {
              entityType: "ScienceBasedTarget",
              entityId: created.id,
              action: "create",
              after: {
                name: input.name,
                boundary: input.boundary,
                baselineYear: input.baselineYear,
                targetYear: input.targetYear,
                targetReduction: input.targetReduction,
                status: input.status,
              },
              reason: validation.isEligible
                ? null
                : validation.warnings.map((warning) => warning.code).join(", "),
            }),
          ],
        };
      },
    },
    rawInput,
  );
}

export type PathwayResult = {
  readonly targetId: string;
  readonly points: readonly {
    readonly year: number;
    readonly targetEmissions: number;
    readonly isInterim: boolean;
  }[];
  readonly targetEmissions: number;
  readonly targetReduction: number;
  readonly unit: string;
  readonly methodology: string;
};

/**
 * Generates and stores the pathway as `TargetProgress` rows for the pathway years.
 *
 * The pathway is a projection, so each row is written with `emissions` equal to the
 * pathway value and no `verifiedAt`; a later actual overwrites it through
 * `recordTargetProgressAction`, which is why the model's `[targetId, year]` unique
 * constraint is upserted rather than created.
 */
export async function generateTargetPathwayAction(
  rawInput: unknown,
): Promise<ActionState<PathwayResult>> {
  return runAction(
    {
      name: "generateTargetPathway",
      resource: "target",
      action: "update",
      schema: targetPathwayRequestSchema,
      revalidate: [...PATHS],
      handler: async ({ session, input, organizationId }) => {
        const target = await prisma.scienceBasedTarget.findUnique({
          where: { id: input.targetId },
          select: { id: true, organizationId: true, name: true, boundary: true },
        });
        if (!target || target.organizationId !== organizationId) {
          throw new NotFoundError(`Target ${input.targetId} was not found`);
        }

        const span = input.targetYear - input.baselineYear;
        // Both branches return points shaped to `TargetPathwayPoint`; the SDA
        // variant adds intensity columns the pathway rows do not store, so only
        // the shared fields are read below.
        const pathway: {
          readonly points: readonly {
            readonly year: number;
            readonly targetEmissions: number;
            readonly isInterim: boolean;
            readonly methodology: string;
          }[];
          readonly methodology: string;
          readonly unit: string;
        } =
          input.method === "SECTORAL_DECARBONIZATION"
            ? sectoralDecarbonizationPathway({
                baselineYear: input.baselineYear,
                targetYear: input.targetYear,
                // No sector benchmark is supplied with the request, so the company
                // is taken to sit exactly on the sector average and the sector is
                // taken to decarbonise at the requested rate. That makes the SDA
                // output converge on the same endpoint as an absolute contraction
                // while still reporting the intensity series — the conservative
                // reading when sector data has not been licensed.
                companyBaselineIntensity: input.baselineEmissions,
                sectorBaselineIntensity: input.baselineEmissions,
                sectorTargetIntensity: Math.max(
                  0,
                  input.baselineEmissions * (1 - (input.annualRate / 100) * span),
                ),
                baselineActivity: 1,
                activityGrowthRate: 0,
                name: target.name,
              })
            : absoluteContractionPathway({
                baselineYear: input.baselineYear,
                baselineEmissions: input.baselineEmissions,
                targetYear: input.targetYear,
                annualRate: input.annualRate / 100,
                name: target.name,
              });

        const endpoint = pathway.points.at(-1)?.targetEmissions ?? 0;
        const targetReduction =
          input.baselineEmissions === 0
            ? 0
            : (input.baselineEmissions - endpoint) / input.baselineEmissions;

        await prisma.$transaction(
          pathway.points.map((point) =>
            prisma.targetProgress.upsert({
              where: { targetId_year: { targetId: target.id, year: point.year } },
              create: {
                targetId: target.id,
                year: point.year,
                emissions: point.targetEmissions,
                reductionFromBaseline:
                  input.baselineEmissions - point.targetEmissions,
                reductionPercent:
                  input.baselineEmissions === 0
                    ? 0
                    : ((input.baselineEmissions - point.targetEmissions) /
                        input.baselineEmissions) *
                      100,
                notes: `Pathway point (${point.methodology})`,
              },
              // A recorded actual must not be overwritten by a regenerated
              // pathway, so only the pathway note is refreshed.
              update: { notes: `Pathway point (${point.methodology})` },
            }),
          ),
        );

        return {
          data: {
            targetId: target.id,
            points: pathway.points.map((point) => ({
              year: point.year,
              targetEmissions: point.targetEmissions,
              isInterim: point.isInterim,
            })),
            targetEmissions: endpoint,
            targetReduction,
            unit: pathway.unit,
            methodology: pathway.methodology,
          },
          message: `Generated a ${pathway.points.length}-point pathway to ${input.targetYear}.`,
          messageKey: "action.success.generateTargetPathway",
          audit: [
            auditEntry(session, {
              entityType: "ScienceBasedTarget",
              entityId: target.id,
              action: "update",
              after: {
                method: input.method,
                annualRate: input.annualRate,
                points: pathway.points.length,
                targetEmissions: endpoint,
              },
              reason: "Pathway regenerated",
            }),
          ],
        };
      },
    },
    rawInput,
  );
}

export type ProgressResult = {
  readonly targetId: string;
  readonly year: number;
  readonly isOnTrack: boolean;
  readonly currentProgress: number;
  readonly gapToPathway: number | null;
};

/** Records a reported actual against a target and recomputes its progress. */
export async function recordTargetProgressAction(
  rawInput: unknown,
): Promise<ActionState<ProgressResult>> {
  return runAction(
    {
      name: "recordTargetProgress",
      resource: "target",
      action: "update",
      schema: targetProgressInputSchema,
      revalidate: [...PATHS],
      handler: async ({ session, input, organizationId }) => {
        const target = await prisma.scienceBasedTarget.findUnique({
          where: { id: input.targetId },
          include: { progress: { orderBy: { year: "asc" } } },
        });
        if (!target || target.organizationId !== organizationId) {
          throw new NotFoundError(`Target ${input.targetId} was not found`);
        }
        if (target.baselineEmissions === null) {
          throw new ValidationError(
            "Progress cannot be judged for a target with no baseline emissions.",
          );
        }

        const actuals = [
          ...target.progress
            .filter((row) => row.year !== input.year && row.verifiedAt !== null)
            .map((row) => ({
              year: row.year,
              emissions: row.emissions,
              verifiedAt: row.verifiedAt,
            })),
          {
            year: input.year,
            emissions: input.emissions,
            verifiedAt: input.verifiedAt ?? null,
          },
        ].sort((a, b) => a.year - b.year);

        const summary = evaluateProgress(
          {
            baselineYear: target.baselineYear,
            baselineEmissions: target.baselineEmissions,
            targetYear: target.targetYear,
            ...(target.targetAbsolute !== null
              ? { targetEmissions: target.targetAbsolute }
              : {}),
          },
          actuals,
        );
        const record =
          summary.records.find((row) => row.year === input.year) ?? null;

        // Server-computed values (`record`, from `evaluateProgress` above) take
        // priority over client input for every derived metric: `input.*` is only
        // a fallback for the fields the server could not compute (e.g. no prior
        // year to derive a reduction from), never an override of a real answer.
        await prisma.$transaction([
          prisma.targetProgress.upsert({
            where: { targetId_year: { targetId: target.id, year: input.year } },
            create: {
              targetId: target.id,
              year: input.year,
              emissions: input.emissions,
              reductionFromBaseline:
                record?.reductionFromBaseline ?? input.reductionFromBaseline ?? null,
              reductionPercent:
                record?.reductionPercent ?? input.reductionPercent ?? null,
              isOnTrack: record?.isOnTrack ?? input.isOnTrack ?? null,
              notes: input.notes ?? record?.notes ?? null,
              verifiedAt: input.verifiedAt ?? null,
            },
            update: {
              emissions: input.emissions,
              reductionFromBaseline:
                record?.reductionFromBaseline ?? input.reductionFromBaseline ?? null,
              reductionPercent:
                record?.reductionPercent ?? input.reductionPercent ?? null,
              isOnTrack: record?.isOnTrack ?? input.isOnTrack ?? null,
              notes: input.notes ?? record?.notes ?? null,
              verifiedAt: input.verifiedAt ?? null,
            },
          }),
          prisma.scienceBasedTarget.update({
            where: { id: target.id },
            data: {
              currentEmissions: summary.latest?.emissions ?? input.emissions,
              currentProgress: summary.currentProgress * 100,
            },
          }),
        ]);

        return {
          data: {
            targetId: target.id,
            year: input.year,
            isOnTrack: record?.isOnTrack ?? summary.isOnTrack,
            currentProgress: summary.currentProgress * 100,
            gapToPathway: record?.gapToPathway ?? null,
          },
          message: `Recorded ${input.emissions} ${summary.unit} for ${input.year}; the target is ${
            summary.isOnTrack ? "on track" : "off track"
          }.`,
          messageKey: "action.success.recordTargetProgress",
          audit: [
            auditEntry(session, {
              entityType: "TargetProgress",
              entityId: `${target.id}:${input.year}`,
              action: "update",
              after: {
                year: input.year,
                emissions: input.emissions,
                isOnTrack: record?.isOnTrack ?? summary.isOnTrack,
                currentProgress: summary.currentProgress * 100,
              },
            }),
          ],
        };
      },
    },
    rawInput,
  );
}

export type NetZeroResult = {
  readonly targetId: string;
  readonly netZeroYear: number;
  readonly residualEmissions: number;
  readonly neutralizationRequired: number;
  readonly meetsSbtiNetZero: boolean;
};

/** Declares a net-zero commitment, deriving the residual/neutralisation split. */
export async function commitNetZeroAction(
  rawInput: unknown,
): Promise<ActionState<NetZeroResult>> {
  return runAction(
    {
      name: "commitNetZero",
      resource: "target",
      action: "approve",
      schema: netZeroCommitmentInputSchema,
      revalidate: [...PATHS],
      handler: async ({ session, input, organizationId }) => {
        const target = await prisma.scienceBasedTarget.findUnique({
          where: { id: input.targetId },
          select: {
            id: true,
            organizationId: true,
            baselineYear: true,
            baselineEmissions: true,
          },
        });
        if (!target || target.organizationId !== organizationId) {
          throw new NotFoundError(`Target ${input.targetId} was not found`);
        }
        if (target.baselineEmissions === null) {
          throw new ValidationError(
            "A net-zero commitment needs the target's baseline emissions.",
          );
        }

        const plan = netZeroPlan({
          baselineYear: target.baselineYear,
          baselineEmissions: target.baselineEmissions,
          netZeroYear: input.netZeroYear,
          ...(input.interimYear !== null && input.interimYear !== undefined
            ? { interimYear: input.interimYear }
            : {}),
          ...(input.interimTarget !== null && input.interimTarget !== undefined
            ? { interimReduction: input.interimTarget / 100 }
            : {}),
          ...(input.residualEmissions !== null &&
          input.residualEmissions !== undefined
            ? { residualEmissions: input.residualEmissions }
            : {}),
        });

        const created = await prisma.netZeroCommitment.upsert({
          where: { targetId: target.id },
          create: {
            targetId: target.id,
            pledgeYear: input.pledgeYear,
            netZeroYear: input.netZeroYear,
            interimTarget: input.interimTarget ?? null,
            interimYear: input.interimYear ?? null,
            residualEmissions: plan.residualEmissions,
            neutralizationStrategy: input.neutralizationStrategy ?? null,
            status: input.status,
            declaredAt: input.declaredAt ?? null,
          },
          update: {
            pledgeYear: input.pledgeYear,
            netZeroYear: input.netZeroYear,
            interimTarget: input.interimTarget ?? null,
            interimYear: input.interimYear ?? null,
            residualEmissions: plan.residualEmissions,
            neutralizationStrategy: input.neutralizationStrategy ?? null,
            status: input.status,
            declaredAt: input.declaredAt ?? null,
          },
          select: { id: true },
        });

        return {
          data: {
            targetId: target.id,
            netZeroYear: input.netZeroYear,
            residualEmissions: plan.residualEmissions,
            neutralizationRequired: plan.neutralizationVolume,
            meetsSbtiNetZero: plan.meetsNetZeroStandard,
          },
          message: `Committed to net zero by ${input.netZeroYear}, neutralising ${plan.neutralizationVolume.toFixed(1)} ${plan.unit}.`,
          messageKey: "action.success.commitNetZero",
          audit: [
            auditEntry(session, {
              entityType: "NetZeroCommitment",
              entityId: created.id,
              action: "create",
              after: {
                netZeroYear: input.netZeroYear,
                residualEmissions: plan.residualEmissions,
                meetsSbtiNetZero: plan.meetsNetZeroStandard,
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
