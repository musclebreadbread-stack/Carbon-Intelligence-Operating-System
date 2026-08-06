/**
 * `recordFindingAction` and `assessMaterialityAction` used to smuggle a quantified
 * misstatement through a `[misstatement:<amount>]` marker in `description` because
 * `VerificationFinding` had no column for it. That marker is gone now that the
 * schema carries `misstatementAmount`/`estimatedFinancialImpact`/`impactCurrency`
 * directly — these cases pin that the finding is persisted through the real
 * columns (not encoded into free text) and that materiality reads the column back.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireSession = vi.fn();
const canWrite = vi.fn();
const revalidatePath = vi.fn();
const auditCreateMany = vi.fn();

let createdFinding: Record<string, unknown> | null = null;
let findingRows: Record<string, unknown>[] = [];
let engagementRow: Record<string, unknown> | null = null;
let engagementUpdates: { id: string; data: Record<string, unknown> }[] = [];

vi.mock("@/lib/prisma", () => ({
  prisma: {
    verificationEngagement: {
      findUnique: vi.fn(async () => engagementRow),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        engagementUpdates.push({ id: where.id, data });
        return { id: where.id };
      }),
    },
    verificationFinding: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        createdFinding = data;
        return { id: "finding-new" };
      }),
      findMany: vi.fn(async () => findingRows),
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

import { DEMO_ORGANIZATION_ID } from "@/lib/data/demo";

import { assessMaterialityAction, recordFindingAction } from "./verification";

const SESSION = {
  userId: "user-1",
  email: "verifier@example.com",
  name: "Verifier",
  organizationId: DEMO_ORGANIZATION_ID,
  organizationName: "Demo",
  isActive: true,
  roles: [
    {
      id: "role-verifier",
      name: "verifier",
      permissions: [
        { resource: "verification", action: "update" },
        { resource: "verification", action: "approve" },
      ],
    },
  ],
  accessPolicies: [],
  source: "demo" as const,
};

beforeEach(() => {
  createdFinding = null;
  findingRows = [];
  engagementRow = { id: "engagement-1", organizationId: DEMO_ORGANIZATION_ID, level: "LIMITED" };
  engagementUpdates = [];

  requireSession.mockReset();
  canWrite.mockReset();
  revalidatePath.mockReset();
  auditCreateMany.mockReset();

  requireSession.mockResolvedValue(SESSION);
  canWrite.mockResolvedValue(true);
  auditCreateMany.mockResolvedValue({ count: 1 });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("recordFindingAction — real columns, not a description marker", () => {
  it("persists misstatementAmount, estimatedFinancialImpact and impactCurrency as their own columns", async () => {
    const state = await recordFindingAction({
      engagementId: "engagement-1",
      type: "MISSTATEMENT",
      severity: "MAJOR",
      title: "Scope 1 stationary combustion overstated",
      description: "Fuel volume double-counted for Q2.",
      recommendation: "Reconcile meter readings against the ERP export.",
      status: "open",
      misstatementAmount: 480,
      estimatedFinancialImpact: 12000,
      impactCurrency: "usd",
    });

    expect(state.status).toBe("success");
    if (state.status !== "success") throw new Error(state.message);

    expect(createdFinding).not.toBeNull();
    const data = createdFinding as Record<string, unknown>;
    expect(data.misstatementAmount).toBe(480);
    expect(data.estimatedFinancialImpact).toBe(12000);
    expect(data.impactCurrency).toBe("USD");
    // The description carries only what the user wrote — no embedded marker.
    expect(data.description).toBe("Fuel volume double-counted for Q2.");
    expect(String(data.description)).not.toContain("[misstatement:");
  });

  it("writes null for the money fields when the finding is not quantified", async () => {
    const state = await recordFindingAction({
      engagementId: "engagement-1",
      type: "OBSERVATION",
      severity: "MINOR",
      title: "Missing evidence attachment",
      status: "open",
    });

    expect(state.status).toBe("success");
    const data = createdFinding as Record<string, unknown>;
    expect(data.misstatementAmount).toBeNull();
    expect(data.estimatedFinancialImpact).toBeNull();
    expect(data.impactCurrency).toBeNull();
  });
});

describe("assessMaterialityAction — reads the misstatementAmount column", () => {
  it("aggregates quantified findings read directly off the column", async () => {
    findingRows = [
      {
        id: "f-1",
        title: "Overstated Scope 1",
        type: "SCOPE_1",
        status: "open",
        misstatementAmount: 600,
      },
      {
        id: "f-2",
        title: "Understated Scope 2",
        type: "SCOPE_2",
        status: "resolved",
        misstatementAmount: -200,
      },
      {
        id: "f-3",
        title: "Non-quantified observation",
        type: "OBSERVATION",
        status: "open",
        misstatementAmount: null,
      },
    ];

    const state = await assessMaterialityAction({
      engagementId: "engagement-1",
      totalEmissions: 10_000,
      assuranceLevel: "LIMITED",
    });

    expect(state.status).toBe("success");
    if (state.status !== "success") throw new Error(state.message);
    // Only f-1 is uncorrected and quantified; f-2 is resolved (corrected), f-3 unquantified.
    expect(state.data.uncorrectedMisstatement).toBe(600);
    expect(engagementUpdates[0]?.data.opinionType).toBe(state.data.opinionType);
  });
});
