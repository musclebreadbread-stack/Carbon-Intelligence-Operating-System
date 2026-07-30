/**
 * Rule actions.
 *
 * Handlers are *pure*: they return a description of the effect rather than
 * performing it. The persistence layer decides whether and how to apply the
 * effects, which keeps the rules engine testable and makes a dry run possible.
 *
 * Pure TypeScript — no framework, database or network imports.
 */

import { CalculationError } from "@/lib/core/errors";

import type { RuleActionLike, RuleEvaluation, RuleSetEvaluation } from "./evaluate";
import { type RuleContext } from "./operators";

export const RULE_ACTION_TYPES = [
  "flag",
  "reject",
  "set_field",
  "notify",
  "recalculate",
  "assign",
] as const;
export type RuleActionType = (typeof RULE_ACTION_TYPES)[number];

export type RuleActionEffect = {
  readonly ruleId: string;
  readonly ruleName: string;
  readonly actionId: string | null;
  readonly type: RuleActionType;
  readonly orderIndex: number;
  /** Field, entity or channel the effect applies to. */
  readonly target: string | null;
  readonly value: string | null;
  readonly parameters: Readonly<Record<string, unknown>>;
  /** `true` when the effect blocks the record from being accepted. */
  readonly blocking: boolean;
  readonly severity: "info" | "warning" | "error";
  readonly message: string;
};

export function isRuleActionType(value: string): value is RuleActionType {
  return (RULE_ACTION_TYPES as readonly string[]).includes(value);
}

type HandlerInput = {
  readonly action: RuleActionLike;
  readonly evaluation: RuleEvaluation;
  readonly orderIndex: number;
  readonly context: RuleContext;
};

type Handler = (input: HandlerInput) => RuleActionEffect;

const base = (
  input: HandlerInput,
  type: RuleActionType,
  overrides: {
    readonly blocking: boolean;
    readonly severity: RuleActionEffect["severity"];
    readonly message: string;
  },
): RuleActionEffect => ({
  ruleId: input.evaluation.ruleId,
  ruleName: input.evaluation.ruleName,
  actionId: input.action.id ?? null,
  type,
  orderIndex: input.orderIndex,
  target: input.action.target ?? null,
  value: input.action.value ?? null,
  parameters: input.action.parameters ?? {},
  ...overrides,
});

const HANDLERS: Readonly<Record<RuleActionType, Handler>> = {
  flag: (input) =>
    base(input, "flag", {
      blocking: false,
      severity: "warning",
      message:
        input.action.value ??
        `Flagged by rule "${input.evaluation.ruleName}": ${input.evaluation.explanation}`,
    }),

  reject: (input) =>
    base(input, "reject", {
      blocking: true,
      severity: "error",
      message:
        input.action.value ??
        `Rejected by rule "${input.evaluation.ruleName}": ${input.evaluation.explanation}`,
    }),

  set_field: (input) => {
    if (!input.action.target) {
      throw new CalculationError("A set_field action requires a target field", {
        ruleId: input.evaluation.ruleId,
      });
    }
    return base(input, "set_field", {
      blocking: false,
      severity: "info",
      message: `Set ${input.action.target} = ${input.action.value ?? "null"} (rule "${input.evaluation.ruleName}")`,
    });
  },

  notify: (input) =>
    base(input, "notify", {
      blocking: false,
      severity: "info",
      message:
        input.action.value ??
        `Notify ${input.action.target ?? "the assigned owner"} about rule "${input.evaluation.ruleName}"`,
    }),

  recalculate: (input) =>
    base(input, "recalculate", {
      blocking: false,
      severity: "info",
      message: `Recalculation requested for ${input.action.target ?? "the affected calculation"} by rule "${input.evaluation.ruleName}"`,
    }),

  assign: (input) => {
    if (!input.action.target && !input.action.value) {
      throw new CalculationError(
        "An assign action requires a target or a value naming the assignee",
        { ruleId: input.evaluation.ruleId },
      );
    }
    return base(input, "assign", {
      blocking: false,
      severity: "info",
      message: `Assigned to ${input.action.value ?? input.action.target} by rule "${input.evaluation.ruleName}"`,
    });
  },
};

