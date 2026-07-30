import { describe, expect, it } from "vitest";

import { CalculationError } from "@/lib/core/errors";

import {
  RULE_ACTION_TYPES,
  applyRuleSetActions,
  buildRuleActionEffects,
  buildRuleExecution,
  isRuleActionType,
  type RuleActionType,
} from "./actions";
import { evaluateRule, evaluateRuleSet, type RuleLike, type RuleSetLike } from "./evaluate";

const context = { scope: "SCOPE_1", quantity: 1500, country: "KR" };

const matchingRule = (actions: RuleLike["actions"]): RuleLike => ({
  id: "r-match",
  name: "Outlier check",
  conditions: [{ field: "quantity", operator: "GREATER_THAN", value: "1000" }],
  actions,
});

describe("action type registry", () => {
  it("recognises exactly the six supported action types", () => {
    expect([...RULE_ACTION_TYPES]).toEqual([
      "flag",
      "reject",
      "set_field",
      "notify",
      "recalculate",
      "assign",
    ]);
    expect(isRuleActionType("flag")).toBe(true);
    expect(isRuleActionType("delete_everything")).toBe(false);
  });
});

describe("buildRuleActionEffects", () => {
  it("produces no effects for a rule that did not match", () => {
    const evaluation = evaluateRule(
      {
        id: "r-nomatch",
        name: "No match",
        conditions: [{ field: "quantity", operator: "GREATER_THAN", value: "9999" }],
      },
      context,
    );
    expect(buildRuleActionEffects(evaluation, [{ type: "flag" }])).toEqual([]);
  });

  it("builds one effect per action, in orderIndex order", () => {
    const rule = matchingRule([
      { id: "a2", type: "notify", target: "sustainability@example.com", orderIndex: 2 },
      { id: "a1", type: "flag", value: "Quantity looks like an outlier", orderIndex: 1 },
    ]);
    const effects = buildRuleActionEffects(evaluateRule(rule, context), rule.actions ?? []);
    expect(effects.map((e) => e.actionId)).toEqual(["a1", "a2"]);
    expect(effects.map((e) => e.orderIndex)).toEqual([1, 2]);
    expect(effects[0].message).toBe("Quantity looks like an outlier");
  });

  it("classifies severity and blocking per action type", () => {
    const expectations: Readonly<
      Record<RuleActionType, { severity: string; blocking: boolean }>
    > = {
      flag: { severity: "warning", blocking: false },
      reject: { severity: "error", blocking: true },
      set_field: { severity: "info", blocking: false },
      notify: { severity: "info", blocking: false },
      recalculate: { severity: "info", blocking: false },
      assign: { severity: "info", blocking: false },
    };

    for (const type of RULE_ACTION_TYPES) {
      const rule = matchingRule([{ type, target: "dataQuality", value: "LOW" }]);
      const [effect] = buildRuleActionEffects(evaluateRule(rule, context), rule.actions ?? []);
      expect(effect.type, type).toBe(type);
      expect(effect.severity, type).toBe(expectations[type].severity);
      expect(effect.blocking, type).toBe(expectations[type].blocking);
      expect(effect.message.length, type).toBeGreaterThan(0);
    }
  });

  it("falls back to the rule explanation when an action carries no message", () => {
    const rule = matchingRule([{ type: "flag" }]);
    const [effect] = buildRuleActionEffects(evaluateRule(rule, context), rule.actions ?? []);
    expect(effect.message).toContain('Flagged by rule "Outlier check"');
    expect(effect.message).toContain("quantity GREATER_THAN 1000");
  });

  it("passes action parameters through untouched", () => {
    const rule = matchingRule([
      { type: "notify", target: "slack", parameters: { channel: "#esg", mention: true } },
    ]);
    const [effect] = buildRuleActionEffects(evaluateRule(rule, context), rule.actions ?? []);
    expect(effect.parameters).toEqual({ channel: "#esg", mention: true });
  });

  it("requires a target for set_field and an assignee for assign", () => {
    const noTarget = matchingRule([{ type: "set_field", value: "LOW" }]);
    expect(() =>
      buildRuleActionEffects(evaluateRule(noTarget, context), noTarget.actions ?? []),
    ).toThrow(/requires a target field/);

    const noAssignee = matchingRule([{ type: "assign" }]);
    expect(() =>
      buildRuleActionEffects(evaluateRule(noAssignee, context), noAssignee.actions ?? []),
    ).toThrow(/naming the assignee/);
  });

  it("rejects an unsupported action type", () => {
    const rule = matchingRule([{ type: "drop_table" }]);
    expect(() =>
      buildRuleActionEffects(evaluateRule(rule, context), rule.actions ?? []),
    ).toThrow(CalculationError);
  });
});

