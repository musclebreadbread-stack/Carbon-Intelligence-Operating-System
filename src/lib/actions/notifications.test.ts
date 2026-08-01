/**
 * Notification actions and the persistence half of rule-effect delivery.
 *
 * Two things are pinned:
 *
 *  1. `executeRuleSetAction` now *persists* the notifications a `notify` effect plans,
 *     inside the same transaction as the `RuleExecution` rows, and reports separately
 *     how many were delivered in-app versus recorded for a transport the operator has
 *     not configured. Before defect 6 was fixed the effect was silently discarded.
 *  2. Marking a notification read is scoped to the session's own user, so a broad role
 *     cannot dismiss someone else's notifications.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { UnauthorizedError } from "@/lib/core/errors";

const requireSession = vi.fn();
const canWrite = vi.fn();
const revalidatePath = vi.fn();
const getRuleSet = vi.fn();

const notificationCreateMany = vi.fn();
const notificationUpdateMany = vi.fn();
const ruleExecutionCreate = vi.fn();
const auditCreateMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    notification: {
      createMany: (...args: unknown[]) => notificationCreateMany(...args),
      updateMany: (...args: unknown[]) => notificationUpdateMany(...args),
    },
    ruleExecution: { create: (...args: unknown[]) => ruleExecutionCreate(...args) },
    auditTrail: { createMany: (...args: unknown[]) => auditCreateMany(...args) },
    $transaction: (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        ruleExecution: { create: (...args: unknown[]) => ruleExecutionCreate(...args) },
        notification: {
          createMany: (...args: unknown[]) => notificationCreateMany(...args),
        },
      }),
  },
}));

vi.mock("@/lib/auth/session", () => ({ requireSession: () => requireSession() }));

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePath(...args),
}));

vi.mock("@/lib/data/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/data/db")>();
  return { ...actual, canWrite: () => canWrite() };
});

vi.mock("@/lib/data/repositories/rules", () => ({
  getRuleSet: (...args: unknown[]) => getRuleSet(...args),
}));

import { DEMO_ORGANIZATION_ID } from "@/lib/data/demo";

import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "./notifications";
import { executeRuleSetAction } from "./rules";

const SESSION = {
  userId: "user-1",
  email: "operator@example.com",
  name: "Operator",
  organizationId: DEMO_ORGANIZATION_ID,
  organizationName: "Demo",
  isActive: true,
  roles: [
    {
      id: "role-operator",
      name: "operator",
      permissions: [
        { resource: "notification", action: "update" },
        { resource: "validation_rule", action: "execute" },
      ],
    },
  ],
  accessPolicies: [],
  source: "demo" as const,
};

/** A rule set with one always-matching rule whose only action is `notify`. */
function notifyingRuleSet(parameters: Record<string, unknown> = {}) {
  return {
    id: "rs-1",
    organizationId: DEMO_ORGANIZATION_ID,
    name: "Threshold monitoring",
    description: "",
    category: "activity_data",
    isActive: true,
    priority: 10,
    rules: [
      {
        id: "rule-1",
        name: "Gas meter above threshold",
        isActive: true,
        priority: 10,
        conditions: [
          {
            id: "cond-1",
            field: "quantity",
            operator: "GREATER_THAN" as const,
            value: "1000",
            logicGroup: "AND",
            orderIndex: 0,
          },
        ],
        actions: [
          {
            id: "act-1",
            type: "notify",
            target: null,
            value: "The Ulsan boiler gas meter exceeded its threshold.",
            parameters,
            orderIndex: 0,
          },
        ],
      },
    ],
  };
}

const EXECUTE_INPUT = {
  organizationId: DEMO_ORGANIZATION_ID,
  ruleSetId: "rs-1",
  entityType: "ActivityDataEntry",
  entityId: "entry-1",
  context: { quantity: 1500 },
};

