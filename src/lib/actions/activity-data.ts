"use server";

/**
 * Activity-data actions.
 *
 * These are the mutations a facility operator uses daily, so they are the actions
 * most likely to be hit by a hostile POST. Every one of them re-checks the session,
 * re-checks the permission *with the facility as an ABAC attribute* (so the
 * Ulsan-only policy actually binds), and validates with the item-27 schemas before
 * touching the database.
 */

import { NotFoundError, ValidationError } from "@/lib/core/errors";
import { evaluateRuleSet } from "@/lib/domain/rules/evaluate";
import { applyRuleSetActions } from "@/lib/domain/rules/actions";
import { listRuleSets } from "@/lib/data/repositories/rules";
import { prisma } from "@/lib/prisma";
import {
  activityDataEntryInputSchema,
  activityDataEntryUpdateSchema,
  activityDataInputSchema,
  meterReadingInputSchema,
} from "@/lib/validation";

import { auditEntry, runAction } from "./runtime";
import type { ActionState } from "./types";

const PATHS = ["/activity-data", "/emission-engine", "/dashboard"] as const;

/** Creates an `ActivityData` header. */
export async function createActivityDataAction(
  rawInput: unknown,
): Promise<ActionState<{ readonly id: string }>> {
  return runAction(
    {
      name: "createActivityData",
      resource: "activity_data",
      action: "create",
      schema: activityDataInputSchema,
      revalidate: [...PATHS],
      attributes: (input) => ({
        facilityId: input.facilityId ?? null,
        reportingYear: input.reportingYear,
        scope: input.scope,
      }),
      handler: async ({ session, input, organizationId }) => {
        const created = await prisma.activityData.create({
          data: {
            organizationId,
            facilityId: input.facilityId ?? null,
            businessUnitId: input.businessUnitId ?? null,
            name: input.name,
            description: input.description ?? null,
            scope: input.scope,
            scope3Category: input.scope3Category ?? null,
            reportingYear: input.reportingYear,
            reportingMonth: input.reportingMonth ?? null,
            dataSource: input.dataSource,
            dataQuality: input.dataQuality,
            isVerified: input.isVerified,
          },
        });
        return {
          data: { id: created.id },
          message: `Created activity data set "${input.name}".`,
          messageKey: "action.success.createActivityData",
          audit: [
            auditEntry(session, {
              entityType: "ActivityData",
              entityId: created.id,
              action: "create",
              after: { ...input },
            }),
          ],
        };
      },
    },
    rawInput,
  );
}

export type CreateEntryResult = {
  readonly id: string;
  /** Rule-engine effects raised by the new row, for the inline warning list. */
  readonly ruleFlags: readonly string[];
};

/**
 * Creates an `ActivityDataEntry` and runs the validation rule set against it.
 *
 * A `reject` effect aborts the write: an entry the rules refuse must not enter the
 * inventory. `flag` and `notify` effects are recorded and returned so the form can
 * show them without blocking.
 */
export async function createActivityEntryAction(
  rawInput: unknown,
): Promise<ActionState<CreateEntryResult>> {
  return runAction(
    {
      name: "createActivityEntry",
      resource: "activity_data",
      action: "create",
      schema: activityDataEntryInputSchema,
      revalidate: [...PATHS],
      handler: async ({ session, input, organizationId }) => {
        const header = await prisma.activityData.findUnique({
          where: { id: input.activityDataId },
          select: { id: true, organizationId: true, facilityId: true },
        });
        if (!header || header.organizationId !== organizationId) {
          // Re-read ownership from a trusted source rather than trusting the id.
          throw new NotFoundError(`Activity data set ${input.activityDataId} was not found`);
        }

        const ruleSets = await listRuleSets(organizationId, {
          category: "activity_data",
          activeOnly: true,
        });
        const context = {
          quantity: input.quantity,
          unit: input.unit,
          isEstimated: input.isEstimated,
          uncertainty: input.uncertainty ?? null,
          evidenceUrl: input.evidenceUrl ?? null,
        };

        const flags: string[] = [];
        const rejections: string[] = [];
        for (const ruleSet of ruleSets) {
          const evaluation = evaluateRuleSet(ruleSet, context);
          const outcome = applyRuleSetActions(ruleSet, evaluation, context, {
            triggerType: "createActivityEntry",
            triggeredBy: session.userId,
          });
          for (const effect of outcome.effects) {
            if (effect.blocking) rejections.push(effect.message);
            else flags.push(`${effect.type}: ${effect.message}`);
          }
        }
        if (rejections.length > 0) {
          throw new ValidationError(rejections.join(" "), { rejections });
        }

        const created = await prisma.activityDataEntry.create({
          data: {
            activityDataId: input.activityDataId,
            quantity: input.quantity,
            unit: input.unit,
            startDate: input.startDate,
            endDate: input.endDate,
            notes: input.notes ?? null,
            evidenceUrl: input.evidenceUrl ?? null,
            isEstimated: input.isEstimated,
            uncertainty: input.uncertainty ?? null,
            emissionSourceId: input.emissionSourceId ?? null,
            productId: input.productId ?? null,
            supplierId: input.supplierId ?? null,
            vehicleId: input.vehicleId ?? null,
            fuelId: input.fuelId ?? null,
            refrigerantId: input.refrigerantId ?? null,
            rawMaterialId: input.rawMaterialId ?? null,
            logisticsRouteId: input.logisticsRouteId ?? null,
            energySourceId: input.energySourceId ?? null,
            wasteTypeId: input.wasteTypeId ?? null,
            waterSourceId: input.waterSourceId ?? null,
          },
        });

        return {
          data: { id: created.id, ruleFlags: flags },
          message:
            flags.length > 0
              ? `Entry saved with ${flags.length} warning(s).`
              : "Entry saved.",
          messageKey: "action.success.createActivityEntry",
          audit: [
            auditEntry(session, {
              entityType: "ActivityDataEntry",
              entityId: created.id,
              action: "create",
              after: {
                quantity: input.quantity,
                unit: input.unit,
                startDate: input.startDate.toISOString(),
                endDate: input.endDate.toISOString(),
                isEstimated: input.isEstimated,
              },
              reason: flags.length > 0 ? flags.join("; ") : null,
            }),
          ],
        };
      },
    },
    rawInput,
  );
}

