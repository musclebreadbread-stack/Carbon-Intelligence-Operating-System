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
const activityDataEntryCreateMany = vi.fn();
const activityDataEntryFindUnique = vi.fn();
const activityDataEntryUpdate = vi.fn();
const dataImportJobCreate = vi.fn();
const auditCreateMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    activityData: {
      create: (...args: unknown[]) => activityDataCreate(...args),
      findUnique: (...args: unknown[]) => activityDataFindUnique(...args),
    },
    activityDataEntry: {
      create: (...args: unknown[]) => activityDataEntryCreate(...args),
      createMany: (...args: unknown[]) => activityDataEntryCreateMany(...args),
      findUnique: (...args: unknown[]) => activityDataEntryFindUnique(...args),
      update: (...args: unknown[]) => activityDataEntryUpdate(...args),
    },
    dataImportJob: { create: (...args: unknown[]) => dataImportJobCreate(...args) },
    meterReading: { create: vi.fn(async () => ({ id: "meter-1" })) },
    auditTrail: { createMany: (...args: unknown[]) => auditCreateMany(...args) },
    // The import action writes the job and its entries in one transaction; the
    // callback is invoked with the same mock client so both writes are observable.
    $transaction: (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        dataImportJob: { create: (...args: unknown[]) => dataImportJobCreate(...args) },
        activityDataEntry: {
          createMany: (...args: unknown[]) => activityDataEntryCreateMany(...args),
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
  listRuleSets: (...args: unknown[]) => listRuleSets(...args),
}));

import { DEMO_CURRENT_YEAR, DEMO_ORGANIZATION_ID } from "@/lib/data/demo";

