import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireSession = vi.fn();
const canWrite = vi.fn();
const revalidatePath = vi.fn();
const auditCreateMany = vi.fn();
const findUniqueTarget = vi.fn();
const upsertProgress = vi.fn();
const updateTarget = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    scienceBasedTarget: {
      findUnique: (...args: unknown[]) => findUniqueTarget(...args),
      update: (...args: unknown[]) => updateTarget(...args),
    },
    targetProgress: { upsert: (...args: unknown[]) => upsertProgress(...args) },
    auditTrail: { createMany: (...args: unknown[]) => auditCreateMany(...args) },
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
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

import { recordTargetProgressAction } from "./targets";

const SESSION = {
  userId: "user-1",
  email: "admin@example.com",
  name: "Admin",
  organizationId: DEMO_ORGANIZATION_ID,
  organizationName: "Demo",
  isActive: true,
  roles: [
    { id: "role-admin", name: "admin", permissions: [{ resource: "target", action: "update" }] },
  ],
  accessPolicies: [],
  source: "demo" as const,
};

// Baseline 1000 in 2020, target 500 by 2030: the linear pathway puts 2025 at 750.
const TARGET = {
  id: "target-1",
  organizationId: DEMO_ORGANIZATION_ID,
  baselineYear: 2020,
  baselineEmissions: 1000,
  targetYear: 2030,
  targetAbsolute: 500,
  progress: [] as unknown[],
};

beforeEach(() => {
  vi.clearAllMocks();
  requireSession.mockResolvedValue(SESSION);
  canWrite.mockResolvedValue(true);
  auditCreateMany.mockResolvedValue({ count: 1 });
  findUniqueTarget.mockResolvedValue(TARGET);
  upsertProgress.mockResolvedValue({});
  updateTarget.mockResolvedValue({});
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("recordTargetProgressAction — server-computed values take priority", () => {
  it("ignores a client-supplied isOnTrack that contradicts the server's computed pathway comparison", async () => {
    // 600 actual vs a 750 pathway target for 2025 is genuinely on track
    // (below the pathway), so the server computes isOnTrack: true regardless of
    // what the client claims.
    const result = await recordTargetProgressAction({
      targetId: "target-1",
      year: 2025,
      emissions: 600,
      // A malicious/buggy client claims the opposite of the true answer.
      isOnTrack: false,
    });

    expect(result.status).toBe("success");
    const call = upsertProgress.mock.calls[0][0] as { create: { isOnTrack: boolean } };
    expect(call.create.isOnTrack).toBe(true);
  });

  it("ignores a client-supplied reductionFromBaseline that does not match the server's computation", async () => {
    const result = await recordTargetProgressAction({
      targetId: "target-1",
      year: 2025,
      emissions: 600,
      // True reduction from baseline is 1000 - 600 = 400; the client lies.
      reductionFromBaseline: 1,
    });

    expect(result.status).toBe("success");
    const call = upsertProgress.mock.calls[0][0] as {
      create: { reductionFromBaseline: number };
    };
    expect(call.create.reductionFromBaseline).toBeCloseTo(400, 6);
  });

  it("refuses to touch a target belonging to a different organization", async () => {
    findUniqueTarget.mockResolvedValue({ ...TARGET, organizationId: "org-other" });

    const result = await recordTargetProgressAction({
      targetId: "target-1",
      year: 2025,
      emissions: 600,
    });

    expect(result.status).toBe("error");
    expect(upsertProgress).not.toHaveBeenCalled();
  });
});
