"use server";

/**
 * CSV bulk-import commit action.
 *
 * `csv-import.tsx` parses and maps a CSV entirely client-side and previously had
 * no server action to persist the result — the "Commit import job" button was
 * disabled with no handler. This closes that gap: each already-mapped row is
 * validated and run through the same rule sets `createActivityEntryAction` uses,
 * a bad row is recorded rather than failing the whole job, and the accepted rows
 * plus the `DataImportJob`/`DataImportMapping` records are written in one
 * transaction.
 */

import { NotFoundError } from "@/lib/core/errors";
import { evaluateRuleSet } from "@/lib/domain/rules/evaluate";
import { applyRuleSetActions, type RuleActionEffect } from "@/lib/domain/rules/actions";
import { listRuleSets } from "@/lib/data/repositories/rules";
import { resolveNotificationRecipients } from "@/lib/data/repositories/security";
import { getNotificationChannel } from "@/lib/notifications/factory";
import { prisma } from "@/lib/prisma";
import {
  activityDataEntryInputSchema,
  commitDataImportJobInputSchema,
  type ActivityDataEntryInput,
} from "@/lib/validation";

import { auditEntry, runAction } from "./runtime";
import type { ActionState } from "./types";

const PATHS = ["/activity-data", "/emission-engine", "/dashboard"] as const;
const TRUTHY = new Set(["true", "1", "yes", "y"]);

export type DataImportRowError = {
  readonly rowIndex: number;
  readonly errors: readonly string[];
};

export type CommitDataImportJobResult = {
  readonly jobId: string;
  readonly totalRows: number;
  readonly processedRows: number;
  readonly errorRows: number;
  readonly rowErrors: readonly DataImportRowError[];
};

/** Coerces a mapped row's raw strings into what `activityDataEntryInputSchema` expects. */
function coerceRow(activityDataId: string, raw: Readonly<Record<string, string>>): unknown {
  return {
    activityDataId,
    quantity: raw.quantity !== undefined && raw.quantity !== "" ? Number(raw.quantity) : undefined,
    unit: raw.unit,
    startDate: raw.startDate,
    endDate: raw.endDate,
    emissionSourceId: raw.emissionSourceId || null,
    notes: raw.notes || null,
    evidenceUrl: raw.evidenceUrl || null,
    isEstimated: raw.isEstimated !== undefined ? TRUTHY.has(raw.isEstimated.trim().toLowerCase()) : false,
    uncertainty:
      raw.uncertainty !== undefined && raw.uncertainty !== "" ? Number(raw.uncertainty) : null,
  };
}

