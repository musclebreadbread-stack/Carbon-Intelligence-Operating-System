/**
 * Validation schemas for the rules engine.
 *
 * `RuleCondition.value` is a single `String` column that means different things
 * per operator, so the parse rules live here: `BETWEEN` needs two numeric bounds,
 * `IN`/`NOT_IN` need a non-empty list, the ordering operators need a number, and
 * `IS_NULL`/`IS_NOT_NULL` must not carry a value at all. Getting this wrong is
 * the difference between a rule that never fires and a rule that always fires.
 */

import { z } from "zod";

import { RULE_ACTION_TYPES } from "@/lib/domain/rules/actions";
import { parseList, parseRange, toNumber } from "@/lib/domain/rules/operators";

import {
  descriptionSchema,
  idSchema,
  nameSchema,
  ruleOperatorSchema,
} from "./common";

export const ruleActionTypeSchema = z.enum(RULE_ACTION_TYPES);

const NUMERIC_OPERATORS = [
  "GREATER_THAN",
  "LESS_THAN",
  "GREATER_THAN_OR_EQUAL",
  "LESS_THAN_OR_EQUAL",
] as const;

const VALUELESS_OPERATORS = ["IS_NULL", "IS_NOT_NULL"] as const;

export const ruleConditionInputSchema = z
  .object({
    field: z.string().trim().min(1).max(120),
    operator: ruleOperatorSchema,
    /** Empty string is the canonical "no value" for the null operators. */
    value: z.string().max(1000).default(""),
    logicGroup: z.string().trim().max(40).default("AND"),
    orderIndex: z.number().int().min(0).default(0),
  })
  .superRefine((condition, ctx) => {
    const { operator, value } = condition;

    if ((VALUELESS_OPERATORS as readonly string[]).includes(operator)) {
      if (value.trim().length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["value"],
          message: `${operator} does not take a value`,
        });
      }
      return;
    }

    if (value.trim().length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["value"],
        message: `${operator} requires a value`,
      });
      return;
    }

    if ((NUMERIC_OPERATORS as readonly string[]).includes(operator)) {
      if (toNumber(value) === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["value"],
          message: `${operator} requires a numeric value`,
        });
      }
      return;
    }

    if (operator === "BETWEEN") {
      try {
        parseRange(value);
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["value"],
          message: 'BETWEEN requires two numeric bounds, as "min,max" or "min..max"',
        });
      }
      return;
    }

    if (operator === "IN" || operator === "NOT_IN") {
      if (parseList(value).length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["value"],
          message: `${operator} requires a non-empty list`,
        });
      }
    }
  });
export type RuleConditionInput = z.infer<typeof ruleConditionInputSchema>;

export const ruleActionInputSchema = z
  .object({
    actionType: ruleActionTypeSchema,
    targetField: z.string().trim().max(120).nullish(),
    /** `set_field` writes this; the other action types treat it as a payload. */
    value: z.string().max(1000).nullish(),
    message: z.string().trim().max(500).nullish(),
    orderIndex: z.number().int().min(0).default(0),
  })
  .superRefine((action, ctx) => {
    if (action.actionType === "set_field") {
      if (!action.targetField) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["targetField"],
          message: "set_field requires a targetField",
        });
      }
      if (action.value === null || action.value === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["value"],
          message: "set_field requires a value",
        });
      }
    }
    if (action.actionType === "assign" && !action.value) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["value"],
        message: "assign requires an assignee in value",
      });
    }
  });
export type RuleActionInput = z.infer<typeof ruleActionInputSchema>;

export const ruleInputSchema = z.object({
  ruleSetId: idSchema.optional(),
  name: nameSchema,
  description: descriptionSchema.nullish(),
  priority: z.number().int().min(0).max(1000).default(0),
  isActive: z.boolean().default(true),
  conditions: z.array(ruleConditionInputSchema).min(1, "A rule needs at least one condition"),
  actions: z.array(ruleActionInputSchema).min(1, "A rule needs at least one action"),
});
export type RuleInput = z.infer<typeof ruleInputSchema>;

export const ruleSetInputSchema = z.object({
  organizationId: idSchema,
  name: nameSchema,
  description: descriptionSchema.nullish(),
  category: z.string().trim().max(80).nullish(),
  priority: z.number().int().min(0).max(1000).default(0),
  isActive: z.boolean().default(true),
  rules: z.array(ruleInputSchema).default([]),
});
export type RuleSetInput = z.infer<typeof ruleSetInputSchema>;

/** Payload for `executeRuleSetAction`. */
export const executeRuleSetInputSchema = z.object({
  ruleSetId: idSchema,
  organizationId: idSchema,
  entityType: z.string().trim().min(1).max(60),
  entityId: idSchema,
  /**
   * The evaluation context. Values are the primitives the operator handlers
   * accept; anything else would be coerced to `String(value)` and compare wrongly.
   */
  context: z.record(
    z.union([
      z.string(),
      z.number(),
      z.boolean(),
      z.coerce.date(),
      z.array(z.union([z.string(), z.number()])),
      z.null(),
    ]),
  ),
});
export type ExecuteRuleSetInput = z.infer<typeof executeRuleSetInputSchema>;
