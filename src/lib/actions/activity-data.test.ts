/**
 * Activity-data actions.
 *
 * The properties worth pinning here are the tenant boundary (a well-formed payload
 * must not be able to attach an entry to another company's data set) and the rule
 * engine's blocking behaviour: a `reject` effect has to abort the write, not merely
 * be reported alongside a successful one.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { UnauthorizedError } from "@/lib/core/errors";

const requireSession = vi.fn();
const canWrite = vi.fn();
const revalidatePath = vi.fn();
const listRuleSets = vi.fn();

const activityDataCreate = vi.fn();
const activityDataFindUnique = vi.fn();
const activityDataEntryCreate = vi.fn();
const activityDataEntryFindUnique = vi.fn();
const activityDataEntryUpdate = vi.fn();
const auditCreateMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    activityData: {
      create: (...args: unknown[]) => activityDataCreate(...args),
      findUnique: (...args: unknown[]) => activityDataFindUnique(...args),
    },
    activityDataEntry: {
      create: (...args: unknown[]) => activityDataEntryCreate(...args),
      findUnique: (...args: unknown[]) => activityDataEntryFindUnique(...args),
      update: (...args: unknown[]) => activityDataEntryUpdate(...args),
    },
    meterReading: { create: vi.fn(async () => ({ id: "meter-1" })) },
    auditTrail: { createMany: (...args: unknown[]) => auditCreateMany(...args) },
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
  listRuleSets: (...args: unknown[]) => listRuleSets(...args),
}));

const resolveNotificationRecipients = vi.fn();
vi.mock("@/lib/data/repositories/security", () => ({
  resolveNotificationRecipients: (...args: unknown[]) => resolveNotificationRecipients(...args),
}));

const notificationSend = vi.fn();
vi.mock("@/lib/notifications/factory", () => ({
  getNotificationChannel: () => ({ provider: "test", send: (...args: unknown[]) => notificationSend(...args) }),
}));

import { DEMO_CURRENT_YEAR, DEMO_ORGANIZATION_ID } from "@/lib/data/demo";

import {
  createActivityDataAction,
  createActivityEntryAction,
  updateActivityEntryAction,
} from "./activity-data";

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
        { resource: "activity_data", action: "create" },
        { resource: "activity_data", action: "update" },
      ],
    },
  ],
  accessPolicies: [],
  source: "demo" as const,
};

const HEADER_INPUT = {
  organizationId: DEMO_ORGANIZATION_ID,
  name: "Ulsan natural gas — monthly",
  scope: "SCOPE_1",
  reportingYear: DEMO_CURRENT_YEAR,
  dataSource: "METER_READING",
  dataQuality: "HIGH",
};

const ENTRY_INPUT = {
  organizationId: DEMO_ORGANIZATION_ID,
  activityDataId: "ad-1",
  quantity: 1200,
  unit: "m3",
  startDate: new Date(Date.UTC(DEMO_CURRENT_YEAR, 0, 1)),
  endDate: new Date(Date.UTC(DEMO_CURRENT_YEAR, 0, 31)),
};

/** A rule set with one always-matching rule of the given action type. */
function ruleSetWith(actionType: string, message: string) {
  return [
    {
      id: "rs-1",
      organizationId: DEMO_ORGANIZATION_ID,
      name: "Quantity screening",
      description: "",
      category: "activity_data",
      isActive: true,
      priority: 10,
      rules: [
        {
          id: "rule-1",
          name: "Quantity must be under 1000",
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
              type: actionType,
              target: null,
              value: message,
              orderIndex: 0,
            },
          ],
        },
      ],
    },
  ];
}

