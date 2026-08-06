import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const findManyMembership = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    organizationMembership: {
      findMany: (...args: unknown[]) => findManyMembership(...args),
    },
  },
}));

import { resetDataMode } from "../db";
import { DEMO_ADMIN_USER_ID, DEMO_ORGANIZATION, DEMO_ORGANIZATION_ID } from "../demo";

import {
  getMembership,
  listMembersOfOrganization,
  listOrganizationMemberships,
} from "./organization-membership";

const REAL_URL = "postgresql://app:s3cret@db.internal:5432/cios";
const ORIGINAL_URL = process.env.DATABASE_URL;

beforeEach(() => {
  vi.clearAllMocks();
  resetDataMode();
  process.env.DATABASE_URL = REAL_URL;
});

afterEach(() => {
  if (ORIGINAL_URL === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = ORIGINAL_URL;
  resetDataMode();
});

describe("listOrganizationMemberships (database mode)", () => {
  it("only returns ACTIVE memberships for the given user", async () => {
    findManyMembership.mockResolvedValue([
      {
        id: "m1",
        userId: "user-1",
        organizationId: "org-a",
        role: "MEMBER",
        status: "ACTIVE",
        organization: { name: "Org A" },
      },
    ]);

    const result = await listOrganizationMemberships("user-1");

    expect(findManyMembership).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "user-1", status: "ACTIVE" } }),
    );
    expect(result).toEqual([
      {
        id: "m1",
        userId: "user-1",
        organizationId: "org-a",
        organizationName: "Org A",
        role: "MEMBER",
        status: "ACTIVE",
      },
    ]);
  });
});

describe("listOrganizationMemberships (demo mode)", () => {
  beforeEach(() => {
    delete process.env.DATABASE_URL;
    resetDataMode();
  });

  it("gives the demo admin an OWNER membership in the demo organisation", async () => {
    const result = await listOrganizationMemberships(DEMO_ADMIN_USER_ID);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      userId: DEMO_ADMIN_USER_ID,
      organizationId: DEMO_ORGANIZATION_ID,
      organizationName: DEMO_ORGANIZATION.name,
      role: "OWNER",
      status: "ACTIVE",
    });
  });

  it("returns nothing for a user with no demo membership", async () => {
    const result = await listOrganizationMemberships("nobody");
    expect(result).toEqual([]);
  });
});

describe("getMembership", () => {
  beforeEach(() => {
    delete process.env.DATABASE_URL;
    resetDataMode();
  });

  it("finds the membership matching both user and organisation", async () => {
    const result = await getMembership(DEMO_ADMIN_USER_ID, DEMO_ORGANIZATION_ID);
    expect(result?.organizationId).toBe(DEMO_ORGANIZATION_ID);
  });

  it("returns null when the user has no membership in that organisation", async () => {
    const result = await getMembership(DEMO_ADMIN_USER_ID, "some-other-org");
    expect(result).toBeNull();
  });
});

describe("listMembersOfOrganization (demo mode)", () => {
  beforeEach(() => {
    delete process.env.DATABASE_URL;
    resetDataMode();
  });

  it("lists every demo user as a member of the demo organisation", async () => {
    const result = await listMembersOfOrganization(DEMO_ORGANIZATION_ID);
    expect(result.length).toBeGreaterThan(1);
    expect(result.some((member) => member.userId === DEMO_ADMIN_USER_ID)).toBe(true);
  });
});
