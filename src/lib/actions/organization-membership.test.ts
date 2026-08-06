import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireSession = vi.fn();
const canWrite = vi.fn();
const revalidatePath = vi.fn();
const auditCreateMany = vi.fn();
const membershipUpsert = vi.fn();
const membershipFindUnique = vi.fn();
const membershipUpdate = vi.fn();
const getUserByEmail = vi.fn();
const notificationSend = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    organizationMembership: {
      upsert: (...args: unknown[]) => membershipUpsert(...args),
      findUnique: (...args: unknown[]) => membershipFindUnique(...args),
      update: (...args: unknown[]) => membershipUpdate(...args),
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

vi.mock("@/lib/data/repositories/security", () => ({
  getUserByEmail: (...args: unknown[]) => getUserByEmail(...args),
}));

vi.mock("@/lib/notifications/factory", () => ({
  getNotificationChannel: () => ({ send: (...args: unknown[]) => notificationSend(...args) }),
}));

import {
  inviteMemberAction,
  revokeMembershipAction,
  updateMembershipRoleAction,
} from "./organization-membership";

const HOME_ORG_ID = "org-home";

const SESSION = {
  userId: "user-admin",
  email: "admin@example.com",
  name: "Admin",
  organizationId: HOME_ORG_ID,
  organizationName: "Home Co",
  isActive: true,
  roles: [
    {
      id: "role-admin",
      name: "admin",
      permissions: [{ resource: "organization_membership", action: "*" }],
    },
  ],
  accessPolicies: [],
  source: "demo" as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  requireSession.mockResolvedValue(SESSION);
  canWrite.mockResolvedValue(true);
  auditCreateMany.mockResolvedValue({ count: 1 });
  notificationSend.mockResolvedValue({ delivered: true, provider: "logging", durationMs: 0 });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("inviteMemberAction", () => {
  it("rejects an email with no existing account", async () => {
    getUserByEmail.mockResolvedValue(null);

    const result = await inviteMemberAction({ email: "nobody@example.com", role: "MEMBER" });

    expect(result.status).toBe("error");
    if (result.status === "error") expect(result.code).toBe("NOT_FOUND");
    expect(membershipUpsert).not.toHaveBeenCalled();
  });

  it("creates an ACTIVE membership and notifies the invited user", async () => {
    getUserByEmail.mockResolvedValue({ id: "user-2", email: "consultant@example.com" });
    membershipUpsert.mockResolvedValue({ id: "membership-1" });

    const result = await inviteMemberAction({ email: "consultant@example.com", role: "VIEWER" });

    expect(result.status).toBe("success");
    const call = membershipUpsert.mock.calls[0][0] as {
      where: { userId_organizationId: { userId: string; organizationId: string } };
      create: { status: string; role: string };
    };
    expect(call.where.userId_organizationId).toEqual({
      userId: "user-2",
      organizationId: HOME_ORG_ID,
    });
    expect(call.create.status).toBe("ACTIVE");
    expect(call.create.role).toBe("VIEWER");
    expect(notificationSend).toHaveBeenCalledTimes(1);
  });
});

describe("updateMembershipRoleAction", () => {
  it("refuses to touch a membership belonging to a different organization", async () => {
    membershipFindUnique.mockResolvedValue({
      id: "membership-1",
      organizationId: "org-other",
      role: "MEMBER",
    });

    const result = await updateMembershipRoleAction({ membershipId: "membership-1", role: "ADMIN" });

    expect(result.status).toBe("error");
    if (result.status === "error") expect(result.code).toBe("NOT_FOUND");
    expect(membershipUpdate).not.toHaveBeenCalled();
  });

  it("updates the role for a membership in the caller's own organization", async () => {
    membershipFindUnique.mockResolvedValue({
      id: "membership-1",
      organizationId: HOME_ORG_ID,
      role: "MEMBER",
    });
    membershipUpdate.mockResolvedValue({});

    const result = await updateMembershipRoleAction({ membershipId: "membership-1", role: "ADMIN" });

    expect(result.status).toBe("success");
    expect(membershipUpdate).toHaveBeenCalledWith({
      where: { id: "membership-1" },
      data: { role: "ADMIN" },
    });
  });
});

describe("revokeMembershipAction", () => {
  it("refuses to revoke a membership belonging to a different organization (cross-tenant regression)", async () => {
    membershipFindUnique.mockResolvedValue({
      id: "membership-1",
      organizationId: "org-other",
      userId: "user-2",
      status: "ACTIVE",
    });

    const result = await revokeMembershipAction({ membershipId: "membership-1" });

    expect(result.status).toBe("error");
    expect(membershipUpdate).not.toHaveBeenCalled();
  });

  it("sets status to REVOKED for a membership in the caller's own organization", async () => {
    membershipFindUnique.mockResolvedValue({
      id: "membership-1",
      organizationId: HOME_ORG_ID,
      userId: "user-2",
      status: "ACTIVE",
    });
    membershipUpdate.mockResolvedValue({});

    const result = await revokeMembershipAction({ membershipId: "membership-1" });

    expect(result.status).toBe("success");
    expect(membershipUpdate).toHaveBeenCalledWith({
      where: { id: "membership-1" },
      data: { status: "REVOKED" },
    });
  });
});
