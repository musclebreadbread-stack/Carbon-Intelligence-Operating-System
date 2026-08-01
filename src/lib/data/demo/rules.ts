/**
 * Demo tenant: validation rule sets.
 *
 * These are the rules that actually fire against the fixture activity data — the
 * missing-evidence rule catches the commuting stream (which carries no evidence
 * URL), and the estimated-data rule flags it as well, so the rules view is not
 * empty in demo mode.
 */

import type { RuleSetLike } from "@/lib/domain/rules/evaluate";

import { DEMO_ORGANIZATION_ID } from "./organization";

export type DemoRuleSet = RuleSetLike & {
  readonly organizationId: string;
  readonly description: string;
};

export const DEMO_RULE_SETS: readonly DemoRuleSet[] = [
  {
    id: "demo-ruleset-activity-validation",
    organizationId: DEMO_ORGANIZATION_ID,
    name: "활동자료 검증 규칙 (Activity data validation)",
    description:
      "Row-level checks applied to every activity entry before it enters a calculation.",
    category: "activity_data",
    isActive: true,
    priority: 100,
    rules: [
      {
        id: "demo-rule-quantity-positive",
        name: "수량은 0보다 커야 함 (Quantity must be positive)",
        type: "validation",
        isActive: true,
        priority: 10,
        conditions: [
          {
            id: "demo-cond-quantity-positive",
            field: "quantity",
            operator: "LESS_THAN_OR_EQUAL",
            value: "0",
            logicGroup: "A",
            orderIndex: 0,
          },
        ],
        actions: [
          {
            id: "demo-action-reject-nonpositive",
            type: "reject",
            target: "quantity",
            value: "Quantity must be greater than zero",
            orderIndex: 0,
          },
        ],
      },
      {
        id: "demo-rule-evidence-required",
        name: "증빙 필수 (Evidence required for reported data)",
        type: "validation",
        isActive: true,
        priority: 20,
        conditions: [
          {
            id: "demo-cond-no-evidence",
            field: "evidenceUrl",
            operator: "IS_NULL",
            value: "",
            logicGroup: "A",
            orderIndex: 0,
          },
          {
            id: "demo-cond-not-estimated",
            field: "isEstimated",
            operator: "EQUALS",
            value: "false",
            logicGroup: "A",
            orderIndex: 1,
          },
        ],
        actions: [
          {
            id: "demo-action-flag-no-evidence",
            type: "flag",
            target: "evidenceUrl",
            value: "MISSING_EVIDENCE",
            orderIndex: 0,
          },
          {
            id: "demo-action-notify-no-evidence",
            type: "notify",
            target: "demo-user-manager",
            value: "An entry was reported without supporting evidence",
            orderIndex: 1,
          },
        ],
      },
      {
        id: "demo-rule-estimated-review",
        name: "추정치 검토 (Estimated data needs review)",
        type: "workflow",
        isActive: true,
        priority: 30,
        conditions: [
          {
            id: "demo-cond-is-estimated",
            field: "isEstimated",
            operator: "EQUALS",
            value: "true",
            logicGroup: "A",
            orderIndex: 0,
          },
          {
            id: "demo-cond-high-uncertainty",
            field: "uncertainty",
            operator: "GREATER_THAN",
            value: "0.2",
            logicGroup: "B",
            orderIndex: 0,
          },
        ],
        actions: [
          {
            id: "demo-action-assign-review",
            type: "assign",
            target: "demo-user-analyst",
            value: "DATA_QUALITY_REVIEW",
            orderIndex: 0,
          },
        ],
      },
      {
        id: "demo-rule-unit-whitelist",
        name: "허용 단위 (Unit must be on the approved list)",
        type: "validation",
        isActive: true,
        priority: 40,
        conditions: [
          {
            id: "demo-cond-unit-in-list",
            field: "unit",
            operator: "NOT_IN",
            value: "kWh,MWh,m3,L,kg,t,tkm,pkm,GJ,MJ",
            logicGroup: "A",
            orderIndex: 0,
          },
        ],
        actions: [
          {
            id: "demo-action-reject-unit",
            type: "reject",
            target: "unit",
            value: "Unit is not on the approved list",
            orderIndex: 0,
          },
        ],
      },
    ],
  },
  {
    id: "demo-ruleset-anomaly-thresholds",
    organizationId: DEMO_ORGANIZATION_ID,
    name: "이상치 임계값 규칙 (Anomaly threshold rules)",
    description: "Month-on-month movement thresholds that trigger a recalculation.",
    category: "quality",
    isActive: true,
    priority: 80,
    rules: [
      {
        id: "demo-rule-mom-spike",
        name: "전월비 40 % 초과 변동 (Month-on-month movement above 40 %)",
        type: "quality",
        isActive: true,
        priority: 10,
        conditions: [
          {
            id: "demo-cond-mom-spike",
            field: "monthOnMonthChange",
            operator: "GREATER_THAN",
            value: "0.4",
            logicGroup: "A",
            orderIndex: 0,
          },
        ],
        actions: [
          {
            id: "demo-action-flag-spike",
            type: "flag",
            target: "quantity",
            value: "MOM_SPIKE",
            orderIndex: 0,
          },
          {
            id: "demo-action-recalculate-spike",
            type: "recalculate",
            target: "calculation",
            value: null,
            orderIndex: 1,
          },
        ],
      },
      {
        id: "demo-rule-factor-expiry",
        name: "만료 계수 사용 (Expired factor in use)",
        type: "quality",
        isActive: true,
        priority: 20,
        conditions: [
          {
            id: "demo-cond-factor-expired",
            field: "factorValidTo",
            operator: "LESS_THAN",
            value: "2024-01-01",
            logicGroup: "A",
            orderIndex: 0,
          },
        ],
        actions: [
          {
            id: "demo-action-set-quality",
            type: "set_field",
            target: "dataQuality",
            value: "LOW",
            orderIndex: 0,
          },
        ],
      },
    ],
  },
];