beforeEach(() => {
  requireSession.mockReset();
  canWrite.mockReset();
  revalidatePath.mockReset();
  listRuleSets.mockReset();
  activityDataCreate.mockReset();
  activityDataFindUnique.mockReset();
  activityDataEntryCreate.mockReset();
  activityDataEntryFindUnique.mockReset();
  activityDataEntryUpdate.mockReset();
  auditCreateMany.mockReset();
  resolveNotificationRecipients.mockReset();
  notificationSend.mockReset();

  requireSession.mockResolvedValue(SESSION);
  canWrite.mockResolvedValue(true);
  auditCreateMany.mockResolvedValue({ count: 1 });
  listRuleSets.mockResolvedValue([]);
  resolveNotificationRecipients.mockResolvedValue([]);
  notificationSend.mockResolvedValue({ delivered: true, provider: "test", durationMs: 0 });
  activityDataCreate.mockResolvedValue({ id: "ad-1" });
  activityDataFindUnique.mockResolvedValue({
    id: "ad-1",
    organizationId: DEMO_ORGANIZATION_ID,
    facilityId: "fac-1",
  });
  activityDataEntryCreate.mockResolvedValue({ id: "entry-1" });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createActivityDataAction", () => {
  it("creates the header, audits it and revalidates the pages that show it", async () => {
    const state = await createActivityDataAction(HEADER_INPUT);

    expect(state.status).toBe("success");
    if (state.status !== "success") throw new Error(state.message);
    expect(state.data.id).toBe("ad-1");
    expect(activityDataCreate).toHaveBeenCalledTimes(1);
    expect(auditCreateMany).toHaveBeenCalledTimes(1);
    expect(revalidatePath).toHaveBeenCalledWith("/activity-data");
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard");
  });

  it("returns UNAUTHORIZED without writing when there is no session", async () => {
    requireSession.mockRejectedValue(new UnauthorizedError("No session"));

    const state = await createActivityDataAction(HEADER_INPUT);

    expect(state.status).toBe("error");
    if (state.status !== "error") throw new Error("expected an error state");
    expect(state.code).toBe("UNAUTHORIZED");
    expect(activityDataCreate).not.toHaveBeenCalled();
  });

  it("returns field errors and writes nothing for an invalid payload", async () => {
    const state = await createActivityDataAction({
      organizationId: DEMO_ORGANIZATION_ID,
      name: "",
      scope: "SCOPE_9",
      reportingYear: DEMO_CURRENT_YEAR,
      dataSource: "METER_READING",
      dataQuality: "HIGH",
    });

    expect(state.status).toBe("error");
    if (state.status !== "error") throw new Error("expected an error state");
    expect(state.code).toBe("VALIDATION_ERROR");
    expect(state.fieldErrors).toHaveProperty("name");
    expect(state.fieldErrors).toHaveProperty("scope");
    expect(activityDataCreate).not.toHaveBeenCalled();
  });

  it("returns DEMO_MODE when there is no database to write to", async () => {
    canWrite.mockResolvedValue(false);

    const state = await createActivityDataAction(HEADER_INPUT);

    expect(state.status).toBe("error");
    if (state.status !== "error") throw new Error("expected an error state");
    expect(state.code).toBe("DEMO_MODE");
    expect(activityDataCreate).not.toHaveBeenCalled();
  });
});

describe("createActivityEntryAction", () => {
  it("writes the entry and audits it when no rule matches", async () => {
    const state = await createActivityEntryAction(ENTRY_INPUT);

    expect(state.status).toBe("success");
    if (state.status !== "success") throw new Error(state.message);
    expect(state.data.ruleFlags).toEqual([]);
    expect(activityDataEntryCreate).toHaveBeenCalledTimes(1);
    expect(auditCreateMany).toHaveBeenCalledTimes(1);
  });

  it("refuses an entry whose parent belongs to another tenant", async () => {
    activityDataFindUnique.mockResolvedValue({
      id: "ad-1",
      organizationId: "another-company",
      facilityId: null,
    });

    const state = await createActivityEntryAction(ENTRY_INPUT);

    expect(state.status).toBe("error");
    if (state.status !== "error") throw new Error("expected an error state");
    expect(state.code).toBe("NOT_FOUND");
    // Ownership is re-read from a trusted source, so a valid-looking id from
    // another tenant cannot graft a row onto it.
    expect(activityDataEntryCreate).not.toHaveBeenCalled();
  });

  it("reports a non-blocking flag effect alongside a successful write", async () => {
    listRuleSets.mockResolvedValue(ruleSetWith("flag", "Unusually high quantity"));

    const state = await createActivityEntryAction(ENTRY_INPUT);

    expect(state.status).toBe("success");
    if (state.status !== "success") throw new Error(state.message);
    expect(state.data.ruleFlags.length).toBe(1);
    expect(state.data.ruleFlags[0]).toContain("Unusually high quantity");
    expect(activityDataEntryCreate).toHaveBeenCalledTimes(1);
  });

  it("aborts the write when a rule raises a blocking reject effect", async () => {
    listRuleSets.mockResolvedValue(ruleSetWith("reject", "Quantity exceeds the plausible range"));

    const state = await createActivityEntryAction(ENTRY_INPUT);

    expect(state.status).toBe("error");
    if (state.status !== "error") throw new Error("expected an error state");
    expect(state.code).toBe("VALIDATION_ERROR");
    // An entry the rules refuse must not enter the inventory at all.
    expect(activityDataEntryCreate).not.toHaveBeenCalled();
    expect(auditCreateMany).not.toHaveBeenCalled();
  });

  it("does not run the rules at all when the payload is invalid", async () => {
    const state = await createActivityEntryAction({ ...ENTRY_INPUT, quantity: -5 });

    expect(state.status).toBe("error");
    if (state.status !== "error") throw new Error("expected an error state");
    expect(state.code).toBe("VALIDATION_ERROR");
    expect(listRuleSets).not.toHaveBeenCalled();
  });
});

