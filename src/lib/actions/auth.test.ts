import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cookieSet = vi.fn();
const cookieDelete = vi.fn();

vi.mock("next/headers", () => ({
  cookies: async () => ({ set: cookieSet, delete: cookieDelete, get: vi.fn() }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const requireSession = vi.fn();
vi.mock("@/lib/auth/session", () => ({
  isSupabaseConfigured: () => false,
  requireSession: (...args: unknown[]) => requireSession(...args),
}));

const listOrganizationMemberships = vi.fn();
vi.mock("@/lib/data/repositories/organization-membership", () => ({
  listOrganizationMemberships: (...args: unknown[]) => listOrganizationMemberships(...args),
}));

import { UnauthorizedError } from "@/lib/core/errors";

import { setActiveOrganizationAction } from "./auth";

const SESSION = { userId: "user-1", organizationId: "org-home" };

beforeEach(() => {
  vi.clearAllMocks();
  listOrganizationMemberships.mockResolvedValue([]);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("setActiveOrganizationAction", () => {
  it("rejects a missing organization id", async () => {
    const result = await setActiveOrganizationAction("");
    expect(result.status).toBe("error");
  });

  it("allows switching to the caller's own home organization without a membership lookup", async () => {
    requireSession.mockResolvedValue(SESSION);

    const result = await setActiveOrganizationAction("org-home");

    expect(result.status).toBe("success");
    expect(listOrganizationMemberships).not.toHaveBeenCalled();
    expect(cookieSet).toHaveBeenCalledWith(
      "cios-active-organization",
      "org-home",
      expect.objectContaining({ httpOnly: true }),
    );
  });

  it("allows switching to an organization the caller has an active membership in", async () => {
    requireSession.mockResolvedValue(SESSION);
    listOrganizationMemberships.mockResolvedValue([
      { organizationId: "org-other", role: "MEMBER", status: "ACTIVE" },
    ]);

    const result = await setActiveOrganizationAction("org-other");

    expect(result.status).toBe("success");
  });

  it("rejects switching to an organization the caller does not belong to (cross-tenant write regression)", async () => {
    requireSession.mockResolvedValue(SESSION);
    listOrganizationMemberships.mockResolvedValue([]);

    const result = await setActiveOrganizationAction("org-not-mine");

    expect(result.status).toBe("error");
    if (result.status === "error") expect(result.code).toBe("NOT_FOUND");
    expect(cookieSet).not.toHaveBeenCalled();
  });

  it("surfaces an unauthenticated caller as an action error instead of throwing", async () => {
    requireSession.mockRejectedValue(new UnauthorizedError("Sign in to continue"));

    const result = await setActiveOrganizationAction("org-home");

    expect(result.status).toBe("error");
  });
});
