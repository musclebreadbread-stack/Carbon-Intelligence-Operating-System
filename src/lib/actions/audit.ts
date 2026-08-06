"use server";

/**
 * Audit-log retention.
 *
 * `archiveAuditTrailAction` moves `AuditTrail` rows past the retention window
 * into `ArchivedAuditTrail` — a structurally identical table, not a soft-delete
 * flag, so archived entries stay queryable. An audit trail that cannot be
 * re-read is not provable.
 *
 * This is the reusable unit both a manual trigger and the scheduled route
 * (`/api/cron/audit-archive`) call; the route only adds the shared-secret auth a
 * cron caller needs instead of a user session.
 */

import { z } from "zod";

import { DEFAULT_AUDIT_RETENTION_DAYS, retentionCutoff } from "@/lib/domain/audit/retention";
import { archiveAuditTrailOlderThan } from "@/lib/data/repositories/audit";

import { auditEntry, runAction } from "./runtime";
import type { ActionState } from "./types";

const archiveAuditTrailInputSchema = z.object({
  /** Overrides AUDIT_RETENTION_DAYS for this run. */
  retentionDays: z.number().int().positive().nullish(),
});

export type ArchiveAuditTrailResult = {
  readonly archived: number;
  readonly retentionDays: number;
  readonly cutoff: string;
};

function resolveRetentionDays(override: number | null | undefined): number {
  if (override) return override;
  const configured = Number(process.env.AUDIT_RETENTION_DAYS);
  return Number.isFinite(configured) && configured > 0
    ? Math.floor(configured)
    : DEFAULT_AUDIT_RETENTION_DAYS;
}

export async function archiveAuditTrailAction(
  rawInput: unknown,
): Promise<ActionState<ArchiveAuditTrailResult>> {
  return runAction(
    {
      name: "archiveAuditTrail",
      resource: "audit",
      action: "archive",
      schema: archiveAuditTrailInputSchema,
      revalidate: ["/security"],
      handler: async ({ session, input }) => {
        const retentionDays = resolveRetentionDays(input.retentionDays);
        const cutoff = retentionCutoff(retentionDays, new Date());

        const { archived } = await archiveAuditTrailOlderThan(cutoff);

        if (archived === 0) {
          return {
            data: { archived: 0, retentionDays, cutoff: cutoff.toISOString() },
            message: `No audit rows are older than ${retentionDays} day(s).`,
            messageKey: "action.success.archiveAuditTrail",
          };
        }

        return {
          data: { archived, retentionDays, cutoff: cutoff.toISOString() },
          message: `Archived ${archived} audit trail row(s) older than ${retentionDays} day(s).`,
          messageKey: "action.success.archiveAuditTrail",
          audit: [
            auditEntry(session, {
              entityType: "AuditTrail",
              entityId: "bulk-archive",
              action: "delete",
              after: { archived, retentionDays, cutoff: cutoff.toISOString() },
              reason: `Retention archive: rows older than ${retentionDays} day(s)`,
            }),
          ],
        };
      },
    },
    rawInput,
  );
}
