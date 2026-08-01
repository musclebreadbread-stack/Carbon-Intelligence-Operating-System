/**
 * `runCalculationAction` is the heaviest write path in the system, so these cases
 * pin the four properties that matter most: the auth re-check happens, an invalid
 * payload writes nothing, the whole result graph is written inside one
 * `$transaction`, and demo mode refuses the write instead of throwing.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { UnauthorizedError } from "@/lib/core/errors";

// ---------------------------------------------------------------------------
// Mocks. Declared before the module under test is imported, per Vitest hoisting.
// ---------------------------------------------------------------------------

const requireSession = vi.fn();
const canWrite = vi.fn();
const revalidatePath = vi.fn();

/** Every `tx.*` call the action makes, in the order it makes them. */
const txCalls: string[] = [];
const auditCreateMany = vi.fn();

function txModel(name: string, result: unknown = { id: `${name}-1` }) {
  return {
    create: vi.fn(async () => {
      txCalls.push(`${name}.create`);
      return result;
    }),
    createMany: vi.fn(async () => {
      txCalls.push(`${name}.createMany`);
      return { count: 1 };
    }),
    upsert: vi.fn(async () => {
      txCalls.push(`${name}.upsert`);
      return result;
    }),
  };
}

let transactionDepth = 0;
let maxTransactionDepth = 0;

const transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
  transactionDepth += 1;
  maxTransactionDepth = Math.max(maxTransactionDepth, transactionDepth);
  try {
    return await fn({
      emissionCalculation: txModel("emissionCalculation", { id: "calc-1" }),
      emissionResult: txModel("emissionResult"),
      uncertaintyAnalysis: txModel("uncertaintyAnalysis"),
      dataQualityScore: txModel("dataQualityScore"),
      aIExplanation: txModel("aIExplanation", { id: "expl-1" }),
      calculationTrace: txModel("calculationTrace"),
      lineageGraph: txModel("lineageGraph", { id: "graph-1" }),
      dataLineageNode: txModel("dataLineageNode", { id: "node-1" }),
      dataLineageEdge: txModel("dataLineageEdge"),
    });
  } finally {
    transactionDepth -= 1;
  }
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: (fn: (tx: unknown) => Promise<unknown>) => transaction(fn),
    auditTrail: { createMany: (...args: unknown[]) => auditCreateMany(...args) },
    emissionInventory: {
      create: vi.fn(async () => ({ id: "inv-1" })),
      findUnique: vi.fn(async () => null), // no locked inventory by default
    },
  },
}));

vi.mock("@/lib/auth/session", () => ({
  requireSession: () => requireSession(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePath(...args),
}));

// `withDb` stays real so the repositories fall back to the item-28 fixtures;
// only the mutation guard is controlled.
vi.mock("@/lib/data/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/data/db")>();
  return { ...actual, canWrite: () => canWrite() };
});

import {
  DEMO_CURRENT_YEAR,
  DEMO_EXPECTED_ENTRY_COUNT,
  DEMO_ORGANIZATION_ID,
} from "@/lib/data/demo";

import { runCalculationAction } from "./calculation";

const SESSION = {
  userId: "user-1",
  email: "admin@example.com",
  name: "Admin",
  organizationId: DEMO_ORGANIZATION_ID,
  organizationName: "Demo",
  isActive: true,
  roles: [
    {
      id: "role-admin",
      name: "admin",
      isSystem: true,
      permissions: [{ resource: "calculation", action: "create" }],
    },
  ],
  accessPolicies: [],
  source: "demo" as const,
};

const VALID_REQUEST = {
  organizationId: DEMO_ORGANIZATION_ID,
  name: `FY${DEMO_CURRENT_YEAR} inventory`,
  reportingYear: DEMO_CURRENT_YEAR,
  facilityIds: [],
  scopes: [],
  gwpVersion: "AR6",
  approach: "ACTIVITY_BASED",
  consolidationApproach: "OPERATIONAL_CONTROL",
  scope2Basis: "LOCATION",
};

