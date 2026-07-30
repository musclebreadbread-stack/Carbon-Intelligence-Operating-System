/**
 * Rule evaluation.
 *
 * `RuleCondition.logicGroup` is a free-text column defaulting to `"AND"`. It is
 * interpreted as a *group label*: conditions sharing a label are combined with
 * AND, and the groups are then combined with OR. The literal labels `"AND"` and
 * `"OR"` keep their intuitive meaning:
 *
 *  - conditions labelled `"AND"` (the default) all have to hold
 *  - conditions labelled `"OR"` form one group of which any one suffices
 *  - any other label, e.g. `"g1"`, forms a named group: all of its conditions
 *    must hold, and satisfying any one group satisfies the rule
 *
 * Within a group, conditions are evaluated in `orderIndex` order, which makes
 * the emitted evaluation log deterministic and readable.
 *
 * Pure TypeScript — no framework, database or network imports.
 */

import type { RuleOperator } from "@/lib/core/enums";

import { applyOperator, readField, type RuleContext, type RuleContextValue } from "./operators";

/** Structural mirror of `RuleCondition`. */
export type RuleConditionLike = {
  readonly id?: string;
  readonly field: string;
  readonly operator: RuleOperator;
  readonly value: string;
  readonly logicGroup?: string | null;
  readonly orderIndex?: number;
};

/** Structural mirror of `RuleAction`. */
export type RuleActionLike = {
  readonly id?: string;
  readonly type: string;
  readonly target?: string | null;
  readonly value?: string | null;
  readonly parameters?: Readonly<Record<string, unknown>> | null;
  readonly orderIndex?: number;
};

/** Structural mirror of `Rule`. */
export type RuleLike = {
  readonly id: string;
  readonly name: string;
  readonly type?: string | null;
  readonly isActive?: boolean;
  readonly priority?: number;
  readonly conditions: readonly RuleConditionLike[];
  readonly actions?: readonly RuleActionLike[];
};

/** Structural mirror of `RuleSet`. */
export type RuleSetLike = {
  readonly id: string;
  readonly name: string;
  readonly category?: string | null;
  readonly isActive?: boolean;
  readonly priority?: number;
  readonly rules: readonly RuleLike[];
};

export type ConditionEvaluation = {
  readonly conditionId: string | null;
  readonly field: string;
  readonly operator: RuleOperator;
  readonly expected: string;
  readonly actual: RuleContextValue;
  readonly matched: boolean;
  readonly logicGroup: string;
  readonly orderIndex: number;
};

export type GroupEvaluation = {
  readonly logicGroup: string;
  readonly matched: boolean;
  readonly conditions: readonly ConditionEvaluation[];
};

export type RuleEvaluation = {
  readonly ruleId: string;
  readonly ruleName: string;
  readonly matched: boolean;
  /** `"skipped"` when the rule is inactive, otherwise `"success"` / `"error"`. */
  readonly status: "success" | "skipped" | "error";
  readonly priority: number;
  readonly groups: readonly GroupEvaluation[];
  readonly conditions: readonly ConditionEvaluation[];
  readonly errorMessage: string | null;
  /** Human-readable justification, for `RuleExecution.outputData`. */
  readonly explanation: string;
};

const ORDER = (condition: RuleConditionLike): number => condition.orderIndex ?? 0;

function groupLabel(condition: RuleConditionLike): string {
  const label = condition.logicGroup?.trim();
  return label && label.length > 0 ? label : "AND";
}

/**
 * Evaluates one rule against a context.
 *
 * A rule with no conditions never matches: an unconditional rule would fire on
 * every record, which is almost always a data-entry mistake rather than intent.
 */