/** Builds the effects of a matched rule's actions, in `orderIndex` order. */
export function buildRuleActionEffects(
  evaluation: RuleEvaluation,
  actions: readonly RuleActionLike[],
  context: RuleContext = {},
): readonly RuleActionEffect[] {
  if (!evaluation.matched) return [];

  return [...actions]
    .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0))
    .map((action, index) => {
      if (!isRuleActionType(action.type)) {
        throw new CalculationError(`Unsupported rule action type: ${action.type}`, {
          type: action.type,
          ruleId: evaluation.ruleId,
        });
      }
      return HANDLERS[action.type]({
        action,
        evaluation,
        orderIndex: action.orderIndex ?? index,
        context,
      });
    });
}

/** Plain object shaped to `RuleExecution`. */
export type RuleExecutionRecord = {
  readonly ruleId: string;
  readonly status: string;
  readonly triggerType: string | null;
  readonly triggeredBy: string | null;
  readonly inputData: Readonly<Record<string, unknown>>;
  readonly outputData: Readonly<Record<string, unknown>>;
  readonly errorMessage: string | null;
  readonly executedAt?: Date;
};

export function buildRuleExecution(
  evaluation: RuleEvaluation,
  effects: readonly RuleActionEffect[],
  options: {
    readonly context?: RuleContext;
    readonly triggerType?: string;
    readonly triggeredBy?: string;
    readonly executedAt?: Date;
  } = {},
): RuleExecutionRecord {
  return {
    ruleId: evaluation.ruleId,
    status:
      evaluation.status === "error"
        ? "error"
        : evaluation.status === "skipped"
          ? "skipped"
          : evaluation.matched
            ? "matched"
            : "not_matched",
    triggerType: options.triggerType ?? null,
    triggeredBy: options.triggeredBy ?? null,
    inputData: { context: options.context ?? {} },
    outputData: {
      matched: evaluation.matched,
      explanation: evaluation.explanation,
      groups: evaluation.groups.map((group) => ({
        logicGroup: group.logicGroup,
        matched: group.matched,
      })),
      effects: effects.map((effect) => ({
        type: effect.type,
        target: effect.target,
        value: effect.value,
        severity: effect.severity,
        blocking: effect.blocking,
        message: effect.message,
      })),
    },
    errorMessage: evaluation.errorMessage,
    ...(options.executedAt ? { executedAt: options.executedAt } : {}),
  };
}

export type RuleSetOutcome = {
  readonly effects: readonly RuleActionEffect[];
  readonly executions: readonly RuleExecutionRecord[];
  /** `true` when any matched rule produced a blocking effect. */
  readonly blocked: boolean;
  /** Field assignments requested by `set_field` effects, last write winning. */
  readonly fieldUpdates: Readonly<Record<string, string | null>>;
};

/** Collects the effects of every matched rule in a rule-set evaluation. */
export function applyRuleSetActions(
  ruleSet: { readonly rules: readonly { readonly id: string; readonly actions?: readonly RuleActionLike[] }[] },
  evaluation: RuleSetEvaluation,
  context: RuleContext = {},
  options: { readonly triggerType?: string; readonly triggeredBy?: string; readonly executedAt?: Date } = {},
): RuleSetOutcome {
  const actionsByRule = new Map(
    ruleSet.rules.map((rule) => [rule.id, rule.actions ?? []]),
  );

  const effects: RuleActionEffect[] = [];
  const executions: RuleExecutionRecord[] = [];

  for (const ruleEvaluation of evaluation.evaluations) {
    const ruleEffects = buildRuleActionEffects(
      ruleEvaluation,
      actionsByRule.get(ruleEvaluation.ruleId) ?? [],
      context,
    );
    effects.push(...ruleEffects);
    executions.push(buildRuleExecution(ruleEvaluation, ruleEffects, { context, ...options }));
  }

  const fieldUpdates: Record<string, string | null> = {};
  for (const effect of effects) {
    if (effect.type === "set_field" && effect.target) {
      fieldUpdates[effect.target] = effect.value;
    }
  }

  return {
    effects,
    executions,
    blocked: effects.some((effect) => effect.blocking),
    fieldUpdates,
  };
}