/** Creates a `DataImportJob`, its accepted `ActivityDataEntry` rows, and the mapping record. */
export async function commitDataImportJobAction(
  rawInput: unknown,
): Promise<ActionState<CommitDataImportJobResult>> {
  return runAction(
    {
      name: "commitDataImportJob",
      resource: "activity_data",
      action: "create",
      schema: commitDataImportJobInputSchema,
      revalidate: [...PATHS],
      handler: async ({ session, input, organizationId }) => {
        const header = await prisma.activityData.findUnique({
          where: { id: input.activityDataId },
          select: { id: true, organizationId: true },
        });
        if (!header || header.organizationId !== organizationId) {
          throw new NotFoundError(`Activity data set ${input.activityDataId} was not found`);
        }

        const ruleSets = await listRuleSets(organizationId, {
          category: "activity_data",
          activeOnly: true,
        });

        const validRows: ActivityDataEntryInput[] = [];
        const rowErrors: DataImportRowError[] = [];
        const notifyEffects: RuleActionEffect[] = [];

        input.rows.forEach((raw, rowIndex) => {
          const parsed = activityDataEntryInputSchema.safeParse(
            coerceRow(input.activityDataId, raw),
          );
          if (!parsed.success) {
            rowErrors.push({
              rowIndex,
              errors: parsed.error.issues.map(
                (issue) => `${issue.path.join(".") || "row"}: ${issue.message}`,
              ),
            });
            return;
          }

          const context = {
            quantity: parsed.data.quantity,
            unit: parsed.data.unit,
            isEstimated: parsed.data.isEstimated,
            uncertainty: parsed.data.uncertainty ?? null,
            evidenceUrl: parsed.data.evidenceUrl ?? null,
          };
          let blocked = false;
          for (const ruleSet of ruleSets) {
            const evaluation = evaluateRuleSet(ruleSet, context);
            const outcome = applyRuleSetActions(ruleSet, evaluation, context, {
              triggerType: "commitDataImportJob",
              triggeredBy: session.userId,
            });
            for (const effect of outcome.effects) {
              if (effect.blocking) blocked = true;
              if (effect.type === "notify") notifyEffects.push(effect);
            }
            if (blocked) {
              rowErrors.push({
                rowIndex,
                errors: outcome.effects.filter((effect) => effect.blocking).map((effect) => effect.message),
              });
            }
          }
          if (!blocked) validRows.push(parsed.data);
        });

        const status =
          rowErrors.length === 0 ? "COMPLETED" : validRows.length === 0 ? "FAILED" : "PARTIALLY_COMPLETED";

        const job = await prisma.$transaction(async (tx) => {
          const created = await tx.dataImportJob.create({
            data: {
              organizationId,
              name: input.name,
              fileName: input.fileName ?? null,
              fileType: input.fileType ?? null,
              status,
              totalRows: input.rows.length,
              processedRows: validRows.length,
              errorRows: rowErrors.length,
              errorLog: rowErrors.length > 0 ? (rowErrors as unknown as object) : undefined,
              startedAt: new Date(),
              completedAt: new Date(),
              mappings: {
                create: input.mappings.map((mapping) => ({
                  sourceColumn: mapping.sourceColumn,
                  targetField: mapping.targetField,
                  transformation: mapping.transformation ?? null,
                  defaultValue: mapping.defaultValue ?? null,
                  isRequired: mapping.isRequired,
                })),
              },
            },
            select: { id: true },
          });

          if (validRows.length > 0) {
            await tx.activityDataEntry.createMany({
              data: validRows.map((row) => ({
                activityDataId: row.activityDataId,
                quantity: row.quantity,
                unit: row.unit,
                startDate: row.startDate,
                endDate: row.endDate,
                notes: row.notes ?? null,
                evidenceUrl: row.evidenceUrl ?? null,
                isEstimated: row.isEstimated,
                uncertainty: row.uncertainty ?? null,
                emissionSourceId: row.emissionSourceId ?? null,
                productId: row.productId ?? null,
                supplierId: row.supplierId ?? null,
                vehicleId: row.vehicleId ?? null,
                fuelId: row.fuelId ?? null,
                refrigerantId: row.refrigerantId ?? null,
                rawMaterialId: row.rawMaterialId ?? null,
                logisticsRouteId: row.logisticsRouteId ?? null,
                energySourceId: row.energySourceId ?? null,
                wasteTypeId: row.wasteTypeId ?? null,
                waterSourceId: row.waterSourceId ?? null,
              })),
            });
          }

          return created;
        });

        // Best-effort, deduplicated by rule+target so one rule matching many rows
        // sends a single notification rather than one per row.
        if (notifyEffects.length > 0) {
          const channel = getNotificationChannel();
          const byKey = new Map<string, { readonly effect: RuleActionEffect; count: number }>();
          for (const effect of notifyEffects) {
            const key = `${effect.ruleId}:${effect.target ?? ""}`;
            const existing = byKey.get(key);
            if (existing) existing.count += 1;
            else byKey.set(key, { effect, count: 1 });
          }
          await Promise.all(
            [...byKey.values()].map(async ({ effect, count }) => {
              try {
                const recipients = await resolveNotificationRecipients(organizationId, effect.target);
                if (recipients.length === 0) {
                  console.warn(
                    `[notification] no recipient resolved for target "${effect.target ?? "(none)"}"`,
                  );
                  return;
                }
                const body = count > 1 ? `${effect.message} (${count} rows)` : effect.message;
                await Promise.all(
                  recipients.map((recipient) =>
                    channel.send({
                      recipient,
                      subject: `CIOS rule triggered: ${effect.ruleName}`,
                      body,
                      severity: "info",
                      metadata: { ruleId: effect.ruleId, importJobId: job.id },
                    }),
                  ),
                );
              } catch (error) {
                console.error("[notification] failed to dispatch", error);
              }
            }),
          );
        }

        return {
          data: {
            jobId: job.id,
            totalRows: input.rows.length,
            processedRows: validRows.length,
            errorRows: rowErrors.length,
            rowErrors,
          },
          message:
            rowErrors.length === 0
              ? `Imported ${validRows.length} row(s).`
              : `Imported ${validRows.length} of ${input.rows.length} row(s); ${rowErrors.length} rejected.`,
          messageKey: "action.success.commitDataImportJob",
          audit: [
            auditEntry(session, {
              entityType: "DataImportJob",
              entityId: job.id,
              action: "create",
              after: {
                name: input.name,
                totalRows: input.rows.length,
                processedRows: validRows.length,
                errorRows: rowErrors.length,
                status,
              },
            }),
          ],
        };
      },
    },
    rawInput,
  );
}
