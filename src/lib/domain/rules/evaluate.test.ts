import { describe, expect, it } from "vitest";

import { evaluateRule, evaluateRuleSet, type RuleLike, type RuleSetLike } from "./evaluate";
import type { RuleContext } from "./operators";

const context: RuleContext = {
  scope: "SCOPE_1",
  quantity: 1500,
  country: "KR",
  unit: "kWh",
  supplierId: null,
};

const rule = (overrides: Partial<RuleLike> & { id: string }): RuleLike => ({
  name: `rule-${overrides.id}`,
  conditions: [],
  ...overrides,
});

describe("evaluateRule", () => {
  it("requires every AND condition to hold", () => {
    const evaluation = evaluateRule(
      rule({
        id: "r1",
        conditions: [
          { field: "scope", operator: "EQUALS", value: "SCOPE_1", orderIndex: 0 },
          { field: "quantity", operator: "GREATER_THAN", value: "1000", orderIndex: 1 },
        ],
      }),
      context,
    );
    expect(evaluation.matched).toBe(true);
    expect(evaluation.status).toBe("success");
    expect(evaluation.conditions.map((c) => c.matched)).toEqual([true, true]);
    expect(evaluation.explanation).toContain("matched via group(s) AND");
  });

  it("fails an AND group when any condition fails", () => {
    const evaluation = evaluateRule(
      rule({
        id: "r2",
        conditions: [
          { field: "scope", operator: "EQUALS", value: "SCOPE_1" },
          { field: "quantity", operator: "GREATER_THAN", value: "5000" },
        ],
      }),
      context,
    );
    expect(evaluation.matched).toBe(false);
    expect(evaluation.explanation).toContain("did not match");
    expect(evaluation.explanation).toContain("quantity (1500) failed GREATER_THAN 5000");
  });

  it("satisfies an OR group from any single condition", () => {
    const evaluation = evaluateRule(
      rule({
        id: "r3",
        conditions: [
          { field: "country", operator: "EQUALS", value: "JP", logicGroup: "OR" },
          { field: "country", operator: "EQUALS", value: "KR", logicGroup: "OR" },
        ],
      }),
      context,
    );
    expect(evaluation.matched).toBe(true);
    expect(evaluation.groups).toHaveLength(1);
    expect(evaluation.groups[0].logicGroup).toBe("OR");
  });

  it("combines named groups with OR and their members with AND", () => {
    const evaluation = evaluateRule(
      rule({
        id: "r4",
        conditions: [
          // Group g1: Korean Scope 1 over 5000 → fails on quantity.
          { field: "country", operator: "EQUALS", value: "KR", logicGroup: "g1", orderIndex: 0 },
          { field: "quantity", operator: "GREATER_THAN", value: "5000", logicGroup: "g1", orderIndex: 1 },
          // Group g2: any Scope 1 in kWh → holds.
          { field: "scope", operator: "EQUALS", value: "SCOPE_1", logicGroup: "g2", orderIndex: 2 },
          { field: "unit", operator: "EQUALS", value: "kWh", logicGroup: "g2", orderIndex: 3 },
        ],
      }),
      context,
    );
    expect(evaluation.matched).toBe(true);
    const groups = new Map(evaluation.groups.map((g) => [g.logicGroup, g.matched]));
    expect(groups.get("g1")).toBe(false);
    expect(groups.get("g2")).toBe(true);
    expect(evaluation.explanation).toContain("group(s) g2");
  });

  it("does not match when every named group fails", () => {
    const evaluation = evaluateRule(
      rule({
        id: "r5",
        conditions: [
          { field: "country", operator: "EQUALS", value: "JP", logicGroup: "g1" },
          { field: "unit", operator: "EQUALS", value: "L", logicGroup: "g2" },
        ],
      }),
      context,
    );
    expect(evaluation.matched).toBe(false);
  });

  it("evaluates conditions inside a group in orderIndex order", () => {
    const evaluation = evaluateRule(
      rule({
        id: "r6",
        conditions: [
          { id: "c-third", field: "unit", operator: "IS_NOT_NULL", value: "", orderIndex: 30 },
          { id: "c-first", field: "scope", operator: "IS_NOT_NULL", value: "", orderIndex: 10 },
          { id: "c-second", field: "country", operator: "IS_NOT_NULL", value: "", orderIndex: 20 },
        ],
      }),
      context,
    );
    expect(evaluation.conditions.map((c) => c.conditionId)).toEqual([
      "c-first",
      "c-second",
      "c-third",
    ]);
  });

  it("defaults a blank or missing logicGroup to AND", () => {
    const evaluation = evaluateRule(
      rule({
        id: "r7",
        conditions: [
          { field: "scope", operator: "EQUALS", value: "SCOPE_1", logicGroup: null },
          { field: "unit", operator: "EQUALS", value: "kWh", logicGroup: "  " },
        ],
      }),
      context,
    );
    expect(evaluation.groups).toHaveLength(1);
    expect(evaluation.groups[0].logicGroup).toBe("AND");
    expect(evaluation.matched).toBe(true);
  });

  it("handles IS_NULL on a missing key and on an explicit null", () => {
    const evaluation = evaluateRule(
      rule({
        id: "r8",
        conditions: [
          { field: "invoiceRef", operator: "IS_NULL", value: "" },
          { field: "supplierId", operator: "IS_NULL", value: "" },
        ],
      }),
      context,
    );
    expect(evaluation.matched).toBe(true);
    expect(evaluation.conditions[0].actual).toBeUndefined();
    expect(evaluation.conditions[1].actual).toBeNull();
    expect(evaluation.explanation).toContain("invoiceRef IS_NULL");
  });

  it("skips an inactive rule without evaluating it", () => {
    const evaluation = evaluateRule(
      rule({
        id: "r9",
        isActive: false,
        conditions: [{ field: "scope", operator: "EQUALS", value: "SCOPE_1" }],
      }),
      context,
    );
    expect(evaluation.status).toBe("skipped");
    expect(evaluation.matched).toBe(false);
    expect(evaluation.conditions).toHaveLength(0);
    expect(evaluation.explanation).toContain("is inactive");
  });

  it("reports a rule with no conditions as an error rather than matching", () => {
    const evaluation = evaluateRule(rule({ id: "r10" }), context);
    expect(evaluation.status).toBe("error");
    expect(evaluation.matched).toBe(false);
    expect(evaluation.errorMessage).toBe("Rule has no conditions");
  });

  it("captures an operator failure as an error instead of throwing", () => {
    const evaluation = evaluateRule(
      rule({
        id: "r11",
        conditions: [{ field: "quantity", operator: "BETWEEN", value: "not-a-range" }],
      }),
      context,
    );
    expect(evaluation.status).toBe("error");
    expect(evaluation.matched).toBe(false);
    expect(evaluation.errorMessage).toMatch(/BETWEEN/);
    expect(evaluation.explanation).toContain("could not be evaluated");
  });
});