describe("createActivityEntryAction — notify dispatch", () => {
  it("dispatches a notification to every resolved recipient for a notify effect", async () => {
    listRuleSets.mockResolvedValue(ruleSetWith("notify", "Escalate to the facility lead"));
    resolveNotificationRecipients.mockResolvedValue(["lead@example.com", "backup@example.com"]);

    const state = await createActivityEntryAction(ENTRY_INPUT);

    expect(state.status).toBe("success");
    if (state.status !== "success") throw new Error(state.message);
    // notify is non-blocking, so the entry is still written and flagged.
    expect(activityDataEntryCreate).toHaveBeenCalledTimes(1);
    expect(state.data.ruleFlags[0]).toContain("Escalate to the facility lead");

    expect(notificationSend).toHaveBeenCalledTimes(2);
    const recipients = notificationSend.mock.calls.map((call) => call[0].recipient).sort();
    expect(recipients).toEqual(["backup@example.com", "lead@example.com"]);
  });

  it("logs and continues when no recipient resolves for the target", async () => {
    listRuleSets.mockResolvedValue(ruleSetWith("notify", "Escalate to nobody in particular"));
    resolveNotificationRecipients.mockResolvedValue([]);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const state = await createActivityEntryAction(ENTRY_INPUT);

    expect(state.status).toBe("success");
    expect(notificationSend).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("does not fail the save when the notification channel throws", async () => {
    listRuleSets.mockResolvedValue(ruleSetWith("notify", "Escalate to the facility lead"));
    resolveNotificationRecipients.mockResolvedValue(["lead@example.com"]);
    notificationSend.mockRejectedValue(new Error("Resend is down"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    const state = await createActivityEntryAction(ENTRY_INPUT);

    expect(state.status).toBe("success");
    if (state.status !== "success") throw new Error(state.message);
    // The entry itself is unaffected by the delivery failure.
    expect(activityDataEntryCreate).toHaveBeenCalledTimes(1);
    expect(auditCreateMany).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it("never dispatches while in demo mode, because the mutation is refused before the handler runs", async () => {
    canWrite.mockResolvedValue(false);
    listRuleSets.mockResolvedValue(ruleSetWith("notify", "Escalate to the facility lead"));

    const state = await createActivityEntryAction(ENTRY_INPUT);

    expect(state.status).toBe("error");
    if (state.status !== "error") throw new Error("expected an error state");
    expect(state.code).toBe("DEMO_MODE");
    expect(notificationSend).not.toHaveBeenCalled();
    expect(resolveNotificationRecipients).not.toHaveBeenCalled();
  });
});

describe("updateActivityEntryAction", () => {
  it("diffs before and after into the audit trail", async () => {
    activityDataEntryFindUnique.mockResolvedValue({
      id: "entry-1",
      quantity: 1000,
      unit: "m3",
      isEstimated: false,
      uncertainty: null,
      evidenceUrl: null,
      activityData: { organizationId: DEMO_ORGANIZATION_ID, facilityId: "fac-1" },
    });
    activityDataEntryUpdate.mockResolvedValue({
      id: "entry-1",
      quantity: 1500,
      unit: "m3",
      isEstimated: false,
      uncertainty: null,
      evidenceUrl: null,
    });

    const state = await updateActivityEntryAction({
      organizationId: DEMO_ORGANIZATION_ID,
      id: "entry-1",
      quantity: 1500,
    });

    expect(state.status).toBe("success");
    if (state.status !== "success") throw new Error(state.message);

    const payload = auditCreateMany.mock.calls[0]?.[0] as {
      data: { entityType: string; action: string; changes: unknown }[];
    };
    expect(payload.data[0]?.entityType).toBe("ActivityDataEntry");
    expect(payload.data[0]?.action).toBe("update");
    expect(JSON.stringify(payload.data[0]?.changes)).toContain("quantity");
  });

  it("refuses to update an entry owned by another tenant", async () => {
    activityDataEntryFindUnique.mockResolvedValue({
      id: "entry-1",
      quantity: 1000,
      unit: "m3",
      isEstimated: false,
      uncertainty: null,
      evidenceUrl: null,
      activityData: { organizationId: "another-company", facilityId: null },
    });

    const state = await updateActivityEntryAction({
      organizationId: DEMO_ORGANIZATION_ID,
      id: "entry-1",
      quantity: 1500,
    });

    expect(state.status).toBe("error");
    if (state.status !== "error") throw new Error("expected an error state");
    expect(state.code).toBe("NOT_FOUND");
    expect(activityDataEntryUpdate).not.toHaveBeenCalled();
  });
});
