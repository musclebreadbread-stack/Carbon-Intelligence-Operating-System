/**
 * Verification actions.
 *
 * These tests pin the behaviour the `misstatementAmount` column bought (defect 3).
 * The amount used to be encoded into `description` behind a `[misstatement:N]`
 * marker, which meant two things:
 *
 *  - editing the finding's prose could change the assurance opinion, and
 *  - `listFindings()` never decoded it, so the read path reported *no* quantified
 *    misstatements for any persisted engagement while demo mode reported them
 *    correctly.
 *
 * So the assertions here are: the amount round-trips as a column, the description is
 * left as the verifier wrote it, and the opinion is derived from the amounts rather
 * than from anything in the payload.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { UnauthorizedError } from "@/lib/core/errors";

const requireSession = vi.fn();
const canWrite = vi.fn();
const revalidatePath = vi.fn();
const getInventory = vi.fn();

const engagementFindUnique = vi.fn();
const engagementUpdate = vi.fn();
const findingCreate = vi.fn();
const findingFindMany = vi.fn();
const auditCreateMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    verificationEngagement: {
      findUnique: (...args: unknown[]) => engagementFindUnique(...args),
      update: (...args: unknown[]) => engagementUpdate(...args),
      create: vi.fn(async () => ({ id: "eng-new" })),
    },
    verificationFinding: {
      create: (...args: unknown[]) => findingCreate(...args),
      findMany: (...args: unknown[]) => findingFindMany(...args),
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

vi.mock("@/lib/data/repositories/calculation", () => ({
  getInventory: (...args: unknown[]) => getInventory(...args),
}));

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

const FINDING_INPUT = {
  organizationId: DEMO_ORGANIZATION_ID,
  engagementId: "eng-1",
  type: "MISSTATEMENT",
  severity: "MAJOR",
  title: "Two months of electricity estimated",
  description: "July and August were estimated from the prior-year profile.",
  status: "open",
  misstatementAmount: 1_083,
};

beforeEach(() => {
  vi.clearAllMocks();

  requireSession.mockResolvedValue(SESSION);
  canWrite.mockResolvedValue(true);
  auditCreateMany.mockResolvedValue({ count: 1 });
  engagementFindUnique.mockResolvedValue({
    id: "eng-1",
    organizationId: DEMO_ORGANIZATION_ID,
    level: "LIMITED",
  });
  engagementUpdate.mockResolvedValue({ id: "eng-1" });
  findingCreate.mockResolvedValue({ id: "finding-1" });
  findingFindMany.mockResolvedValue([]);
  getInventory.mockResolvedValue({
    totals: { totalEmissions: 100_000 },
    consolidated: { totalEmissions: 100_000 },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("recordFindingAction", () => {
  it("persists misstatementAmount as a column and leaves the description untouched", async () => {
    const state = await recordFindingAction(FINDING_INPUT);

    expect(state.status).toBe("success");
    const [{ data }] = findingCreate.mock.calls[0] as [{ data: Record<string, unknown> }];
    expect(data.misstatementAmount).toBe(1_083);
    expect(data.description).toBe(FINDING_INPUT.description);
    // The marker must be gone: prose is prose.
    expect(String(data.description)).not.toContain("[misstatement:");
  });

  it("stores null when the verifier could not size the finding", async () => {
    const state = await recordFindingAction({
      ...FINDING_INPUT,
      misstatementAmount: undefined,
    });

    expect(state.status).toBe("success");
    const [{ data }] = findingCreate.mock.calls[0] as [{ data: Record<string, unknown> }];
    expect(data.misstatementAmount).toBeNull();
  });

  it("keeps a negative (understatement) amount signed", async () => {
    await recordFindingAction({ ...FINDING_INPUT, misstatementAmount: -420 });

    const [{ data }] = findingCreate.mock.calls[0] as [{ data: Record<string, unknown> }];
    expect(data.misstatementAmount).toBe(-420);
  });

  it("refuses in demo mode instead of pretending to save", async () => {
    canWrite.mockResolvedValue(false);

    const state = await recordFindingAction(FINDING_INPUT);

    expect(state.status).toBe("error");
    if (state.status !== "error") throw new Error("expected a refusal");
    expect(state.code).toBe("DEMO_MODE");
    expect(findingCreate).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated caller", async () => {
    requireSession.mockRejectedValue(new UnauthorizedError("no session"));

    const state = await recordFindingAction(FINDING_INPUT);

    expect(state.status).toBe("error");
    if (state.status !== "error") throw new Error("expected a refusal");
    expect(state.code).toBe("UNAUTHORIZED");
    expect(findingCreate).not.toHaveBeenCalled();
  });

  it("does not accept a finding on another organisation's engagement", async () => {
    engagementFindUnique.mockResolvedValue({
      id: "eng-1",
      organizationId: "another-company",
      level: "LIMITED",
    });

    const state = await recordFindingAction(FINDING_INPUT);

    expect(state.status).toBe("error");
    if (state.status !== "error") throw new Error("expected a refusal");
    expect(state.code).toBe("NOT_FOUND");
    expect(findingCreate).not.toHaveBeenCalled();
  });
});

describe("assessMaterialityAction", () => {
  const ASSESSMENT_INPUT = {
    organizationId: DEMO_ORGANIZATION_ID,
    engagementId: "eng-1",
    totalEmissions: 100_000,
    assuranceLevel: "LIMITED",
  };

  it("reads the amounts from the column, not from the description", async () => {
    findingFindMany.mockResolvedValue([
      {
        id: "f-1",
        title: "Estimated electricity",
        type: "MISSTATEMENT",
        status: "open",
        misstatementAmount: 8_000,
      },
      {
        id: "f-2",
        title: "Prose mentioning [misstatement:99999] but not quantified",
        type: "DOCUMENTATION",
        status: "open",
        misstatementAmount: null,
      },
    ]);

    const state = await assessMaterialityAction(ASSESSMENT_INPUT);

    expect(state.status).toBe("success");
    if (state.status !== "success") throw new Error(state.message);
    // Only the one quantified finding counts, and the decoy in the title is inert.
    expect(state.data.uncorrectedMisstatement).toBe(8_000);
    expect(state.data.netMisstatement).toBe(8_000);
    // 8 % of the total against the 5 % limited-assurance threshold is material.
    expect(state.data.isMaterial).toBe(true);
    expect(state.data.opinionType).not.toBe("UNQUALIFIED");
  });

  it("selects the query by column rather than pulling the description", async () => {
    await assessMaterialityAction(ASSESSMENT_INPUT);

    const [{ select }] = findingFindMany.mock.calls[0] as [{ select: Record<string, unknown> }];
    expect(select.misstatementAmount).toBe(true);
    expect(select.description).toBeUndefined();
  });

  it("excludes a corrected finding from the uncorrected aggregate", async () => {
    findingFindMany.mockResolvedValue([
      {
        id: "f-1",
        title: "Corrected already",
        type: "MISSTATEMENT",
        status: "closed",
        misstatementAmount: 9_000,
      },
    ]);

    const state = await assessMaterialityAction(ASSESSMENT_INPUT);

    expect(state.status).toBe("success");
    if (state.status !== "success") throw new Error(state.message);
    expect(state.data.uncorrectedMisstatement).toBe(0);
    expect(state.data.isMaterial).toBe(false);
  });

  it("writes the derived opinion back onto the engagement", async () => {
    findingFindMany.mockResolvedValue([
      {
        id: "f-1",
        title: "Estimated electricity",
        type: "MISSTATEMENT",
        status: "open",
        misstatementAmount: 8_000,
      },
    ]);

    const state = await assessMaterialityAction(ASSESSMENT_INPUT);

    expect(state.status).toBe("success");
    if (state.status !== "success") throw new Error(state.message);
    const [{ data }] = engagementUpdate.mock.calls[0] as [{ data: Record<string, unknown> }];
    expect(data.opinionType).toBe(state.data.opinionType);
    expect(revalidatePath).toHaveBeenCalled();
  });

  it("returns an unqualified opinion when nothing is quantified", async () => {
    findingFindMany.mockResolvedValue([
      {
        id: "f-1",
        title: "Observation only",
        type: "OBSERVATION",
        status: "open",
        misstatementAmount: null,
      },
    ]);

    const state = await assessMaterialityAction(ASSESSMENT_INPUT);

    expect(state.status).toBe("success");
    if (state.status !== "success") throw new Error(state.message);
    expect(state.data.netMisstatement).toBe(0);
    expect(state.data.isMaterial).toBe(false);
  });
});
