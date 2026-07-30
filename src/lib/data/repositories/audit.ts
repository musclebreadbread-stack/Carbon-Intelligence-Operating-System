/**
 * Audit-trail repository.
 *
 * Reads only. Audit entries are *written* by the server actions through
 * `buildAuditEntry`, never here, so there is exactly one place a mutation can be
 * recorded from.
 */

import type { AuditTrailQuery } from "@/lib/validation";
import { prisma } from "@/lib/prisma";

import { withDb } from "../db";

export type AuditTrailRow = {
  readonly id: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly action: string;
  readonly changes: Readonly<Record<string, unknown>> | null;
  readonly reason: string | null;
  readonly performedBy: string | null;
  readonly ipAddress: string | null;
  readonly timestamp: Date;
};

export async function listAuditTrail(
  query: AuditTrailQuery,
  options: { readonly limit?: number } = {},
): Promise<readonly AuditTrailRow[]> {
  return withDb<readonly AuditTrailRow[]>(
    async () => {
      const rows = await prisma.auditTrail.findMany({
        where: {
          ...(query.entityType ? { entityType: query.entityType } : {}),
          ...(query.entityId ? { entityId: query.entityId } : {}),
          ...(query.action ? { action: query.action } : {}),
          ...(query.performedBy ? { performedBy: query.performedBy } : {}),
          ...(query.from || query.to
            ? {
                timestamp: {
                  ...(query.from ? { gte: query.from } : {}),
                  ...(query.to ? { lte: query.to } : {}),
                },
              }
            : {}),
        },
        orderBy: { timestamp: "desc" },
        take: options.limit ?? 200,
      });
      return rows.map((row) => ({
        id: row.id,
        entityType: row.entityType,
        entityId: row.entityId,
        action: row.action,
        changes: (row.changes as Readonly<Record<string, unknown>> | null) ?? null,
        reason: row.reason,
        performedBy: row.performedBy,
        ipAddress: row.ipAddress,
        timestamp: row.timestamp,
      }));
    },
    // Nothing has been persisted in demo mode, so an empty trail is the honest
    // answer — inventing audit entries would be exactly the wrong fixture.
    () => [],
  );
}

export type AuditEvidenceRow = {
  readonly id: string;
  readonly auditTrailId: string | null;
  readonly type: string;
  readonly title: string;
  readonly hash: string | null;
  readonly fileUrl: string | null;
  readonly isVerified: boolean;
  readonly createdAt: Date;
};

export async function listAuditEvidence(
  auditTrailId: string,
): Promise<readonly AuditEvidenceRow[]> {
  return withDb<readonly AuditEvidenceRow[]>(
    async () => {
      const rows = await prisma.auditEvidence.findMany({
        where: { auditTrailId },
        orderBy: { createdAt: "desc" },
      });
      return rows.map((row) => ({
        id: row.id,
        auditTrailId: row.auditTrailId,
        type: row.type,
        title: row.title,
        hash: row.hash,
        fileUrl: row.fileUrl,
        isVerified: row.isVerified,
        createdAt: row.createdAt,
      }));
    },
    () => [],
  );
}

export type VersionHistoryRow = {
  readonly id: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly version: number;
  readonly changedBy: string | null;
  readonly createdAt: Date;
};

export async function listVersionHistory(
  entityType: string,
  entityId: string,
): Promise<readonly VersionHistoryRow[]> {
  return withDb<readonly VersionHistoryRow[]>(
    async () => {
      const rows = await prisma.versionHistory.findMany({
        where: { entityType, entityId },
        orderBy: { version: "desc" },
      });
      return rows.map((row) => ({
        id: row.id,
        entityType: row.entityType,
        entityId: row.entityId,
        version: row.version,
        changedBy: row.changedBy,
        createdAt: row.createdAt,
      }));
    },
    () => [],
  );
}