export function evaluateRule(rule: RuleLike, context: RuleContext): RuleEvaluation {
  const priority = rule.priority ?? 0;

  if (rule.isActive === false) {
    return {
      ruleId: rule.id,
      ruleName: rule.name,
      matched: false,
      status: "skipped",
      priority,
      groups: [],
      conditions: [],
      errorMessage: null,
      explanation: `Rule "${rule.name}" is inactive and was not evaluated.`,
    };
  }

  if (rule.conditions.length === 0) {
    return {
      ruleId: rule.id,
      ruleName: rule.name,
      matched: false,
      status: "error",
      priority,
      groups: [],
      conditions: [],
      errorMessage: "Rule has no conditions",
      explanation: `Rule "${rule.name}" has no conditions and therefore cannot match.`,
    };
  }

  const buckets = new Map<string, RuleConditionLike[]>();
  for (const condition of [...rule.conditions].sort((a, b) => ORDER(a) - ORDER(b))) {
    const label = groupLabel(condition);
    const bucket = buckets.get(label);
    if (bucket) bucket.push(condition);
    else buckets.set(label, [condition]);
  }

  const allConditions: ConditionEvaluation[] = [];
  const groups: GroupEvaluation[] = [];
  let errorMessage: string | null = null;

  for (const [label, conditions] of buckets) {
    const evaluated: ConditionEvaluation[] = conditions.map((condition) => {
      const actual = readField(context, condition.field);
      let matched = false;
      try {
        matched = applyOperator(condition.operator, actual, condition.value);
      } catch (error) {
        errorMessage = error instanceof Error ? error.message : String(error);
      }
      return {
        conditionId: condition.id ?? null,
        field: condition.field,
        operator: condition.operator,
        expected: condition.value,
        actual,
        matched,
        logicGroup: label,
        orderIndex: ORDER(condition),
      };
    });

    allConditions.push(...evaluated);
    // Conditions labelled OR are satisfied by any one of them; every other
    // group requires all of its conditions.
    const matched =
      label.toUpperCase() === "OR"
        ? evaluated.some((entry) => entry.matched)
        : evaluated.every((entry) => entry.matched);
    groups.push({ logicGroup: label, matched, conditions: evaluated });
  }

  const matched = errorMessage === null && groups.some((group) => group.matched);
  const matchedGroups = groups.filter((group) => group.matched).map((group) => group.logicGroup);

  return {
    ruleId: rule.id,
    ruleName: rule.name,
    matched,
    status: errorMessage === null ? "success" : "error",
    priority,
    groups,
    conditions: allConditions,
    errorMessage,
    explanation:
      errorMessage !== null
        ? `Rule "${rule.name}" could not be evaluated: ${errorMessage}.`
        : matched
          ? `Rule "${rule.name}" matched via group(s) ${matchedGroups.join(", ")}: ${allConditions
              .filter((entry) => entry.matched)
              .map((entry) => `${entry.field} ${entry.operator} ${entry.expected}`)
              .join("; ")}.`
          : `Rule "${rule.name}" did not match: ${allConditions
              .filter((entry) => !entry.matched)
              .map(
                (entry) =>
                  `${entry.field} (${describeActual(entry.actual)}) failed ${entry.operator} ${entry.expected}`,
              )
              .join("; ")}.`,
  };
}

function describeActual(value: RuleContextValue): string {
  if (value === undefined) return "missing";
  if (value === null) return "null";
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return `[${value.join(", ")}]`;
  return String(value);
}

export type RuleSetEvaluation = {
  readonly ruleSetId: string;
  readonly ruleSetName: string;
  readonly status: "success" | "skipped" | "error";
  /** Evaluations in descending `priority`, then declaration order. */
  readonly evaluations: readonly RuleEvaluation[];
  readonly matchedRuleIds: readonly string[];
  /** The highest-priority rule that matched, or `null`. */
  readonly firstMatch: RuleEvaluation | null;
};

/**
 * Evaluates every active rule in a rule set, highest `priority` first.
 *
 * All matching rules are reported rather than stopping at the first: a
 * validation pass needs the complete set of violations, and `firstMatch` covers
 * the "highest-priority wins" case.
 */
export function evaluateRuleSet(
  ruleSet: RuleSetLike,
  context: RuleContext,
): RuleSetEvaluation {
  if (ruleSet.isActive === false) {
    return {
      ruleSetId: ruleSet.id,
      ruleSetName: ruleSet.name,
      status: "skipped",
      evaluations: [],
      matchedRuleIds: [],
      firstMatch: null,
    };
  }

  const ordered = ruleSet.rules
    .map((rule, index) => ({ rule, index }))
    .sort((a, b) => {
      const byPriority = (b.rule.priority ?? 0) - (a.rule.priority ?? 0);
      return byPriority !== 0 ? byPriority : a.index - b.index;
    })
    .map(({ rule }) => rule);

  const evaluations = ordered.map((rule) => evaluateRule(rule, context));
  const matched = evaluations.filter((evaluation) => evaluation.matched);

  return {
    ruleSetId: ruleSet.id,
    ruleSetName: ruleSet.name,
    status: evaluations.some((evaluation) => evaluation.status === "error")
      ? "error"
      : "success",
    evaluations,
    matchedRuleIds: matched.map((evaluation) => evaluation.ruleId),
    firstMatch: matched[0] ?? null,
  };
}
