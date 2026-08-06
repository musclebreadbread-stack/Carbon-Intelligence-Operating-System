/**
 * `archiveAuditTrailOlderThan` moves rows past a cutoff into `ArchivedAuditTrail`
 * and deletes them from the live table in one transaction. It has no `withDb`
 * fallback — unlike every read in this file, a database failure here must
 * surface as a failure, never a silent "nothing to archive".
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const findManyAuditTrail = vi.fn();
const createManyArchived = vi.fn();
const deleteManyAuditTrail = vi.fn();

let transactionCount = 0;
let transactionOps: unknown[] = [];

vi.mock("@/lib/prisma", () => ({
  prisma: {
    auditTrail: {
      findMany: (...args: unknown[]) => findManyAuditTrail(...args),
      deleteMany: (...args: unknown[]) => deleteManyAuditTrail(...args),
    },
    archivedAuditTrail: {
      createMany: (...args: unknown[]) => createManyArchived(...args),
    },
    $transaction: async (ops: Promise<unknown>[]) => {
      transactionCount += 1;
      transactionOps = ops;
      return Promise.all(ops);
    },
  },
}));

import { archiveAuditTrailOlderThan } from "./audit";

beforeEach(() => {
  transactionCount = 0;
  transactionOps = [];
  findManyAuditTrail.mockReset();
  createManyArchived.mockReset();
  deleteManyAuditTrail.mockReset();
  createManyArchived.mockResolvedValue({ count: 0 });
  deleteManyAuditTrail.mockResolvedValue({ count: 0 });
});

afterEach(() => {
  vi.restoreAllMocks();
});

const CUTOFF = new Date(Date.UTC(2024, 0, 1));

describe("archiveAuditTrailOlderThan", () => {
  it("does nothing and opens no transaction when no row is past the cutoff", async () => {
    findManyAuditTrail.mockResolvedValue([]);

    const outcome = await archiveAuditTrailOlderThan(CUTOFF);

    expect(outcome.archived).toBe(0);
    expect(transactionCount).toBe(0);
    expect(createManyArchived).not.toHaveBeenCalled();
    expect(deleteManyAuditTrail).not.toHaveBeenCalled();
  });

  it("queries rows strictly older than the cutoff", async () => {
    findManyAuditTrail.mockResolvedValue([]);
    await archiveAuditTrailOlderThan(CUTOFF);

    expect(findManyAuditTrail).toHaveBeenCalledWith({
      where: { timestamp: { lt: CUTOFF } },
    });
  });

  it("copies every field into ArchivedAuditTrail and deletes the originals in one transaction", async () => {
    findManyAuditTrail.mockResolvedValue([
      {
        id: "trail-1",
        entityType: "ActivityDataEntry",
        entityId: "entry-1",
        action: "create",
        changes: { quantity: { from: null, to: 100 } },
        reason: null,
        performedBy: "user-1",
        ipAddress: "10.0.0.1",
        timestamp: new Date(Date.UTC(2023, 0, 1)),
        createdAt: new Date(Date.UTC(2023, 0, 1)),
      },
      {
        id: "trail-2",
        entityType: "VerificationFinding",
        entityId: "finding-1",
        action: "update",
        changes: null,
        reason: "resolved",
        performedBy: null,
        ipAddress: null,
        timestamp: new Date(Date.UTC(2023, 5, 1)),
        createdAt: new Date(Date.UTC(2023, 5, 1)),
      },
    ]);

    const outcome = await archiveAuditTrailOlderThan(CUTOFF);

    expect(outcome.archived).toBe(2);
    expect(transactionCount).toBe(1);
    expect(transactionOps).toHaveLength(2);

    const archivedPayload = createManyArchived.mock.calls[0][0] as {
      data: { id: string; entityType: string }[];
    };
    expect(archivedPayload.data.map((row) => row.id)).toEqual(["trail-1", "trail-2"]);
    expect(archivedPayload.data[0]?.entityType).toBe("ActivityDataEntry");

    const deletePayload = deleteManyAuditTrail.mock.calls[0][0] as {
      where: { id: { in: string[] } };
    };
    expect(deletePayload.where.id.in).toEqual(["trail-1", "trail-2"]);
  });
});