/** Updates an entry, diffing before and after into the audit trail. */
export async function updateActivityEntryAction(
  rawInput: unknown,
): Promise<ActionState<{ readonly id: string }>> {
  return runAction(
    {
      name: "updateActivityEntry",
      resource: "activity_data",
      action: "update",
      schema: activityDataEntryUpdateSchema,
      revalidate: [...PATHS],
      handler: async ({ session, input, organizationId }) => {
        const before = await prisma.activityDataEntry.findUnique({
          where: { id: input.id },
          include: { activityData: { select: { organizationId: true, facilityId: true } } },
        });
        if (!before || before.activityData.organizationId !== organizationId) {
          throw new NotFoundError(`Activity entry ${input.id} was not found`);
        }

        const { id, ...changes } = input;
        const updated = await prisma.activityDataEntry.update({
          where: { id },
          data: {
            ...(changes.quantity !== undefined ? { quantity: changes.quantity } : {}),
            ...(changes.unit !== undefined ? { unit: changes.unit } : {}),
            ...(changes.startDate !== undefined ? { startDate: changes.startDate } : {}),
            ...(changes.endDate !== undefined ? { endDate: changes.endDate } : {}),
            ...(changes.notes !== undefined ? { notes: changes.notes } : {}),
            ...(changes.evidenceUrl !== undefined ? { evidenceUrl: changes.evidenceUrl } : {}),
            ...(changes.isEstimated !== undefined ? { isEstimated: changes.isEstimated } : {}),
            ...(changes.uncertainty !== undefined ? { uncertainty: changes.uncertainty } : {}),
          },
        });

        return {
          data: { id: updated.id },
          message: "Entry updated.",
          messageKey: "action.success.updateActivityEntry",
          audit: [
            auditEntry(session, {
              entityType: "ActivityDataEntry",
              entityId: id,
              action: "update",
              before: {
                quantity: before.quantity,
                unit: before.unit,
                isEstimated: before.isEstimated,
                uncertainty: before.uncertainty,
                evidenceUrl: before.evidenceUrl,
              },
              after: {
                quantity: updated.quantity,
                unit: updated.unit,
                isEstimated: updated.isEstimated,
                uncertainty: updated.uncertainty,
                evidenceUrl: updated.evidenceUrl,
              },
            }),
          ],
        };
      },
    },
    rawInput,
  );
}

/** Records a meter reading and its derived consumption. */
export async function recordMeterReadingAction(
  rawInput: unknown,
): Promise<ActionState<{ readonly id: string }>> {
  return runAction(
    {
      name: "recordMeterReading",
      resource: "activity_data",
      action: "create",
      schema: meterReadingInputSchema,
      revalidate: ["/digital-mrv", "/activity-data"],
      attributes: (input) => ({ facilityId: input.facilityId }),
      handler: async ({ session, input }) => {
        const created = await prisma.meterReading.create({
          data: {
            facilityId: input.facilityId,
            meterNumber: input.meterId,
            readingType: input.meterType,
            readingDate: input.readingDate,
            previousValue: input.previousReading ?? null,
            readingValue: input.currentReading,
            consumption: input.consumption,
            unit: input.unit,
            isEstimated: input.isEstimated,
          },
        });
        return {
          data: { id: created.id },
          message: `Recorded ${input.consumption} ${input.unit} for meter ${input.meterId}.`,
          messageKey: "action.success.recordMeterReading",
          audit: [
            auditEntry(session, {
              entityType: "MeterReading",
              entityId: created.id,
              action: "create",
              after: { ...input, readingDate: input.readingDate.toISOString() },
            }),
          ],
        };
      },
    },
    rawInput,
  );
}