beforeEach(() => {
  txCalls.length = 0;
  transactionDepth = 0;
  maxTransactionDepth = 0;
  requireSession.mockReset();
  canWrite.mockReset();
  revalidatePath.mockReset();
  auditCreateMany.mockReset();
  transaction.mockClear();
  requireSession.mockResolvedValue(SESSION);
  canWrite.mockResolvedValue(true);
  auditCreateMany.mockResolvedValue({ count: 1 });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("runCalculationAction — authentication", () => {
  it("returns an UNAUTHORIZED state when there is no session", async () => {
    requireSession.mockRejectedValue(new UnauthorizedError("No session"));

    const state = await runCalculationAction(VALID_REQUEST);

    expect(state.status).toBe("error");
    if (state.status !== "error") throw new Error("expected an error state");
    expect(state.code).toBe("UNAUTHORIZED");
    expect(transaction).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("re-checks the session even when the payload is invalid", async () => {
    requireSession.mockRejectedValue(new UnauthorizedError("No session"));

    await runCalculationAction({});

    // Auth is checked before validation: an unauthenticated caller must not be
    // able to probe the schema.
    expect(requireSession).toHaveBeenCalledTimes(1);
  });

  it("returns FORBIDDEN when the session lacks the permission", async () => {
    requireSession.mockResolvedValue({ ...SESSION, roles: [] });

    const state = await runCalculationAction(VALID_REQUEST);

    expect(state.status).toBe("error");
    if (state.status !== "error") throw new Error("expected an error state");
    expect(state.code).toBe("FORBIDDEN");
    expect(transaction).not.toHaveBeenCalled();
  });
});

describe("runCalculationAction — validation", () => {
  it("returns field-level errors and writes nothing for an invalid payload", async () => {
    const state = await runCalculationAction({
      organizationId: DEMO_ORGANIZATION_ID,
      name: "",
      reportingYear: 1800,
    });

    expect(state.status).toBe("error");
    if (state.status !== "error") throw new Error("expected an error state");
    expect(state.code).toBe("VALIDATION_ERROR");
    expect(Object.keys(state.fieldErrors ?? {})).toContain("name");
    expect(Object.keys(state.fieldErrors ?? {})).toContain("reportingYear");
    expect(transaction).not.toHaveBeenCalled();
    expect(auditCreateMany).not.toHaveBeenCalled();
  });

  it("rejects a non-object payload without throwing", async () => {
    const state = await runCalculationAction("not a payload");

    expect(state.status).toBe("error");
    if (state.status !== "error") throw new Error("expected an error state");
    expect(state.code).toBe("VALIDATION_ERROR");
  });
});

describe("runCalculationAction — demo mode", () => {
  it("returns DEMO_MODE instead of writing when no database is available", async () => {
    canWrite.mockResolvedValue(false);

    const state = await runCalculationAction(VALID_REQUEST);

    expect(state.status).toBe("error");
    if (state.status !== "error") throw new Error("expected an error state");
    expect(state.code).toBe("DEMO_MODE");
    expect(state.messageKey).toBe("action.error.demoMode");
    expect(transaction).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("runCalculationAction — persistence", () => {
  it("writes the whole result graph inside one transaction and revalidates", async () => {
    const state = await runCalculationAction(VALID_REQUEST);

    expect(state.status).toBe("success");
    if (state.status !== "success") throw new Error(state.message);

    expect(transaction).toHaveBeenCalledTimes(1);
    // Nested transactions would break the atomicity guarantee.
    expect(maxTransactionDepth).toBe(1);

    // Every model of the graph is written, and the explanation is written after
    // the calculations it anchors.
    expect(txCalls).toContain("emissionCalculation.create");
    expect(txCalls).toContain("emissionResult.createMany");
    expect(txCalls).toContain("uncertaintyAnalysis.create");
    expect(txCalls).toContain("dataQualityScore.upsert");
    expect(txCalls).toContain("aIExplanation.create");
    expect(txCalls).toContain("calculationTrace.createMany");
    expect(txCalls).toContain("lineageGraph.create");
    expect(txCalls).toContain("dataLineageNode.create");
    expect(txCalls.indexOf("emissionCalculation.create")).toBeLessThan(
      txCalls.indexOf("aIExplanation.create"),
    );

    expect(revalidatePath).toHaveBeenCalledWith("/emission-engine");
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard");
    expect(revalidatePath).toHaveBeenCalledWith("/analytics");
  });

  it("computes one result per fixture activity entry", async () => {
    const state = await runCalculationAction(VALID_REQUEST);

    if (state.status !== "success") throw new Error(state.message);
    // The fixtures carry two reporting years; one year is half the entries.
    expect(state.data.resultCount).toBe(DEMO_EXPECTED_ENTRY_COUNT / 2);
    expect(state.data.totalEmissions).toBeGreaterThan(0);
    expect(state.data.calculationIds.length).toBeGreaterThan(0);
    expect(state.data.explanationId).toBe("expl-1");
  });

  it("writes an audit entry for every calculation it created", async () => {
    const state = await runCalculationAction(VALID_REQUEST);

    if (state.status !== "success") throw new Error(state.message);
    expect(auditCreateMany).toHaveBeenCalledTimes(1);
    const payload = auditCreateMany.mock.calls[0]?.[0] as {
      data: { entityType: string; action: string; performedBy: string }[];
    };
    expect(payload.data.length).toBe(state.data.calculationIds.length);
    for (const row of payload.data) {
      expect(row.entityType).toBe("EmissionCalculation");
      expect(row.action).toBe("create");
      expect(row.performedBy).toBe(SESSION.userId);
    }
  });

  it("does not report a failed save when the audit write fails", async () => {
    auditCreateMany.mockRejectedValue(new Error("audit table is read-only"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const state = await runCalculationAction(VALID_REQUEST);

    // The mutation succeeded; losing the trail is logged, not surfaced as a
    // failed save the user would retry.
    expect(state.status).toBe("success");
    expect(errorSpy).toHaveBeenCalled();
  });
});