describe("evaluateRuleSet", () => {
  const ruleSet: RuleSetLike = {
    id: "rs-1",
    name: "Activity data validation",
    rules: [
      rule({
        id: "low",
        name: "Low priority",
        priority: 1,
        conditions: [{ field: "scope", operator: "EQUALS", value: "SCOPE_1" }],
      }),
      rule({
        id: "high",
        name: "High priority",
        priority: 10,
        conditions: [{ field: "quantity", operator: "GREATER_THAN", value: "1000" }],
      }),
      rule({
        id: "mid",
        name: "Mid priority",
        priority: 5,
        conditions: [{ field: "country", operator: "EQUALS", value: "JP" }],
      }),
      rule({
        id: "off",
        name: "Disabled",
        priority: 100,
        isActive: false,
        conditions: [{ field: "scope", operator: "IS_NOT_NULL", value: "" }],
      }),
    ],
  };

  it("evaluates rules in descending priority", () => {
    const outcome = evaluateRuleSet(ruleSet, context);
    expect(outcome.evaluations.map((e) => e.ruleId)).toEqual(["off", "high", "mid", "low"]);
  });

  it("reports every matching rule and the highest-priority match", () => {
    const outcome = evaluateRuleSet(ruleSet, context);
    expect(outcome.matchedRuleIds).toEqual(["high", "low"]);
    expect(outcome.firstMatch?.ruleId).toBe("high");
    expect(outcome.status).toBe("success");
  });

  it("keeps declaration order for equal priorities", () => {
    const outcome = evaluateRuleSet(
      {
        id: "rs-2",
        name: "Ties",
        rules: [
          rule({ id: "a", conditions: [{ field: "scope", operator: "IS_NOT_NULL", value: "" }] }),
          rule({ id: "b", conditions: [{ field: "scope", operator: "IS_NOT_NULL", value: "" }] }),
        ],
      },
      context,
    );
    expect(outcome.evaluations.map((e) => e.ruleId)).toEqual(["a", "b"]);
  });

  it("skips an inactive rule set entirely", () => {
    const outcome = evaluateRuleSet({ ...ruleSet, isActive: false }, context);
    expect(outcome.status).toBe("skipped");
    expect(outcome.evaluations).toHaveLength(0);
    expect(outcome.firstMatch).toBeNull();
  });

  it("propagates a rule error to the rule-set status", () => {
    const outcome = evaluateRuleSet(
      {
        id: "rs-3",
        name: "Broken",
        rules: [rule({ id: "bad", conditions: [{ field: "quantity", operator: "BETWEEN", value: "x" }] })],
      },
      context,
    );
    expect(outcome.status).toBe("error");
    expect(outcome.matchedRuleIds).toHaveLength(0);
  });
});