beforeEach(() => {
  vi.clearAllMocks();

  requireSession.mockResolvedValue(SESSION);
  canWrite.mockResolvedValue(true);
  auditCreateMany.mockResolvedValue({ count: 1 });
  ruleExecutionCreate.mockResolvedValue({ id: "exec-1" });
  notificationCreateMany.mockImplementation(
    async (args: { data: readonly unknown[] }) => ({ count: args.data.length }),
  );
  notificationUpdateMany.mockResolvedValue({ count: 1 });
  getRuleSet.mockResolvedValue(notifyingRuleSet());
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("executeRuleSetAction notification delivery", () => {
  it("persists an in-app notification for a notify effect", async () => {
    const state = await executeRuleSetAction(EXECUTE_INPUT);

    expect(state.status).toBe("success");
    if (state.status !== "success") throw new Error(state.message);
    expect(state.data.notificationsDelivered).toBe(1);
    expect(state.data.notificationsPending).toBe(0);

    const [{ data }] = notificationCreateMany.mock.calls[0] as [
      { data: readonly Record<string, unknown>[] },
    ];
    expect(data).toHaveLength(1);
    expect(data[0].channel).toBe("in_app");
    expect(data[0].title).toBe("Gas meter above threshold");
    expect(data[0].userId).toBe("user-1");
    expect(data[0].organizationId).toBe(DEMO_ORGANIZATION_ID);
  });

  it("writes the notification in the same transaction as the rule executions", async () => {
    // A notification about a run that was rolled back would be a lie.
    await executeRuleSetAction(EXECUTE_INPUT);

    expect(ruleExecutionCreate).toHaveBeenCalled();
    expect(notificationCreateMany).toHaveBeenCalled();
  });

  it("records an email notification without claiming it was sent", async () => {
    getRuleSet.mockResolvedValue(notifyingRuleSet({ channel: "email" }));

    const state = await executeRuleSetAction(EXECUTE_INPUT);

    expect(state.status).toBe("success");
    if (state.status !== "success") throw new Error(state.message);
    expect(state.data.notificationsDelivered).toBe(0);
    expect(state.data.notificationsPending).toBe(1);
    expect(state.data.deliverySummary).toContain("email transport not configured");
    // Still persisted, so the notification is not lost.
    const rows = notificationCreateMany.mock.calls.flatMap(
      (call) => (call[0] as { data: readonly Record<string, unknown>[] }).data,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].channel).toBe("email");
  });

  it("raises no notification when no rule matches", async () => {
    const state = await executeRuleSetAction({ ...EXECUTE_INPUT, context: { quantity: 10 } });

    expect(state.status).toBe("success");
    if (state.status !== "success") throw new Error(state.message);
    expect(state.data.notificationsDelivered).toBe(0);
    expect(state.data.deliverySummary).toBe("No notifications were raised.");
    expect(notificationCreateMany).not.toHaveBeenCalled();
  });

  it("revalidates the notification centre so the badge updates", async () => {
    await executeRuleSetAction(EXECUTE_INPUT);

    expect(revalidatePath).toHaveBeenCalledWith("/notifications");
  });
});

describe("markNotificationReadAction", () => {
  const INPUT = {
    organizationId: DEMO_ORGANIZATION_ID,
    notificationId: "notification-1",
  };

  it("marks the notification read and stamps readAt", async () => {
    const state = await markNotificationReadAction(INPUT);

    expect(state.status).toBe("success");
    if (state.status !== "success") throw new Error(state.message);
    expect(state.data.updated).toBe(1);
    const [{ data }] = notificationUpdateMany.mock.calls[0] as [
      { data: Record<string, unknown> },
    ];
    expect(data.isRead).toBe(true);
    expect(data.readAt).toBeInstanceOf(Date);
  });

  it("scopes the update to the session's own user and organisation", async () => {
    await markNotificationReadAction(INPUT);

    const [{ where }] = notificationUpdateMany.mock.calls[0] as [
      { where: Record<string, unknown> },
    ];
    expect(where.userId).toBe("user-1");
    expect(where.organizationId).toBe(DEMO_ORGANIZATION_ID);
    expect(where.id).toBe("notification-1");
    expect(where.isRead).toBe(false);
  });

  it("reports zero updates rather than disclosing that another user's id exists", async () => {
    notificationUpdateMany.mockResolvedValue({ count: 0 });

    const state = await markNotificationReadAction(INPUT);

    expect(state.status).toBe("success");
    if (state.status !== "success") throw new Error(state.message);
    expect(state.data.updated).toBe(0);
  });

  it("refuses in demo mode", async () => {
    canWrite.mockResolvedValue(false);

    const state = await markNotificationReadAction(INPUT);

    expect(state.status).toBe("error");
    if (state.status !== "error") throw new Error("expected a refusal");
    expect(state.code).toBe("DEMO_MODE");
    expect(notificationUpdateMany).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated caller", async () => {
    requireSession.mockRejectedValue(new UnauthorizedError("no session"));

    const state = await markNotificationReadAction(INPUT);

    expect(state.status).toBe("error");
    if (state.status !== "error") throw new Error("expected a refusal");
    expect(state.code).toBe("UNAUTHORIZED");
    expect(notificationUpdateMany).not.toHaveBeenCalled();
  });

  it("returns FORBIDDEN for a session without the notification permission", async () => {
    requireSession.mockResolvedValue({ ...SESSION, roles: [] });

    const state = await markNotificationReadAction(INPUT);

    expect(state.status).toBe("error");
    if (state.status !== "error") throw new Error("expected a refusal");
    expect(state.code).toBe("FORBIDDEN");
    expect(notificationUpdateMany).not.toHaveBeenCalled();
  });
});

describe("markAllNotificationsReadAction", () => {
  it("marks every unread notification for the signed-in user", async () => {
    notificationUpdateMany.mockResolvedValue({ count: 4 });

    const state = await markAllNotificationsReadAction({
      organizationId: DEMO_ORGANIZATION_ID,
    });

    expect(state.status).toBe("success");
    if (state.status !== "success") throw new Error(state.message);
    expect(state.data.updated).toBe(4);
    const [{ where }] = notificationUpdateMany.mock.calls[0] as [
      { where: Record<string, unknown> },
    ];
    expect(where.userId).toBe("user-1");
    expect(where.isRead).toBe(false);
  });

  it("audits the bulk update", async () => {
    await markAllNotificationsReadAction({ organizationId: DEMO_ORGANIZATION_ID });

    expect(auditCreateMany).toHaveBeenCalledTimes(1);
    const [{ data }] = auditCreateMany.mock.calls[0] as [
      { data: readonly Record<string, unknown>[] },
    ];
    expect(data[0].entityType).toBe("Notification");
  });
});
