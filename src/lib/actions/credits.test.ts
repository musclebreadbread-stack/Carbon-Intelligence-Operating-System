/**
 * `retireCreditsAction` is the one irreversible mutation in the system, so these
 * cases pin the properties that stop it destroying value wrongly: FIFO ordering by
 * vintage, no double-spending against existing offsets, an all-or-nothing refusal
 * when the request exceeds the available balance, and a single transaction around
 * the offsets and the credit-status updates together.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { UnauthorizedError } from "@/lib/core/errors";

const requireSession = vi.fn();
const canWrite = vi.fn();
const revalidatePath = vi.fn();
const auditCreateMany = vi.fn();

/** Rows the transaction reads; mutated per case. */
let creditRows: Record<string, unknown>[] = [];
let offsetRows: Record<string, unknown>[] = [];

/** What the transaction actually wrote. */
let writtenOffsets: Record<string, unknown>[] = [];
let creditUpdates: { id: string; data: Record<string, unknown> }[] = [];

let transactionCount = 0;
let offsetSequence = 0;

const transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
  transactionCount += 1;
  return fn({
    carbonCredit: {
      findMany: async () => creditRows,
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }) => {
        creditUpdates.push({ id: where.id, data });
        return { id: where.id };
      },
    },
    carbonOffset: {
      findMany: async () => offsetRows,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        writtenOffsets.push(data);
        offsetSequence += 1;
        return { id: `offset-${offsetSequence}` };
      },
    },
  });
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: (fn: (tx: unknown) => Promise<unknown>) => transaction(fn),
    auditTrail: { createMany: (...args: unknown[]) => auditCreateMany(...args) },
    carbonCredit: { create: vi.fn(async () => ({ id: "credit-new" })) },
    internalCarbonPrice: { create: vi.fn(async () => ({ id: "icp-1" })) },
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

import { DEMO_CURRENT_YEAR, DEMO_ORGANIZATION_ID } from "@/lib/data/demo";

import { retireCreditsAction } from "./credits";

const SESSION = {
  userId: "user-1",
  email: "treasury@example.com",
  name: "Treasury",
  organizationId: DEMO_ORGANIZATION_ID,
  organizationName: "Demo",
  isActive: true,
  roles: [
    {
      id: "role-treasury",
      name: "treasury",
      permissions: [{ resource: "carbon_credit", action: "retire" }],
    },
  ],
  accessPolicies: [],
  source: "demo" as const,
};

function credit(
  id: string,
  vintage: number,
  quantity: number,
  overrides: Record<string, unknown> = {},
) {
  return {
    id,
    serialNumber: `SN-${id}`,
    registry: "Verra",
    projectName: `Project ${id}`,
    projectType: "REDD+",
    vintage,
    quantity,
    unit: "tCO2e",
    status: "ACTIVE",
    verificationStandard: "VCS",
    country: "KR",
    methodology: "VM0015",
    issuedAt: new Date(Date.UTC(vintage, 5, 1)),
    retiredAt: null,
    expiresAt: null,
    price: 12,
    currency: "USD",
    ...overrides,
  };
}

const REQUEST = {
  organizationId: DEMO_ORGANIZATION_ID,
  quantity: 150,
  purpose: "FY inventory neutralisation",
  reportingYear: DEMO_CURRENT_YEAR,
  offsetDate: new Date(Date.UTC(DEMO_CURRENT_YEAR, 11, 31)),
};