describe("buildRuleExecution", () => {
  it("shapes a matched rule to the RuleExecution columns", () => {
    const rule = matchingRule([{ type: "flag", value: "Outlier" }]);
    const evaluation = evaluateRule(rule, context);
    const effects = buildRuleActionEffects(evaluation, rule.actions ?? []);
    const executedAt = new Date("2024-06-15T00:00:00.000Z");
    const record = buildRuleExecution(evaluation, effects, {
      context,
      triggerType: "activity-data-import",
      triggeredBy: "user-1",
      executedAt,
    });

    expect(record.ruleId).toBe("r-match");
    expect(record.status).toBe("matched");
    expect(record.triggerType).toBe("activity-data-import");
    expect(record.triggeredBy).toBe("user-1");
    expect(record.inputData).toEqual({ context });
    expect(record.errorMessage).toBeNull();
    expect(record.executedAt).toBe(executedAt);
    expect(record.outputData).toMatchObject({ matched: true });
    expect(
      (record.outputData as { effects: { type: string }[] }).effects[0].type,
    ).toBe("flag");
  });

  it("maps not-matched, skipped and error states", () => {
    const notMatched = evaluateRule(
      {
        id: "r",
        name: "n",
        conditions: [{ field: "quantity", operator: "GREATER_THAN", value: "9999" }],
      },
      context,
    );
    expect(buildRuleExecution(notMatched, []).status).toBe("not_matched");

    const skipped = evaluateRule(
      { id: "r", name: "n", isActive: false, conditions: [] },
      context,
    );
    expect(buildRuleExecution(skipped, []).status).toBe("skipped");

    const errored = evaluateRule(
      {
        id: "r",
        name: "n",
        conditions: [{ field: "quantity", operator: "BETWEEN", value: "x" }],
      },
      context,
    );
    const record = buildRuleExecution(errored, []);
    expect(record.status).toBe("error");
    expect(record.errorMessage).toBeTruthy();
  });

  it("omits executedAt so the database default applies", () => {
    const evaluation = evaluateRule(matchingRule([]), context);
    expect(buildRuleExecution(evaluation, [])).not.toHaveProperty("executedAt");
  });
});

describe("applyRuleSetActions", () => {
  const ruleSet: RuleSetLike = {
    id: "rs-1",
    name: "Import validation",
    rules: [
      {
        id: "r-reject",
        name: "Reject negative quantities",
        priority: 10,
        conditions: [{ field: "quantity", operator: "LESS_THAN", value: "0" }],
        actions: [{ type: "reject", value: "Quantity cannot be negative" }],
      },
      {
        id: "r-flag",
        name: "Flag large quantities",
        priority: 5,
        conditions: [{ field: "quantity", operator: "GREATER_THAN", value: "1000" }],
        actions: [
          { type: "flag", value: "Large quantity", orderIndex: 0 },
          { type: "set_field", target: "dataQuality", value: "LOW", orderIndex: 1 },
          { type: "notify", target: "reviewer", orderIndex: 2 },
        ],
      },
      {
        id: "r-korea",
        name: "Assign Korean records",
        priority: 1,
        conditions: [{ field: "country", operator: "EQUALS", value: "KR" }],
        actions: [{ type: "assign", value: "kr-team" }],
      },
    ],
  };

  it("collects the effects of every matched rule and one execution per rule", () => {
    const evaluation = evaluateRuleSet(ruleSet, context);
    const outcome = applyRuleSetActions(ruleSet, evaluation, context, {
      triggerType: "import",
    });

    expect(outcome.executions).toHaveLength(3);
    expect(outcome.executions.map((e) => e.status)).toEqual([
      "not_matched", // r-reject
      "matched", // r-flag
      "matched", // r-korea
    ]);
    expect(outcome.effects.map((e) => e.type)).toEqual([
      "flag",
      "set_field",
      "notify",
      "assign",
    ]);
    expect(outcome.blocked).toBe(false);
  });

  it("reports blocked when a reject action fires", () => {
    const negativeContext = { ...context, quantity: -5 };
    const evaluation = evaluateRuleSet(ruleSet, negativeContext);
    const outcome = applyRuleSetActions(ruleSet, evaluation, negativeContext);
    expect(outcome.blocked).toBe(true);
    expect(outcome.effects.some((e) => e.type === "reject")).toBe(true);
  });

  it("collapses set_field effects into a field-update map", () => {
    const evaluation = evaluateRuleSet(ruleSet, context);
    const outcome = applyRuleSetActions(ruleSet, evaluation, context);
    expect(outcome.fieldUpdates).toEqual({ dataQuality: "LOW" });
  });

  it("produces no effects and no updates when nothing matches", () => {
    const quiet = { scope: "SCOPE_2_LOCATION", quantity: 10, country: "JP" };
    const outcome = applyRuleSetActions(ruleSet, evaluateRuleSet(ruleSet, quiet), quiet);
    expect(outcome.effects).toHaveLength(0);
    expect(outcome.fieldUpdates).toEqual({});
    expect(outcome.blocked).toBe(false);
  });
});
