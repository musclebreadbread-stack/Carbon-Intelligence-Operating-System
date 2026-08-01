"use server";

/**
 * Validation-rule actions.
 *
 * The rule engine in `domain/rules` is deliberately pure: `applyRuleSetActions`
 * returns `RuleActionEffect[]` and never performs anything. This file is the layer
 * that performs them — writing the `RuleExecution` audit rows, applying `set_field`
 * updates, and reporting `reject` effects to the caller as a blocked outcome.
 */

import { z } from "zod";

import { NotFoundError } from "@/lib/core/errors";
import { applyRuleSetActions } from "@/lib/domain/rules/actions";
import { evaluateRuleSet } from "@/lib/domain/rules/evaluate";
import {
  describeDelivery,
  partitionByDeliverability,
  planNotifications,
} from "@/lib/domain/notifications/deliver";
import { getRuleSet } from "@/lib/data/repositories/rules";
import { persistNotifications } from "@/lib/data/repositories/notifications";
import { prisma } from "@/lib/prisma";
import {
  executeRuleSetInputSchema,
  idSchema,
  ruleSetInputSchema,
} from "@/lib/validation";

import { auditEntry, runAction } from "./runtime";
import type { ActionState } from "./types";

const PATHS = ["/validation-rules", "/activity-data", "/notifications"] as const;

/** Local to this file: a toggle has no reuse outside it. */
const ruleSetToggleSchema = z.object({
  organizationId: idSchema,
  ruleSetId: idSchema,
  isActive: z.boolean(),
});

export type ExecuteRuleSetResult = {
  readonly ruleSetId: string;
  /** `true` when a matched rule raised a blocking `reject` effect. */
  readonly blocked: boolean;
  readonly matchedRules: number;
  readonly evaluatedRules: number;
  readonly executionIds: readonly string[];
  readonly effects: readonly {
    readonly type: string;
    readonly severity: string;
    readonly blocking: boolean;
    readonly message: string;
  }[];
  /** `set_field` assignments the caller should apply to its own entity. */
  readonly fieldUpdates: Readonly<Record<string, string | null>>;
  /** In-app `Notification` rows written from `notify` effects. */
  readonly notificationsDelivered: number;
  /**
   * Notifications recorded but *not* sent, because their channel needs a transport
   * the operator has to supply. Reported so the UI never implies they went out.
   */
  readonly notificationsPending: number;
  /** Human-readable summary of the two counts above. */
  readonly deliverySummary: string;
};

/**
 * Evaluates one rule set against a context and persists a `RuleExecution` per rule.
 *
 * Every evaluated rule gets a row, not only the matched ones: "this rule ran and
 * did not match" is exactly the evidence a verifier asks for when a data point was
 * *not* flagged.
 */
export async function executeRuleSetAction(
  rawInput: unknown,
): Promise<ActionState<ExecuteRuleSetResult>> {
  return runAction(
    {
      name: "executeRuleSet",
      resource: "validation_rule",
      action: "execute",
      schema: executeRuleSetInputSchema,
      revalidate: [...PATHS],
      handler: async ({ session, input, organizationId }) => {
        const ruleSet = await getRuleSet(organizationId, input.ruleSetId);
        if (!ruleSet) {
          throw new NotFoundError(`Rule set ${input.ruleSetId} was not found`);
        }

        const startedAt = Date.now();
        const evaluation = evaluateRuleSet(ruleSet, input.context);
        const outcome = applyRuleSetActions(ruleSet, evaluation, input.context, {
          triggerType: `${input.entityType}:manual`,
          triggeredBy: session.userId,
        });
        const duration = Date.now() - startedAt;

        // A `notify` effect used to be built and then dropped, so a rule that said
        // "tell the owner when the meter exceeds the threshold" did nothing at all.
        // The plans are written with the executions, in the same transaction: a
        // notification about a run that was rolled back would be a lie.
        const plans = planNotifications(outcome.effects, {
          organizationId,
          fallbackUserId: session.userId,
          knownUserIds: [session.userId],
          entityType: input.entityType,
          entityId: input.entityId,
          actionUrl: "/notifications",
        });
        const { deliverable, pending } = partitionByDeliverability(plans);

        // One transaction so a rule set is never half-recorded.
        const { executionIds, notificationsDelivered, notificationsRecorded } =
          await prisma.$transaction(async (tx) => {
            const ids: string[] = [];
            for (const execution of outcome.executions) {
              const created = await tx.ruleExecution.create({
                data: {
                  ruleId: execution.ruleId,
                  status: execution.status,
                  triggerType: execution.triggerType,
                  triggeredBy: execution.triggeredBy,
                  inputData: execution.inputData as never,
                  outputData: execution.outputData as never,
                  errorMessage: execution.errorMessage,
                  duration,
                },
                select: { id: true },
              });
              ids.push(created.id);
            }
            // Both partitions are persisted, but counted separately, so the response
            // can distinguish "delivered in-app" from "recorded, not sent". The
            // pending ones keep their channel, so an operator can query exactly what
            // is waiting on a transport they have not configured rather than the
            // notification being lost.
            const delivered = await persistNotifications(tx, deliverable);
            const recorded = await persistNotifications(tx, pending);
            return {
              executionIds: ids,
              notificationsDelivered: delivered,
              notificationsRecorded: recorded,
            };
          },
        );

        return {
          data: {
            ruleSetId: ruleSet.id,
            blocked: outcome.blocked,
            matchedRules: evaluation.matchedRuleIds.length,
            evaluatedRules: evaluation.evaluations.length,
            executionIds,
            effects: outcome.effects.map((effect) => ({
              type: effect.type,
              severity: effect.severity,
              blocking: effect.blocking,
              message: effect.message,
            })),
            fieldUpdates: outcome.fieldUpdates,
            notificationsDelivered,
            notificationsPending: notificationsRecorded,
            deliverySummary: describeDelivery(plans),
          },
          message: outcome.blocked
            ? `Rule set "${ruleSet.name}" rejected the record.`
            : `Rule set "${ruleSet.name}" matched ${evaluation.matchedRuleIds.length} of ${evaluation.evaluations.length} rule(s).`,
          messageKey: "action.success.executeRuleSet",
          audit: [
            auditEntry(session, {
              entityType: input.entityType,
              entityId: input.entityId,
              action: "update",
              after: {
                ruleSetId: ruleSet.id,
                matched: evaluation.matchedRuleIds.length,
                blocked: outcome.blocked,
                effects: outcome.effects.length,
              },
              reason: `Rule set "${ruleSet.name}" executed`,
            }),
          ],
        };
      },
    },
    rawInput,
  );
}

