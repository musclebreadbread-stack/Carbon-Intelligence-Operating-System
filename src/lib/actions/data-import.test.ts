/**
 * `commitDataImportJobAction` used to have no server action at all — the CSV
 * importer's "Commit import job" button was disabled with no handler. These cases
 * pin the properties that make bulk import safe: the tenant boundary, per-row
 * partial-success reporting (one bad row does not fail the job), a blocking
 * `reject` rule effect excluding only its own row, and the `DataImportJob` +
 * `ActivityDataEntry` rows landing in a single transaction.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { UnauthorizedError } from "@/lib/core/errors";

const requireSession = vi.fn();
const canWrite = vi.fn();
const revalidatePath = vi.fn();
const listRuleSets = vi.fn();
const resolveNotificationRecipients = vi.fn();
const notificationSend = vi.fn();

const activityDataFindUnique = vi.fn();
const dataImportJobCreate = vi.fn();
const activityDataEntryCreateMany = vi.fn();
const auditCreateMany = vi.fn();

let transactionCount = 0;

vi.mock("@/lib/prisma", () => ({
  prisma: {
    activityData: { findUnique: (...args: unknown[]) => activityDataFindUnique(...args) },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      transactionCount += 1;
      return fn({
        dataImportJob: { create: (...args: unknown[]) => dataImportJobCreate(...args) },
        activityDataEntry: {
          createMany: (...args: unknown[]) => activityDataEntryCreateMany(...args),
        },
      });
    },
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

vi.mock("@/lib/data/repositories/security", () => ({
  resolveNotificationRecipients: (...args: unknown[]) => resolveNotificationRecipients(...args),
}));

vi.mock("@/lib/notifications/factory", () => ({
  getNotificationChannel: () => ({
    provider: "test",
    send: (...args: unknown[]) => notificationSend(...args),
  }),
}));

import { DEMO_ORGANIZATION_ID } from "@/lib/data/demo";

import { commitDataImportJobAction } from "./data-import";

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
      permissions: [{ resource: "activity_data", action: "create" }],
    },
  ],
  accessPolicies: [],
  source: "demo" as const,
};

const BASE_INPUT = {
  organizationId: DEMO_ORGANIZATION_ID,
  activityDataId: "ad-1",
  name: "2024 Q1 gas meters.csv",
  fileName: "2024 Q1 gas meters.csv",
  fileType: "csv" as const,
  mappings: [
    { sourceColumn: "qty", targetField: "quantity", isRequired: true },
    { sourceColumn: "u", targetField: "unit", isRequired: true },
    { sourceColumn: "start", targetField: "startDate", isRequired: true },
    { sourceColumn: "end", targetField: "endDate", isRequired: true },
  ],
  rows: [
    { quantity: "1200", unit: "m3", startDate: "2024-01-01", endDate: "2024-01-31" },
    { quantity: "1500", unit: "m3", startDate: "2024-02-01", endDate: "2024-02-29" },
  ],
};

beforeEach(() => {
  transactionCount = 0;
  requireSession.mockReset();
  canWrite.mockReset();
  revalidatePath.mockReset();
  listRuleSets.mockReset();
  resolveNotificationRecipients.mockReset();
  notificationSend.mockReset();
  activityDataFindUnique.mockReset();
  dataImportJobCreate.mockReset();
  activityDataEntryCreateMany.mockReset();
  auditCreateMany.mockReset();

  requireSession.mockResolvedValue(SESSION);
  canWrite.mockResolvedValue(true);
  auditCreateMany.mockResolvedValue({ count: 1 });
  listRuleSets.mockResolvedValue([]);
  resolveNotificationRecipients.mockResolvedValue([]);
  notificationSend.mockResolvedValue({ delivered: true, provider: "test", durationMs: 0 });
  activityDataFindUnique.mockResolvedValue({ id: "ad-1", organizationId: DEMO_ORGANIZATION_ID });
  dataImportJobCreate.mockResolvedValue({ id: "job-1" });
  activityDataEntryCreateMany.mockResolvedValue({ count: 2 });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("commitDataImportJobAction — gates", () => {
  it("returns UNAUTHORIZED and writes nothing without a session", async () => {
    requireSession.mockRejectedValue(new UnauthorizedError("No session"));

    const state = await commitDataImportJobAction(BASE_INPUT);

    expect(state.status).toBe("error");
    if (state.status !== "error") throw new Error("expected an error state");
    expect(state.code).toBe("UNAUTHORIZED");
    expect(dataImportJobCreate).not.toHaveBeenCalled();
  });

  it("returns DEMO_MODE rather than pretending to import with no database", async () => {
    canWrite.mockResolvedValue(false);

    const state = await commitDataImportJobAction(BASE_INPUT);

    expect(state.status).toBe("error");
    if (state.status !== "error") throw new Error("expected an error state");
    expect(state.code).toBe("DEMO_MODE");
    expect(dataImportJobCreate).not.toHaveBeenCalled();
  });

  it("refuses an import targeting another tenant's activity data set", async () => {
    activityDataFindUnique.mockResolvedValue({ id: "ad-1", organizationId: "another-company" });

    const state = await commitDataImportJobAction(BASE_INPUT);

    expect(state.status).toBe("error");
    if (state.status !== "error") throw new Error("expected an error state");
    expect(state.code).toBe("NOT_FOUND");
    expect(dataImportJobCreate).not.toHaveBeenCalled();
  });

  it("rejects an empty row list before touching the database", async () => {
    const state = await commitDataImportJobAction({ ...BASE_INPUT, rows: [] });

    expect(state.status).toBe("error");
    if (state.status !== "error") throw new Error("expected an error state");
    expect(state.code).toBe("VALIDATION_ERROR");
    expect(dataImportJobCreate).not.toHaveBeenCalled();
  });
});

describe("commitDataImportJobAction — partial success", () => {
  it("imports every well-formed row in one transaction", async () => {
    const state = await commitDataImportJobAction(BASE_INPUT);

    expect(state.status).toBe("success");
    if (state.status !== "success") throw new Error(state.message);
    expect(state.data.processedRows).toBe(2);
    expect(state.data.errorRows).toBe(0);
    expect(transactionCount).toBe(1);
    expect(activityDataEntryCreateMany).toHaveBeenCalledTimes(1);
    const created = activityDataEntryCreateMany.mock.calls[0][0] as { data: { quantity: number }[] };
    expect(created.data.map((row) => row.quantity)).toEqual([1200, 1500]);
    expect(dataImportJobCreate.mock.calls[0][0].data.status).toBe("COMPLETED");
  });

  it("rejects a malformed row but still imports the well-formed ones", async () => {
    const state = await commitDataImportJobAction({
      ...BASE_INPUT,
      rows: [
        { quantity: "1200", unit: "m3", startDate: "2024-01-01", endDate: "2024-01-31" },
        { quantity: "not-a-number", unit: "m3", startDate: "2024-02-01", endDate: "2024-02-29" },
      ],
    });

    expect(state.status).toBe("success");
    if (state.status !== "success") throw new Error(state.message);
    expect(state.data.processedRows).toBe(1);
    expect(state.data.errorRows).toBe(1);
    expect(state.data.rowErrors[0]?.rowIndex).toBe(1);
    expect(dataImportJobCreate.mock.calls[0][0].data.status).toBe("PARTIALLY_COMPLETED");
  });

  it("reports FAILED and writes no entries when every row is malformed", async () => {
    const state = await commitDataImportJobAction({
      ...BASE_INPUT,
      rows: [{ quantity: "-5", unit: "m3", startDate: "2024-01-01", endDate: "2024-01-31" }],
    });

    expect(state.status).toBe("success");
    if (state.status !== "success") throw new Error(state.message);
    expect(state.data.processedRows).toBe(0);
    expect(state.data.errorRows).toBe(1);
    expect(activityDataEntryCreateMany).not.toHaveBeenCalled();
    expect(dataImportJobCreate.mock.calls[0][0].data.status).toBe("FAILED");
  });

  it("excludes only the row a blocking reject rule matches", async () => {
    listRuleSets.mockResolvedValue([
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
            name: "Quantity must be under 1300",
            isActive: true,
            priority: 10,
            conditions: [
              {
                id: "cond-1",
                field: "quantity",
                operator: "GREATER_THAN" as const,
                value: "1300",
                logicGroup: "AND",
                orderIndex: 0,
              },
            ],
            actions: [
              { id: "act-1", type: "reject", target: null, value: "Too large", orderIndex: 0 },
            ],
          },
        ],
      },
    ]);

    const state = await commitDataImportJobAction(BASE_INPUT);

    expect(state.status).toBe("success");
    if (state.status !== "success") throw new Error(state.message);
    // Row 0 (1200) passes; row 1 (1500) is rejected by the rule.
    expect(state.data.processedRows).toBe(1);
    expect(state.data.errorRows).toBe(1);
    expect(state.data.rowErrors[0]?.rowIndex).toBe(1);
    const created = activityDataEntryCreateMany.mock.calls[0][0] as { data: { quantity: number }[] };
    expect(created.data.map((row) => row.quantity)).toEqual([1200]);
  });
});

describe("commitDataImportJobAction — notify dispatch", () => {
  it("sends one notification per rule+target even when many rows match", async () => {
    listRuleSets.mockResolvedValue([
      {
        id: "rs-1",
        organizationId: DEMO_ORGANIZATION_ID,
        name: "Always notify",
        description: "",
        category: "activity_data",
        isActive: true,
        priority: 10,
        rules: [
          {
            id: "rule-1",
            name: "Notify on every row",
            isActive: true,
            priority: 10,
            conditions: [
              {
                id: "cond-1",
                field: "quantity",
                operator: "GREATER_THAN" as const,
                value: "0",
                logicGroup: "AND",
                orderIndex: 0,
              },
            ],
            actions: [
              { id: "act-1", type: "notify", target: "ops@example.com", value: null, orderIndex: 0 },
            ],
          },
        ],
      },
    ]);
    resolveNotificationRecipients.mockResolvedValue(["ops@example.com"]);

    const state = await commitDataImportJobAction(BASE_INPUT);

    expect(state.status).toBe("success");
    if (state.status !== "success") throw new Error(state.message);
    expect(state.data.processedRows).toBe(2);
    // Both rows match the same rule+target, so it is deduplicated into one send.
    expect(notificationSend).toHaveBeenCalledTimes(1);
    expect(notificationSend.mock.calls[0][0].body).toContain("2 rows");
  });
});
