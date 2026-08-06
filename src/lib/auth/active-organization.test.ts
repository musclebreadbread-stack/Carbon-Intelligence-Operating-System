import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cookieStore = new Map<string, string>();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      cookieStore.has(name) ? { name, value: cookieStore.get(name) as string } : undefined,
  }),
}));

const getSession = vi.fn();
vi.mock("@/lib/auth/session", () => ({
  getSession: (...args: unknown[]) => getSession(...args),
}));

const getDefaultOrganizationId = vi.fn();
vi.mock("@/lib/data/repositories/organization", () => ({
  getDefaultOrganizationId: (...args: unknown[]) => getDefaultOrganizationId(...args),
}));

const listOrganizationMemberships = vi.fn();
vi.mock("@/lib/data/repositories/organization-membership", () => ({
  listOrganizationMemberships: (...args: unknown[]) => listOrganizationMemberships(...args),
}));

import { ACTIVE_ORGANIZATION_COOKIE, resolveActiveOrganization } from "./active-organization";

const HOME_ORG = { id: "org-home", name: "Home Co" };
const OTHER_MEMBER_ORG = { id: "org-member", name: "Member Co" };
const FOREIGN_ORG_ID = "org-not-mine";

function session(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    userId: "user-1",
    organizationId: HOME_ORG.id,
    organizationName: HOME_ORG.name,
    ...overrides,
  };
}

beforeEach(() => {
  cookieStore.clear();
  getSession.mockReset();
  getDefaultOrganizationId.mockReset();
  listOrganizationMemberships.mockReset();
  listOrganizationMemberships.mockResolvedValue([]);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("resolveActiveOrganization", () => {
  it("falls back to the deployment default when there is no session", async () => {
    getSession.mockResolvedValue(null);
    getDefaultOrganizationId.mockResolvedValue("org-default");

    const result = await resolveActiveOrganization();

    expect(result.id).toBe("org-default");
    expect(result.available).toEqual([{ id: "org-default", name: "org-default" }]);
  });

  it("uses the session's home organisation when no cookie is set", async () => {
    getSession.mockResolvedValue(session());

    const result = await resolveActiveOrganization();

    expect(result.id).toBe(HOME_ORG.id);
    expect(result.name).toBe(HOME_ORG.name);
  });

  it("honours the cookie when it names an organisation the user is a member of", async () => {
    getSession.mockResolvedValue(session());
    listOrganizationMemberships.mockResolvedValue([
      { id: "m1", userId: "user-1", organizationId: OTHER_MEMBER_ORG.id, organizationName: OTHER_MEMBER_ORG.name, role: "MEMBER", status: "ACTIVE" },
    ]);
    cookieStore.set(ACTIVE_ORGANIZATION_COOKIE, OTHER_MEMBER_ORG.id);

    const result = await resolveActiveOrganization();

    expect(result.id).toBe(OTHER_MEMBER_ORG.id);
    expect(result.name).toBe(OTHER_MEMBER_ORG.name);
    expect(result.available.map((o) => o.id).sort()).toEqual(
      [HOME_ORG.id, OTHER_MEMBER_ORG.id].sort(),
    );
  });

  it("ignores a cookie naming an organisation the user does not belong to (cross-tenant read regression)", async () => {
    getSession.mockResolvedValue(session());
    listOrganizationMemberships.mockResolvedValue([]);
    cookieStore.set(ACTIVE_ORGANIZATION_COOKIE, FOREIGN_ORG_ID);

    const result = await resolveActiveOrganization();

    // Before the membership fix this returned FOREIGN_ORG_ID as long as *some*
    // organisation with that id existed anywhere in the deployment. It must now
    // fall back to the caller's own home organisation.
    expect(result.id).toBe(HOME_ORG.id);
    expect(result.available.some((o) => o.id === FOREIGN_ORG_ID)).toBe(false);
  });
});
