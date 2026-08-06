/**
 * `rotateFieldEncryptionAction` re-encrypts every `DataSource.credentials` row
 * still tagged `v1` under `FIELD_ENCRYPTION_KEY_V2`, leaving rows that are
 * already `v2` or unencrypted untouched, and refuses outright when a rotation
 * key has not been configured — it must never silently do nothing.
 */

import { randomBytes } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { UnauthorizedError } from "@/lib/core/errors";
import { encryptField, resolveKeyForVersion } from "@/lib/security/field-crypto";

const requireSession = vi.fn();
const canWrite = vi.fn();
const revalidatePath = vi.fn();
const auditCreateMany = vi.fn();
const findManyDataSources = vi.fn();
const updateDataSource = vi.fn();

let transactionCount = 0;

vi.mock("@/lib/prisma", () => ({
  prisma: {
    dataSource: {
      findMany: (...args: unknown[]) => findManyDataSources(...args),
      update: (...args: unknown[]) => updateDataSource(...args),
    },
    $transaction: async (operations: unknown[]) => {
      transactionCount += 1;
      return Promise.all(operations);
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

import { DEMO_ORGANIZATION_ID } from "@/lib/data/demo";

import { rotateFieldEncryptionAction } from "./security-rotation";

const KEY_V1 = randomBytes(32);
const KEY_V1_BASE64 = KEY_V1.toString("base64");
const KEY_V2 = randomBytes(32);
const KEY_V2_BASE64 = KEY_V2.toString("base64");
const ORIGINAL_KEY = process.env.FIELD_ENCRYPTION_KEY;
const ORIGINAL_KEY_V2 = process.env.FIELD_ENCRYPTION_KEY_V2;

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
      permissions: [{ resource: "security", action: "update" }],
    },
  ],
  accessPolicies: [],
  source: "demo" as const,
};

beforeEach(() => {
  transactionCount = 0;
  requireSession.mockReset();
  canWrite.mockReset();
  revalidatePath.mockReset();
  auditCreateMany.mockReset();
  findManyDataSources.mockReset();
  updateDataSource.mockReset();

  requireSession.mockResolvedValue(SESSION);
  canWrite.mockResolvedValue(true);
  auditCreateMany.mockResolvedValue({ count: 1 });
  updateDataSource.mockImplementation(async ({ where }: { where: { id: string } }) => ({
    id: where.id,
  }));

  process.env.FIELD_ENCRYPTION_KEY = KEY_V1_BASE64;
  process.env.FIELD_ENCRYPTION_KEY_V2 = KEY_V2_BASE64;
});

afterEach(() => {
  vi.restoreAllMocks();
  if (ORIGINAL_KEY === undefined) delete process.env.FIELD_ENCRYPTION_KEY;
  else process.env.FIELD_ENCRYPTION_KEY = ORIGINAL_KEY;
  if (ORIGINAL_KEY_V2 === undefined) delete process.env.FIELD_ENCRYPTION_KEY_V2;
  else process.env.FIELD_ENCRYPTION_KEY_V2 = ORIGINAL_KEY_V2;
});

describe("rotateFieldEncryptionAction — gates", () => {
  it("returns UNAUTHORIZED and rotates nothing without a session", async () => {
    requireSession.mockRejectedValue(new UnauthorizedError("No session"));

    const state = await rotateFieldEncryptionAction({});

    expect(state.status).toBe("error");
    if (state.status !== "error") throw new Error("expected an error state");
    expect(state.code).toBe("UNAUTHORIZED");
    expect(findManyDataSources).not.toHaveBeenCalled();
  });

  it("returns DEMO_MODE rather than pretending to rotate with no database", async () => {
    canWrite.mockResolvedValue(false);

    const state = await rotateFieldEncryptionAction({});

    expect(state.status).toBe("error");
    if (state.status !== "error") throw new Error("expected an error state");
    expect(state.code).toBe("DEMO_MODE");
    expect(findManyDataSources).not.toHaveBeenCalled();
  });

  it("refuses when no rotation key is configured", async () => {
    delete process.env.FIELD_ENCRYPTION_KEY_V2;

    const state = await rotateFieldEncryptionAction({});

    expect(state.status).toBe("error");
    if (state.status !== "error") throw new Error("expected an error state");
    expect(state.message).toContain("FIELD_ENCRYPTION_KEY_V2");
    expect(findManyDataSources).not.toHaveBeenCalled();
  });
});

describe("rotateFieldEncryptionAction — rotation", () => {
  it("rotates every v1 row and leaves v2 and plaintext rows alone", async () => {
    const v1Encrypted = encryptField(JSON.stringify({ token: "secret-1" }), resolveKeyForVersion("v1"));
    const alreadyV2 = encryptField(JSON.stringify({ token: "secret-2" }), KEY_V2, "v2");

    findManyDataSources.mockResolvedValue([
      { id: "ds-1", credentials: v1Encrypted },
      { id: "ds-2", credentials: alreadyV2 },
      { id: "ds-3", credentials: null },
      { id: "ds-4", credentials: "plain-unencrypted-string" },
    ]);

    const state = await rotateFieldEncryptionAction({});

    expect(state.status).toBe("success");
    if (state.status !== "success") throw new Error(state.message);
    expect(state.data.rotated).toBe(1);
    expect(state.data.skipped).toBe(3);
    expect(transactionCount).toBe(1);
    expect(updateDataSource).toHaveBeenCalledTimes(1);

    const written = updateDataSource.mock.calls[0][0] as {
      where: { id: string };
      data: { credentials: string };
    };
    expect(written.where.id).toBe("ds-1");
    expect(written.data.credentials.startsWith("v2.")).toBe(true);
  });

  it("writes nothing and opens no transaction when every row is already rotated", async () => {
    findManyDataSources.mockResolvedValue([
      { id: "ds-1", credentials: encryptField("x", KEY_V2, "v2") },
    ]);

    const state = await rotateFieldEncryptionAction({});

    expect(state.status).toBe("success");
    if (state.status !== "success") throw new Error(state.message);
    expect(state.data.rotated).toBe(0);
    expect(transactionCount).toBe(0);
    expect(updateDataSource).not.toHaveBeenCalled();
  });

  it("audits the batch rotation", async () => {
    findManyDataSources.mockResolvedValue([
      { id: "ds-1", credentials: encryptField("x", resolveKeyForVersion("v1")) },
    ]);

    const state = await rotateFieldEncryptionAction({});

    if (state.status !== "success") throw new Error(state.message);
    expect(auditCreateMany).toHaveBeenCalledTimes(1);
    const payload = auditCreateMany.mock.calls[0][0] as {
      data: { entityType: string; reason: string | null }[];
    };
    expect(payload.data[0]?.entityType).toBe("DataSource");
    expect(payload.data[0]?.reason).toContain("rotation");
  });
});