import {
  createActivityDataAction,
  createActivityEntryAction,
  importActivityDataAction,
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
  activityDataEntryCreateMany.mockReset();
  activityDataEntryFindUnique.mockReset();
  activityDataEntryUpdate.mockReset();
  dataImportJobCreate.mockReset();
  auditCreateMany.mockReset();

  requireSession.mockResolvedValue(SESSION);
  canWrite.mockResolvedValue(true);
  auditCreateMany.mockResolvedValue({ count: 1 });
  listRuleSets.mockResolvedValue([]);
  activityDataCreate.mockResolvedValue({ id: "ad-1" });
  activityDataFindUnique.mockResolvedValue({
    id: "ad-1",
    organizationId: DEMO_ORGANIZATION_ID,
    facilityId: "fac-1",
  });
  activityDataEntryCreate.mockResolvedValue({ id: "entry-1" });
  activityDataEntryCreateMany.mockResolvedValue({ count: 0 });
  dataImportJobCreate.mockResolvedValue({ id: "job-1" });
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

/**
 * `importActivityDataAction` (defect 2).
 *
 * The action did not exist: the CSV import UI parsed, mapped and previewed a file but
 * its commit button was permanently disabled because nothing wrote a `DataImportJob`.
 *
 * The properties worth pinning are the ones that make an import trustworthy: the rows
 * are re-derived server-side from the mapping (so a crafted POST cannot bypass row
 * validation), partial success is a real reported outcome rather than an all-or-nothing
 * failure, the job and its entries are written together, and the tenant boundary holds.
 */
describe("importActivityDataAction", () => {
  const IMPORT_INPUT = {
    organizationId: DEMO_ORGANIZATION_ID,
    activityDataId: "ad-1",
    name: "2024 Q1 gas meters",
    fileName: "2024-q1.csv",
    mappings: [
      { sourceColumn: "Amount", targetField: "quantity" },
      { sourceColumn: "UoM", targetField: "unit" },
      { sourceColumn: "From", targetField: "startDate" },
      { sourceColumn: "To", targetField: "endDate" },
    ],
    rows: [
      { Amount: "1200", UoM: "kWh", From: "2024-01-01", To: "2024-01-31" },
      { Amount: "1350", UoM: "kWh", From: "2024-02-01", To: "2024-02-29" },
    ],
  };

  it("writes a COMPLETED job and one entry per row when every row is valid", async () => {
    const state = await importActivityDataAction(IMPORT_INPUT);

    expect(state.status).toBe("success");
    if (state.status !== "success") throw new Error(state.message);
    expect(state.data.status).toBe("COMPLETED");
    expect(state.data.totalRows).toBe(2);
    expect(state.data.importedRows).toBe(2);
    expect(state.data.failedRows).toBe(0);
    expect(state.data.failures).toEqual([]);
    expect(state.data.jobId).toBe("job-1");
  });

  it("derives the entries from the mapping rather than trusting the client", async () => {
    await importActivityDataAction(IMPORT_INPUT);

    const [{ data }] = activityDataEntryCreateMany.mock.calls[0] as [
      { data: readonly Record<string, unknown>[] },
    ];
    expect(data).toHaveLength(2);
    expect(data[0].quantity).toBe(1200);
    expect(data[0].unit).toBe("kWh");
    expect(data[0].activityDataId).toBe("ad-1");
    expect(data[0].startDate).toBeInstanceOf(Date);
    expect(data[0].isEstimated).toBe(false);
  });

  it("persists the confirmed mapping alongside the job", async () => {
    await importActivityDataAction(IMPORT_INPUT);

    const [{ data }] = dataImportJobCreate.mock.calls[0] as [
      { data: Record<string, unknown> },
    ];
    expect(data.totalRows).toBe(2);
    expect(data.processedRows).toBe(2);
    expect(data.errorRows).toBe(0);
    expect(data.fileName).toBe("2024-q1.csv");
    const mappings = data.mappings as { create: readonly Record<string, unknown>[] };
    expect(mappings.create).toHaveLength(4);
    expect(mappings.create[0].sourceColumn).toBe("Amount");
    expect(mappings.create[0].targetField).toBe("quantity");
  });

  it("imports the good rows and reports the bad ones per row and field", async () => {
    // Partial success is the normal case for a real file.
    const state = await importActivityDataAction({
      ...IMPORT_INPUT,
      rows: [
        ...IMPORT_INPUT.rows,
        { Amount: "-5", UoM: "kWh", From: "2024-03-01", To: "2024-03-31" },
        { Amount: "10", UoM: "bananas", From: "2024-04-01", To: "2024-04-30" },
      ],
    });

    expect(state.status).toBe("success");
    if (state.status !== "success") throw new Error(state.message);
    expect(state.data.status).toBe("PARTIALLY_COMPLETED");
    expect(state.data.importedRows).toBe(2);
    expect(state.data.failedRows).toBe(2);
    expect(state.data.failures.map((failure) => failure.rowNumber)).toEqual([3, 4]);
    expect(state.data.failures[0].fieldErrors.quantity).toBeDefined();
    expect(state.data.failures[1].fieldErrors.unit).toBeDefined();
    // Only the two valid rows are written.
    const [{ data }] = activityDataEntryCreateMany.mock.calls[0] as [
      { data: readonly unknown[] },
    ];
    expect(data).toHaveLength(2);
  });

  it("writes a FAILED job and no entries when every row is rejected", async () => {
    const state = await importActivityDataAction({
      ...IMPORT_INPUT,
      rows: [{ Amount: "0", UoM: "kWh", From: "2024-01-01", To: "2024-01-31" }],
    });

    expect(state.status).toBe("success");
    if (state.status !== "success") throw new Error(state.message);
    expect(state.data.status).toBe("FAILED");
    expect(state.data.importedRows).toBe(0);
    // The job is still recorded, so the user has the attempt and the reasons.
    expect(dataImportJobCreate).toHaveBeenCalledTimes(1);
    expect(activityDataEntryCreateMany).not.toHaveBeenCalled();
  });

  it("stores the full failure list on the job's errorLog", async () => {
    await importActivityDataAction({
      ...IMPORT_INPUT,
      rows: [{ Amount: "0", UoM: "kWh", From: "2024-01-01", To: "2024-01-31" }],
    });

    const [{ data }] = dataImportJobCreate.mock.calls[0] as [
      { data: Record<string, unknown> },
    ];
    expect(Array.isArray(data.errorLog)).toBe(true);
    expect((data.errorLog as readonly unknown[]).length).toBe(1);
  });

  it("leaves errorLog unset for a clean import", async () => {
    await importActivityDataAction(IMPORT_INPUT);

    const [{ data }] = dataImportJobCreate.mock.calls[0] as [
      { data: Record<string, unknown> },
    ];
    expect("errorLog" in data).toBe(false);
  });

  it("rejects a mapping that does not cover the required fields", async () => {
    // The UI disables the button for this, but a direct POST does not.
    const state = await importActivityDataAction({
      ...IMPORT_INPUT,
      mappings: IMPORT_INPUT.mappings.slice(0, 2),
    });

    expect(state.status).toBe("error");
    if (state.status !== "error") throw new Error("expected a refusal");
    expect(state.code).toBe("VALIDATION_ERROR");
    expect(dataImportJobCreate).not.toHaveBeenCalled();
  });

  it("ignores a mapping that targets a field outside the import surface", async () => {
    // A crafted mapping must not be able to set arbitrary columns; the target is
    // dropped, so the required-field check then refuses the import.
    const state = await importActivityDataAction({
      ...IMPORT_INPUT,
      mappings: [
        ...IMPORT_INPUT.mappings.slice(0, 3),
        { sourceColumn: "To", targetField: "activityDataId" },
      ],
    });

    expect(state.status).toBe("error");
    if (state.status !== "error") throw new Error("expected a refusal");
    expect(state.code).toBe("VALIDATION_ERROR");
    expect(activityDataEntryCreateMany).not.toHaveBeenCalled();
  });

  it("does not import into another organisation's activity data set", async () => {
    activityDataFindUnique.mockResolvedValue({
      id: "ad-1",
      organizationId: "another-company",
      facilityId: null,
    });

    const state = await importActivityDataAction(IMPORT_INPUT);

    expect(state.status).toBe("error");
    if (state.status !== "error") throw new Error("expected a refusal");
    expect(state.code).toBe("NOT_FOUND");
    expect(dataImportJobCreate).not.toHaveBeenCalled();
  });

  it("refuses with DEMO_MODE instead of faking an import", async () => {
    canWrite.mockResolvedValue(false);

    const state = await importActivityDataAction(IMPORT_INPUT);

    expect(state.status).toBe("error");
    if (state.status !== "error") throw new Error("expected a refusal");
    expect(state.code).toBe("DEMO_MODE");
    expect(dataImportJobCreate).not.toHaveBeenCalled();
  });

  it("returns UNAUTHORIZED without writing when there is no session", async () => {
    requireSession.mockRejectedValue(new UnauthorizedError("No session"));

    const state = await importActivityDataAction(IMPORT_INPUT);

    expect(state.status).toBe("error");
    if (state.status !== "error") throw new Error("expected a refusal");
    expect(state.code).toBe("UNAUTHORIZED");
    expect(dataImportJobCreate).not.toHaveBeenCalled();
  });

  it("returns field errors for a payload with no rows", async () => {
    const state = await importActivityDataAction({ ...IMPORT_INPUT, rows: [] });

    expect(state.status).toBe("error");
    if (state.status !== "error") throw new Error("expected a refusal");
    expect(state.code).toBe("VALIDATION_ERROR");
    expect(state.fieldErrors?.rows).toBeDefined();
    expect(dataImportJobCreate).not.toHaveBeenCalled();
  });

  it("audits the job and revalidates the pages that show the entries", async () => {
    await importActivityDataAction(IMPORT_INPUT);

    expect(auditCreateMany).toHaveBeenCalledTimes(1);
    const [{ data }] = auditCreateMany.mock.calls[0] as [
      { data: readonly Record<string, unknown>[] },
    ];
    expect(data[0].entityType).toBe("DataImportJob");
    expect(data[0].entityId).toBe("job-1");
    expect(revalidatePath).toHaveBeenCalledWith("/activity-data");
    expect(revalidatePath).toHaveBeenCalledWith("/emission-engine");
  });

  it("caps the failures it returns while still counting them all", async () => {
    const state = await importActivityDataAction({
      ...IMPORT_INPUT,
      rows: [
        ...IMPORT_INPUT.rows,
        ...Array.from({ length: 60 }, () => ({
          Amount: "-1",
          UoM: "kWh",
          From: "2024-01-01",
          To: "2024-01-31",
        })),
      ],
    });

    expect(state.status).toBe("success");
    if (state.status !== "success") throw new Error(state.message);
    expect(state.data.failedRows).toBe(60);
    expect(state.data.failures).toHaveLength(50);
    expect(state.data.truncatedFailures).toBe(true);
  });

  it("applies optional columns when they are mapped", async () => {
    await importActivityDataAction({
      ...IMPORT_INPUT,
      mappings: [
        ...IMPORT_INPUT.mappings,
        { sourceColumn: "Est", targetField: "isEstimated" },
        { sourceColumn: "Unc", targetField: "uncertainty" },
        { sourceColumn: "Note", targetField: "notes" },
      ],
      rows: [
        {
          Amount: "1200",
          UoM: "kWh",
          From: "2024-01-01",
          To: "2024-01-31",
          Est: "yes",
          Unc: "0.05",
          Note: "Meter replaced mid-month",
        },
      ],
    });

    const [{ data }] = activityDataEntryCreateMany.mock.calls[0] as [
      { data: readonly Record<string, unknown>[] },
    ];
    expect(data[0].isEstimated).toBe(true);
    expect(data[0].uncertainty).toBe(0.05);
    expect(data[0].notes).toBe("Meter replaced mid-month");
  });
});
