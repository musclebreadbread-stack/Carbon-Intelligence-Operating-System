/**
 * Organisation repository — the membership query behind tenant selection.
 *
 * `listOrganizations()` is deployment-wide and was, wrongly, what the organisation
 * switcher and the active-organisation cookie were validated against. These cases
 * pin `listOrganizationsForUser()`: the membership condition is part of the SQL,
 * and the fixture fallback applies the same rule rather than handing out the demo
 * tenant to whoever asks.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const organizationFindMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    organization: {
      findMany: (...args: unknown[]) => organizationFindMany(...args),
    },
  },
}));

import { resetDataMode } from "../db";
import { DEMO_ADMIN_USER_ID, DEMO_ORGANIZATION_ID } from "../demo";

import { listOrganizations, listOrganizationsForUser } from "./organization";

const REAL_URL = "postgresql://app:s3cret@db.internal:5432/cios";
const ORIGINAL_URL = process.env.DATABASE_URL;

function p1001(): Error & { code: string } {
  const error = new Error("Can't reach database server at db.internal:5432") as Error & {
    code: string;
  };
  error.code = "P1001";
  return error;
}

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

describe("listOrganizationsForUser against a database", () => {
  it("filters on an active membership in the query itself", async () => {
    organizationFindMany.mockResolvedValue([]);

    await listOrganizationsForUser("user-1");

    const [args] = organizationFindMany.mock.calls[0] as [
      { where: { isActive: boolean; users: { some: Record<string, unknown> } } },
    ];
    expect(args.where.isActive).toBe(true);
    expect(args.where.users.some).toEqual({ id: "user-1", isActive: true });
  });

  it("does not widen to every organisation the deployment has", async () => {
    organizationFindMany.mockResolvedValue([]);

    await listOrganizations();

    const [args] = organizationFindMany.mock.calls[0] as [
      { where: Record<string, unknown> },
    ];
    expect(args.where.users).toBeUndefined();
  });
});

describe("listOrganizationsForUser in demo mode", () => {
  it("returns the demo tenant for a demo member", async () => {
    organizationFindMany.mockRejectedValue(p1001());

    const rows = await listOrganizationsForUser(DEMO_ADMIN_USER_ID);

    expect(rows.map((row) => row.id)).toEqual([DEMO_ORGANIZATION_ID]);
  });

  it("returns nothing for a user the fixtures do not know", async () => {
    organizationFindMany.mockRejectedValue(p1001());

    expect(await listOrganizationsForUser("stranger")).toEqual([]);
  });
});
