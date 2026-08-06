/**
 * `archiveAuditTrailAction` is the session-gated wrapper around
 * `archiveAuditTrailOlderThan` — used by a manual "Archive now" trigger, as
 * opposed to the CRON_SECRET-gated route used by a scheduler. These cases pin
 * the retention-day resolution order (explicit input > AUDIT_RETENTION_DAYS >
 * the 365-day default) and that a real archive is audited while a no-op is not.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { UnauthorizedError } from "@/lib/core/errors";

const requireSession = vi.fn();
const canWrite = vi.fn();
const revalidatePath = vi.fn();
const auditCreateMany = vi.fn();
const archiveAuditTrailOlderThan = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
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

vi.mock("@/lib/data/repositories/audit", () => ({
  archiveAuditTrailOlderThan: (...args: unknown[]) => archiveAuditTrailOlderThan(...args),
}));

import { DEMO_ORGANIZATION_ID } from "@/lib/data/demo";

import { archiveAuditTrailAction } from "./audit";

const SESSION = {
  userId: "user-1",
  email: "admin@example.com",
  name: "Admin",
  organizationId: DEMO_ORGANIZATION_ID,
  organizationName: "Demo",
  isActive: true,
  roles: [
    {
      id: "role-admin",
      name: "admin",
      permissions: [{ resource: "audit", action: "archive" }],
    },
  ],
  accessPolicies: [],
  source: "demo" as const,
};

const ORIGINAL_RETENTION = process.env.AUDIT_RETENTION_DAYS;

beforeEach(() => {
  requireSession.mockReset();
  canWrite.mockReset();
  revalidatePath.mockReset();
  auditCreateMany.mockReset();
  archiveAuditTrailOlderThan.mockReset();

  requireSession.mockResolvedValue(SESSION);
  canWrite.mockResolvedValue(true);
  auditCreateMany.mockResolvedValue({ count: 1 });
  archiveAuditTrailOlderThan.mockResolvedValue({ archived: 0 });
  delete process.env.AUDIT_RETENTION_DAYS;
});

afterEach(() => {
  vi.restoreAllMocks();
  if (ORIGINAL_RETENTION === undefined) delete process.env.AUDIT_RETENTION_DAYS;
  else process.env.AUDIT_RETENTION_DAYS = ORIGINAL_RETENTION;
});

describe("archiveAuditTrailAction — gates", () => {
  it("returns UNAUTHORIZED and archives nothing without a session", async () => {
    requireSession.mockRejectedValue(new UnauthorizedError("No session"));

    const state = await archiveAuditTrailAction({});

    expect(state.status).toBe("error");
    if (state.status !== "error") throw new Error("expected an error state");
    expect(state.code).toBe("UNAUTHORIZED");
    expect(archiveAuditTrailOlderThan).not.toHaveBeenCalled();
  });

  it("returns DEMO_MODE rather than pretending to archive with no database", async () => {
    canWrite.mockResolvedValue(false);

    const state = await archiveAuditTrailAction({});

    expect(state.status).toBe("error");
    if (state.status !== "error") throw new Error("expected an error state");
    expect(state.code).toBe("DEMO_MODE");
    expect(archiveAuditTrailOlderThan).not.toHaveBeenCalled();
  });
});

describe("archiveAuditTrailAction — retention resolution", () => {
  it("defaults to 365 days when nothing is configured", async () => {
    await archiveAuditTrailAction({});

    const cutoff = archiveAuditTrailOlderThan.mock.calls[0][0] as Date;
    const expected = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    expect(Math.abs(cutoff.getTime() - expected.getTime())).toBeLessThan(5_000);
  });

  it("honours AUDIT_RETENTION_DAYS when set", async () => {
    process.env.AUDIT_RETENTION_DAYS = "30";
    await archiveAuditTrailAction({});

    const cutoff = archiveAuditTrailOlderThan.mock.calls[0][0] as Date;
    const expected = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    expect(Math.abs(cutoff.getTime() - expected.getTime())).toBeLessThan(5_000);
  });

  it("prefers an explicit retentionDays input over the env default", async () => {
    process.env.AUDIT_RETENTION_DAYS = "30";
    await archiveAuditTrailAction({ retentionDays: 7 });

    const cutoff = archiveAuditTrailOlderThan.mock.calls[0][0] as Date;
    const expected = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    expect(Math.abs(cutoff.getTime() - expected.getTime())).toBeLessThan(5_000);
  });
});

describe("archiveAuditTrailAction — audit trail", () => {
  it("audits a real archive but not a no-op run", async () => {
    archiveAuditTrailOlderThan.mockResolvedValue({ archived: 12 });
    const state = await archiveAuditTrailAction({});

    expect(state.status).toBe("success");
    if (state.status !== "success") throw new Error(state.message);
    expect(state.data.archived).toBe(12);
    expect(auditCreateMany).toHaveBeenCalledTimes(1);
  });

  it("does not write an audit entry when nothing was archived", async () => {
    archiveAuditTrailOlderThan.mockResolvedValue({ archived: 0 });
    const state = await archiveAuditTrailAction({});

    expect(state.status).toBe("success");
    if (state.status !== "success") throw new Error(state.message);
    expect(state.data.archived).toBe(0);
    expect(auditCreateMany).not.toHaveBeenCalled();
  });
});
