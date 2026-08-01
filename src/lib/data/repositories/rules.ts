/**
 * Validation-rule repository.
 *
 * Rule sets are returned in the `RuleSetLike` shape the evaluation engine takes, so
 * a rule set loaded from the database and one loaded from the fixtures execute
 * through exactly the same code path.
 */

import type { RuleOperator } from "@/lib/core/enums";
import type { RuleSetLike } from "@/lib/domain/rules/evaluate";
import { prisma } from "@/lib/prisma";

import { withDb } from "../db";
import { DEMO_RULE_SETS } from "../demo";

export type RuleSetRow = RuleSetLike & {
  readonly organizationId: string;
  readonly description: string;
};

export async function listRuleSets(
  organizationId: string,
  options: { readonly category?: string; readonly activeOnly?: boolean } = {},
): Promise<readonly RuleSetRow[]> {
  return withDb<readonly RuleSetRow[]>(
    async () => {
      const rows = await prisma.ruleSet.findMany({
        where: {
          organizationId,
          ...(options.category ? { category: options.category } : {}),
          ...(options.activeOnly ? { isActive: true } : {}),
        },
        orderBy: [{ priority: "desc" }, { name: "asc" }],
        include: {
          rules: {
            orderBy: [{ priority: "desc" }, { name: "asc" }],
            include: {
              conditions: { orderBy: { orderIndex: "asc" } },
              actions: { orderBy: { orderIndex: "asc" } },
            },
          },
        },
      });
      return rows.map((row) => ({
        id: row.id,
        organizationId: row.organizationId,
        name: row.name,
        description: row.description ?? "",
        category: row.category,
        isActive: row.isActive,
        priority: row.priority,
        rules: row.rules.map((rule) => ({
          id: rule.id,
          name: rule.name,
          type: rule.type,
          isActive: rule.isActive,
          priority: rule.priority,
          conditions: rule.conditions.map((condition) => ({
            id: condition.id,
            field: condition.field,
            operator: condition.operator as RuleOperator,
            value: condition.value,
            logicGroup: condition.logicGroup,
            orderIndex: condition.orderIndex,
          })),
          actions: rule.actions.map((action) => ({
            id: action.id,
            type: action.type,
            target: action.target,
            value: action.value,
            orderIndex: action.orderIndex,
          })),
        })),
      }));
    },
    () =>
      DEMO_RULE_SETS.filter(
        (set) =>
          set.organizationId === organizationId &&
          (!options.category || set.category === options.category) &&
          (!options.activeOnly || set.isActive !== false),
      ),
  );
}

export async function getRuleSet(
  organizationId: string,
  ruleSetId: string,
): Promise<RuleSetRow | null> {
  const sets = await listRuleSets(organizationId);
  return sets.find((set) => set.id === ruleSetId) ?? null;
}

export type RuleExecutionRow = {
  readonly id: string;
  readonly ruleId: string;
  readonly status: string;
  readonly triggerType: string | null;
  readonly triggeredBy: string | null;
  readonly duration: number | null;
  readonly errorMessage: string | null;
  readonly executedAt: Date;
  readonly outputData: string | null;
};

/** Recorded rule executions; empty in demo mode because nothing is persisted. */
export async function listRuleExecutions(
  organizationId: string,
  options: { readonly limit?: number } = {},
): Promise<readonly RuleExecutionRow[]> {
  return withDb<readonly RuleExecutionRow[]>(
    async () => {
      const rows = await prisma.ruleExecution.findMany({
        where: { rule: { ruleSet: { organizationId } } },
        orderBy: { executedAt: "desc" },
        take: options.limit ?? 100,
      });
      return rows.map((row) => ({
        id: row.id,
        ruleId: row.ruleId,
        status: row.status,
        triggerType: row.triggerType,
        triggeredBy: row.triggeredBy,
        duration: row.duration,
        errorMessage: row.errorMessage,
        executedAt: row.executedAt,
        outputData: row.outputData === null ? null : JSON.stringify(row.outputData),
      }));
    },
    () => [],
  );
}
