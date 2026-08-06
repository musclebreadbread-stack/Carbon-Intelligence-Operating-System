/**
 * `POST /api/cron/audit-archive`
 *
 * Deliberately outside `/api/v1`: that surface authenticates a tenant caller
 * with an `APIKey` bearer token via `withApiKey`; this route authenticates a
 * single operations caller — a scheduler — with a shared secret instead, since
 * there is no user or organization behind a cron trigger.
 *
 * Fails closed: a missing or misconfigured `CRON_SECRET` refuses every request
 * rather than accepting an unauthenticated one. The actual production trigger
 * (Vercel Cron's `vercel.json` "crons" entry, or an external scheduler hitting
 * this URL) is a deployment decision made once real infrastructure exists —
 * this route and `archiveAuditTrailOlderThan` are fully testable without one.
 */

import { timingSafeEqual } from "node:crypto";

import { buildAuditEntry } from "@/lib/domain/audit/diff";
import { DEFAULT_AUDIT_RETENTION_DAYS, retentionCutoff } from "@/lib/domain/audit/retention";
import { archiveAuditTrailOlderThan } from "@/lib/data/repositories/audit";
import { prisma } from "@/lib/prisma";

import { jsonError, jsonOk } from "../../v1/_lib/handler";

const BEARER_PREFIX = /^Bearer\s+/i;
const CRON_PERFORMER = "system:cron";

function presentedSecret(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header || !BEARER_PREFIX.test(header)) return null;
  const token = header.replace(BEARER_PREFIX, "").trim();
  return token.length > 0 ? token : null;
}

/** Constant-time comparison; differing lengths are compared against a padded buffer to avoid a length oracle. */
function secretsMatch(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) {
    timingSafeEqual(bufferA, bufferA);
    return false;
  }
  return timingSafeEqual(bufferA, bufferB);
}

function resolveRetentionDays(override: unknown): number {
  if (typeof override === "number" && Number.isFinite(override) && override > 0) {
    return Math.floor(override);
  }
  const configured = Number(process.env.AUDIT_RETENTION_DAYS);
  return Number.isFinite(configured) && configured > 0
    ? Math.floor(configured)
    : DEFAULT_AUDIT_RETENTION_DAYS;
}

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.trim().length === 0) {
    return jsonError(
      "UNAUTHORIZED",
      "CRON_SECRET is not configured; every request to this route is refused.",
    );
  }

  const presented = presentedSecret(request);
  if (!presented || !secretsMatch(presented, secret.trim())) {
    return jsonError("UNAUTHORIZED", "Invalid or missing cron secret.");
  }

  const body = (await request.json().catch(() => ({}))) as { readonly retentionDays?: unknown };
  const retentionDays = resolveRetentionDays(body.retentionDays);
  const cutoff = retentionCutoff(retentionDays, new Date());

  const { archived } = await archiveAuditTrailOlderThan(cutoff);

  if (archived > 0) {
    const entry = buildAuditEntry({
      entityType: "AuditTrail",
      entityId: "bulk-archive",
      action: "delete",
      after: { archived, retentionDays, cutoff: cutoff.toISOString() },
      performedBy: CRON_PERFORMER,
      reason: `Retention archive: rows older than ${retentionDays} day(s)`,
    });
    await prisma.auditTrail.create({
      data: {
        entityType: entry.record.entityType,
        entityId: entry.record.entityId,
        action: entry.record.action,
        changes: entry.record.changes as never,
        reason: entry.record.reason,
        performedBy: entry.record.performedBy,
        ipAddress: entry.record.ipAddress,
      },
    });
  }

  return jsonOk({ archived, retentionDays, cutoff: cutoff.toISOString() });
}
