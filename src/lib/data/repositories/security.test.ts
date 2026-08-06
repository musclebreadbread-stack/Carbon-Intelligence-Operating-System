import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const findManyUsers = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findMany: (...args: unknown[]) => findManyUsers(...args) },
  },
}));

import { DEMO_ORGANIZATION_ID } from "../demo";
import { getDataMode, resetDataMode } from "../db";
import { resolveNotificationRecipients } from "./security";

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

describe("resolveNotificationRecipients", () => {
  it("returns an empty list for a null target without touching the database", async () => {
    const recipients = await resolveNotificationRecipients(DEMO_ORGANIZATION_ID, null);
    expect(recipients).toEqual([]);
    expect(findManyUsers).not.toHaveBeenCalled();
  });

  it("uses an email-shaped target literally, without a database lookup", async () => {
    const recipients = await resolveNotificationRecipients(
      DEMO_ORGANIZATION_ID,
      "verifier@example.com",
    );
    expect(recipients).toEqual(["verifier@example.com"]);
    expect(findManyUsers).not.toHaveBeenCalled();
  });

  it("resolves a role-name target against the database", async () => {
    findManyUsers.mockResolvedValue([{ email: "sustainability@example.com" }]);

    const recipients = await resolveNotificationRecipients(
      DEMO_ORGANIZATION_ID,
      "Sustainability manager",
    );

    expect(recipients).toEqual(["sustainability@example.com"]);
    expect(findManyUsers).toHaveBeenCalledTimes(1);
    const call = findManyUsers.mock.calls[0][0] as { where: { organizationId: string } };
    expect(call.where.organizationId).toBe(DEMO_ORGANIZATION_ID);
  });

  it("falls back to matching demo users by role name when the database is unavailable", async () => {
    findManyUsers.mockRejectedValue(p1001());

    const recipients = await resolveNotificationRecipients(
      DEMO_ORGANIZATION_ID,
      "Sustainability manager",
    );

    expect(getDataMode()).toBe("demo");
    // demo-user-admin and demo-user-manager both hold the sustainability-manager role.
    expect([...recipients].sort()).toEqual(
      ["admin@example.com", "sustainability@example.com"].sort(),
    );
  });

  it("returns no recipients for a target that matches no role", async () => {
    findManyUsers.mockRejectedValue(p1001());

    const recipients = await resolveNotificationRecipients(
      DEMO_ORGANIZATION_ID,
      "nonexistent role",
    );

    expect(recipients).toEqual([]);
  });
});