/** Creates a rule set together with its rules, conditions and actions. */
export async function createRuleSetAction(
  rawInput: unknown,
): Promise<ActionState<{ readonly id: string; readonly ruleCount: number }>> {
  return runAction(
    {
      name: "createRuleSet",
      resource: "validation_rule",
      action: "create",
      schema: ruleSetInputSchema,
      revalidate: [...PATHS],
      handler: async ({ session, input, organizationId }) => {
        const created = await prisma.ruleSet.create({
          data: {
            organizationId,
            name: input.name,
            description: input.description ?? null,
            category: input.category ?? null,
            priority: input.priority,
            isActive: input.isActive,
            rules: {
              create: input.rules.map((rule) => ({
                name: rule.name,
                description: rule.description ?? null,
                priority: rule.priority,
                isActive: rule.isActive,
                conditions: {
                  create: rule.conditions.map((condition, index) => ({
                    field: condition.field,
                    operator: condition.operator,
                    value: condition.value,
                    logicGroup: condition.logicGroup ?? "AND",
                    orderIndex: condition.orderIndex ?? index,
                  })),
                },
                actions: {
                  create: rule.actions.map((action, index) => ({
                    type: action.actionType,
                    target: action.targetField ?? null,
                    value: action.value ?? null,
                    // `message` has no column of its own; it belongs with the
                    // action's other free-form parameters.
                    parameters: (action.message
                      ? { message: action.message }
                      : {}) as never,
                    orderIndex: action.orderIndex ?? index,
                  })),
                },
              })),
            },
          },
          select: { id: true },
        });

        return {
          data: { id: created.id, ruleCount: input.rules.length },
          message: `Created rule set "${input.name}" with ${input.rules.length} rule(s).`,
          messageKey: "action.success.createRuleSet",
          audit: [
            auditEntry(session, {
              entityType: "RuleSet",
              entityId: created.id,
              action: "create",
              after: {
                name: input.name,
                category: input.category ?? null,
                ruleCount: input.rules.length,
                isActive: input.isActive,
              },
            }),
          ],
        };
      },
    },
    rawInput,
  );
}

/** Activates or deactivates a rule set without deleting its history. */
export async function setRuleSetActiveAction(
  rawInput: unknown,
): Promise<ActionState<{ readonly id: string; readonly isActive: boolean }>> {
  return runAction(
    {
      name: "setRuleSetActive",
      resource: "validation_rule",
      action: "update",
      schema: ruleSetToggleSchema,
      revalidate: [...PATHS],
      handler: async ({ session, input, organizationId }) => {
        const before = await prisma.ruleSet.findUnique({
          where: { id: input.ruleSetId },
          select: { id: true, organizationId: true, isActive: true, name: true },
        });
        if (!before || before.organizationId !== organizationId) {
          throw new NotFoundError(`Rule set ${input.ruleSetId} was not found`);
        }

        await prisma.ruleSet.update({
          where: { id: input.ruleSetId },
          data: { isActive: input.isActive },
        });

        return {
          data: { id: input.ruleSetId, isActive: input.isActive },
          message: `Rule set "${before.name}" is now ${input.isActive ? "active" : "inactive"}.`,
          messageKey: "action.success.setRuleSetActive",
          audit: [
            auditEntry(session, {
              entityType: "RuleSet",
              entityId: input.ruleSetId,
              action: "update",
              before: { isActive: before.isActive },
              after: { isActive: input.isActive },
            }),
          ],
        };
      },
    },
    rawInput,
  );
}
