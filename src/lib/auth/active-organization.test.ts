/**
 * Active-organisation resolution — the tenant boundary a cookie must not cross.
 *
 * The switcher listed *every* active organisation in the deployment and the cookie
 * check only asked whether the id appeared in that global list, so any signed-in
 * user could point the whole dashboard (and the report export route) at another
 * tenant by editing one cookie. These cases pin membership as the check.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cookieValue = vi.fn<() => string | undefined>(() => undefined);
const getSession = vi.fn();
const listOrganizationsForUser = vi.fn();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = cookieValue();
      return value === undefined ? undefined : { name, value };
    },
  }),
}));

vi.mock("@/lib/auth/session", () => ({
  getSession: () => getSession(),
}));

vi.mock("@/lib/data/repositories/organization", () => ({
  listOrganizationsForUser: (userId: string) => listOrganizationsForUser(userId),
}));

import { activeOrganizationId, resolveActiveOrganization } from "./active-organization";

const OWN = { id: "org-own", name: "우리 회사" };
const OTHER = { id: "org-other", name: "Someone else" };

beforeEach(() => {
  vi.clearAllMocks();
  cookieValue.mockReturnValue(undefined);
  getSession.mockResolvedValue({ userId: "user-1", organizationId: OWN.id });
  listOrganizationsForUser.mockResolvedValue([OWN]);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("resolveActiveOrganization", () => {
  it("offers only the organisations the session user belongs to", async () => {
    const active = await resolveActiveOrganization();
    expect(active.available).toEqual([OWN]);
    expect(listOrganizationsForUser).toHaveBeenCalledWith("user-1");
  });

  it("uses the session's organisation when no cookie is set", async () => {
    expect((await resolveActiveOrganization()).id).toBe(OWN.id);
  });

  it("honours a cookie naming an organisation the user is a member of", async () => {
    const second = { id: "org-second", name: "Second membership" };
    listOrganizationsForUser.mockResolvedValue([OWN, second]);
    cookieValue.mockReturnValue(second.id);

    const active = await resolveActiveOrganization();
    expect(active.id).toBe(second.id);
    expect(active.name).toBe(second.name);
  });

  it("ignores a cookie naming an organisation the user is not a member of", async () => {
    cookieValue.mockReturnValue(OTHER.id);

    const active = await resolveActiveOrganization();
    expect(active.id).toBe(OWN.id);
    expect(active.available.map((row) => row.id)).not.toContain(OTHER.id);
  });

  it("resolves to no organisation at all when there is no session", async () => {
    getSession.mockResolvedValue(null);
    cookieValue.mockReturnValue(OTHER.id);

    const active = await resolveActiveOrganization();
    expect(active.id).toBe("");
    expect(active.available).toEqual([]);
    expect(listOrganizationsForUser).not.toHaveBeenCalled();
  });

  it("keeps the session's own organisation usable when the membership read fell back", async () => {
    // A database outage puts `listOrganizationsForUser` on the fixture fallback,
    // which knows nothing about a real user. Locking them out of their own tenant
    // would be a worse failure than a stale switcher.
    listOrganizationsForUser.mockResolvedValue([]);

    expect((await activeOrganizationId())).toBe(OWN.id);
  });

  it("still refuses another tenant's cookie when the membership read fell back", async () => {
    listOrganizationsForUser.mockResolvedValue([]);
    cookieValue.mockReturnValue(OTHER.id);

    expect(await activeOrganizationId()).toBe(OWN.id);
  });
});