beforeEach(() => {
  creditRows = [credit("c-2020", 2020, 100), credit("c-2022", 2022, 100)];
  offsetRows = [];
  writtenOffsets = [];
  creditUpdates = [];
  transactionCount = 0;
  offsetSequence = 0;

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

describe("retireCreditsAction — gates", () => {
  it("returns UNAUTHORIZED and touches nothing without a session", async () => {
    requireSession.mockRejectedValue(new UnauthorizedError("No session"));

    const state = await retireCreditsAction(REQUEST);

    expect(state.status).toBe("error");
    if (state.status !== "error") throw new Error("expected an error state");
    expect(state.code).toBe("UNAUTHORIZED");
    expect(transaction).not.toHaveBeenCalled();
  });

  it("returns FORBIDDEN for a session without the retire permission", async () => {
    requireSession.mockResolvedValue({ ...SESSION, roles: [] });

    const state = await retireCreditsAction(REQUEST);

    expect(state.status).toBe("error");
    if (state.status !== "error") throw new Error("expected an error state");
    expect(state.code).toBe("FORBIDDEN");
    expect(transaction).not.toHaveBeenCalled();
  });

  it("requires a purpose, because an untagged retirement cannot be claimed", async () => {
    const state = await retireCreditsAction({ ...REQUEST, purpose: "" });

    expect(state.status).toBe("error");
    if (state.status !== "error") throw new Error("expected an error state");
    expect(state.code).toBe("VALIDATION_ERROR");
    expect(state.fieldErrors).toHaveProperty("purpose");
    expect(transaction).not.toHaveBeenCalled();
  });

  it("returns DEMO_MODE rather than pretending to retire with no database", async () => {
    canWrite.mockResolvedValue(false);

    const state = await retireCreditsAction(REQUEST);

    expect(state.status).toBe("error");
    if (state.status !== "error") throw new Error("expected an error state");
    expect(state.code).toBe("DEMO_MODE");
    expect(transaction).not.toHaveBeenCalled();
  });
});

describe("retireCreditsAction — FIFO retirement", () => {
  it("retires the oldest vintage first and splits across credits", async () => {
    const state = await retireCreditsAction(REQUEST);

    expect(state.status).toBe("success");
    if (state.status !== "success") throw new Error(state.message);
    expect(state.data.totalRetired).toBe(150);

    // 100 from 2020, then 50 from 2022 — oldest first, deterministically.
    expect(writtenOffsets.map((offset) => [offset.creditId, offset.quantity])).toEqual([
      ["c-2020", 100],
      ["c-2022", 50],
    ]);
    expect(state.data.remainingAvailable).toBe(50);
    expect(state.data.rationale.length).toBeGreaterThan(0);
  });

  it("fully retires an exhausted credit and leaves a partial one active", async () => {
    await retireCreditsAction(REQUEST);

    const byId = new Map(creditUpdates.map((update) => [update.id, update.data]));
    expect(byId.get("c-2020")?.status).toBe("RETIRED");
    expect(byId.get("c-2020")?.retiredAt).toBeInstanceOf(Date);
    // A partially spent credit must stay retirable for the remaining balance.
    expect(byId.get("c-2022")?.status).toBe("ACTIVE");
    expect(byId.get("c-2022")?.retiredAt).toBeNull();
  });

  it("does not double-spend a credit that already carries an offset", async () => {
    offsetRows = [
      {
        id: "existing-1",
        creditId: "c-2020",
        quantity: 100,
        unit: "tCO2e",
        offsetDate: new Date(Date.UTC(DEMO_CURRENT_YEAR - 1, 0, 1)),
        purpose: "Prior year",
        reportingYear: DEMO_CURRENT_YEAR - 1,
        notes: null,
      },
    ];

    const state = await retireCreditsAction({ ...REQUEST, quantity: 100 });

    expect(state.status).toBe("success");
    if (state.status !== "success") throw new Error(state.message);
    // The 2020 credit is fully spent already, so the whole 100 comes from 2022.
    expect(writtenOffsets.map((offset) => offset.creditId)).toEqual(["c-2022"]);
    expect(state.data.remainingAvailable).toBe(0);
  });

  it("refuses the whole retirement when it exceeds the available balance", async () => {
    const state = await retireCreditsAction({ ...REQUEST, quantity: 5_000 });

    expect(state.status).toBe("error");
    if (state.status !== "error") throw new Error("expected an error state");
    // All or nothing: a partial retirement reported as a full one would be a
    // false claim.
    expect(writtenOffsets).toEqual([]);
    expect(creditUpdates).toEqual([]);
    expect(auditCreateMany).not.toHaveBeenCalled();
  });

  it("reports NOT_FOUND when the organization holds no credits at all", async () => {
    creditRows = [];

    const state = await retireCreditsAction(REQUEST);

    expect(state.status).toBe("error");
    if (state.status !== "error") throw new Error("expected an error state");
    expect(state.code).toBe("NOT_FOUND");
  });

  it("excludes an expired credit from the retirable pool", async () => {
    creditRows = [
      credit("c-expired", 2019, 100, {
        expiresAt: new Date(Date.UTC(DEMO_CURRENT_YEAR - 1, 0, 1)),
      }),
      credit("c-2022", 2022, 100),
    ];

    const state = await retireCreditsAction({ ...REQUEST, quantity: 100 });

    expect(state.status).toBe("success");
    if (state.status !== "success") throw new Error(state.message);
    expect(writtenOffsets.map((offset) => offset.creditId)).toEqual(["c-2022"]);
  });
});

describe("retireCreditsAction — persistence and audit", () => {
  it("writes the offsets and the status updates in one transaction", async () => {
    await retireCreditsAction(REQUEST);

    expect(transactionCount).toBe(1);
    expect(writtenOffsets.length).toBe(2);
    expect(creditUpdates.length).toBe(2);
  });

  it("audits every affected credit and revalidates the disclosure page", async () => {
    const state = await retireCreditsAction(REQUEST);

    if (state.status !== "success") throw new Error(state.message);
    const payload = auditCreateMany.mock.calls[0]?.[0] as {
      data: { entityType: string; entityId: string; reason: string | null }[];
    };
    expect(payload.data.length).toBe(2);
    for (const row of payload.data) {
      expect(row.entityType).toBe("CarbonCredit");
      expect(row.reason).toContain(REQUEST.purpose);
    }
    // The retirement changes the net figure a disclosure report cites.
    expect(revalidatePath).toHaveBeenCalledWith("/esg-disclosure");
    expect(revalidatePath).toHaveBeenCalledWith("/carbon-credits");
  });

  it("reports gross and net emissions side by side", async () => {
    const state = await retireCreditsAction(REQUEST);

    if (state.status !== "success") throw new Error(state.message);
    expect(state.data.grossEmissions).toBeGreaterThan(0);
    // Offsetting never rewrites the gross inventory figure.
    expect(state.data.netEmissions).toBeLessThanOrEqual(state.data.grossEmissions);
    expect(state.data.offsetShare).toBeGreaterThan(0);
  });
});
