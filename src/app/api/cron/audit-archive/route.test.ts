/**
 * `/api/cron/audit-archive` authenticates a scheduler with `CRON_SECRET` rather
 * than a user session or an API key — there is no user or organization behind a
 * cron trigger. It must fail closed: no secret configured, a missing header, or
 * a wrong secret all refuse the request rather than running unauthenticated.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const archiveAuditTrailOlderThan = vi.fn();
const auditTrailCreate = vi.fn();

vi.mock("@/lib/data/repositories/audit", () => ({
  archiveAuditTrailOlderThan: (...args: unknown[]) => archiveAuditTrailOlderThan(...args),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    auditTrail: { create: (...args: unknown[]) => auditTrailCreate(...args) },
  },
}));

import { POST } from "./route";

const ORIGINAL_SECRET = process.env.CRON_SECRET;
const ORIGINAL_RETENTION = process.env.AUDIT_RETENTION_DAYS;

function request(options: { readonly token?: string | null; readonly body?: unknown } = {}): Request {
  const headers = new Headers();
  if (options.token !== null) {
    headers.set("authorization", `Bearer ${options.token ?? "test-cron-secret"}`);
  }
  const init: RequestInit = { method: "POST", headers };
  if (options.body !== undefined) {
    init.body = JSON.stringify(options.body);
    headers.set("content-type", "application/json");
  }
  return new Request("http://localhost/api/cron/audit-archive", init);
}

beforeEach(() => {
  archiveAuditTrailOlderThan.mockReset();
  auditTrailCreate.mockReset();
  archiveAuditTrailOlderThan.mockResolvedValue({ archived: 0 });
  auditTrailCreate.mockResolvedValue({ id: "trail-new" });
  process.env.CRON_SECRET = "test-cron-secret";
  delete process.env.AUDIT_RETENTION_DAYS;
});

afterEach(() => {
  if (ORIGINAL_SECRET === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = ORIGINAL_SECRET;
  if (ORIGINAL_RETENTION === undefined) delete process.env.AUDIT_RETENTION_DAYS;
  else process.env.AUDIT_RETENTION_DAYS = ORIGINAL_RETENTION;
});

describe("POST /api/cron/audit-archive — authentication", () => {
  it("refuses every request when CRON_SECRET is not configured", async () => {
    delete process.env.CRON_SECRET;

    const response = await POST(request());

    expect(response.status).toBe(401);
    expect(archiveAuditTrailOlderThan).not.toHaveBeenCalled();
  });

  it("refuses a request with no Authorization header", async () => {
    const response = await POST(request({ token: null }));
    expect(response.status).toBe(401);
    expect(archiveAuditTrailOlderThan).not.toHaveBeenCalled();
  });

  it("refuses a request with the wrong secret", async () => {
    const response = await POST(request({ token: "wrong-secret" }));
    expect(response.status).toBe(401);
    expect(archiveAuditTrailOlderThan).not.toHaveBeenCalled();
  });

  it("accepts a request with the correct secret", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(archiveAuditTrailOlderThan).toHaveBeenCalledTimes(1);
  });
});

describe("POST /api/cron/audit-archive — behaviour", () => {
  it("resolves the retention window from AUDIT_RETENTION_DAYS", async () => {
    process.env.AUDIT_RETENTION_DAYS = "30";
    await POST(request());

    const cutoff = archiveAuditTrailOlderThan.mock.calls[0][0] as Date;
    const expected = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    expect(Math.abs(cutoff.getTime() - expected.getTime())).toBeLessThan(5_000);
  });

  it("lets a request body override the retention window", async () => {
    process.env.AUDIT_RETENTION_DAYS = "30";
    await POST(request({ body: { retentionDays: 7 } }));

    const cutoff = archiveAuditTrailOlderThan.mock.calls[0][0] as Date;
    const expected = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    expect(Math.abs(cutoff.getTime() - expected.getTime())).toBeLessThan(5_000);
  });

  it("writes a system-attributed audit entry when rows are archived", async () => {
    archiveAuditTrailOlderThan.mockResolvedValue({ archived: 5 });

    const response = await POST(request());
    const body = (await response.json()) as { data: { archived: number } };

    expect(body.data.archived).toBe(5);
    expect(auditTrailCreate).toHaveBeenCalledTimes(1);
    const payload = auditTrailCreate.mock.calls[0][0] as { data: { performedBy: string | null } };
    expect(payload.data.performedBy).toBe("system:cron");
  });

  it("writes no audit entry for a no-op run", async () => {
    archiveAuditTrailOlderThan.mockResolvedValue({ archived: 0 });

    await POST(request());

    expect(auditTrailCreate).not.toHaveBeenCalled();
  });

  it("tolerates a missing or malformed body", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
  });
});
