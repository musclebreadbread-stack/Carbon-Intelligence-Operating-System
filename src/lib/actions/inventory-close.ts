/**
 * Inventory period close/lock + approval workflow.
 *
 * Once a period is locked, mutations targeting that period return PERIOD_LOCKED.
 * The lock can only be released by an admin through the unlock action.
 *
 * Refactored to use `runAction` boundary: requireSession -> zod -> requirePermission
 * -> domain -> persist -> audit -> revalidate. The client's organizationId is never
 * trusted; the session provides it.
 */

"use server";

import { prisma } from "@/lib/prisma";
import {
  periodApprovalSchema,
  periodCloseRequestSchema,
  periodUnlockSchema,
} from "@/lib/validation";

import { auditEntry, runAction } from "./runtime";
import { type ActionState, actionError } from "./types";

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

const PATHS = ["/emission-engine", "/dashboard"] as const;

/**
 * Request to close/lock a reporting period.
 */
export async function requestCloseAction(
  rawInput: unknown,
): Promise<ActionState<{ readonly reportingYear: number }>> {
  return runAction(
    {
      name: "requestClose",
      resource: "calculation",
      action: "approve",
      schema: periodCloseRequestSchema,
      revalidate: [...PATHS],
      handler: async ({ session, input, organizationId }) => {
        await prisma.emissionInventory.update({
          where: {
            organizationId_reportingYear: { organizationId, reportingYear: input.reportingYear },
          },
          data: {
            lockedAt: new Date(),
            lockedBy: session.userId,
            lockReason: input.reason,
            status: "locked",
          },
        });

        return {
          data: { reportingYear: input.reportingYear },
          message: "Period close requested.",
          messageKey: "action.success.requestClose",
          audit: [
            auditEntry(session, {
              entityType: "EmissionInventory",
              entityId: `${organizationId}:${input.reportingYear}`,
              action: "update",
              after: { status: "locked", reason: input.reason },
            }),
          ],
        };
      },
    },
    rawInput,
  );
}

/**
 * Approve a period close request.
 */
export async function approveCloseAction(
  rawInput: unknown,
): Promise<ActionState<{ readonly reportingYear: number }>> {
  return runAction(
    {
      name: "approveClose",
      resource: "calculation",
      action: "approve",
      schema: periodApprovalSchema,
      revalidate: [...PATHS],
      handler: async ({ session, input, organizationId }) => {
        await prisma.emissionInventory.update({
          where: {
            organizationId_reportingYear: { organizationId, reportingYear: input.reportingYear },
          },
          data: {
            status: "approved",
            verifiedAt: new Date(),
          },
        });

        return {
          data: { reportingYear: input.reportingYear },
          message: "Period close approved.",
          messageKey: "action.success.approveClose",
          audit: [
            auditEntry(session, {
              entityType: "EmissionInventory",
              entityId: `${organizationId}:${input.reportingYear}`,
              action: "update",
              after: { status: "approved" },
            }),
          ],
        };
      },
    },
    rawInput,
  );
}

/**
 * Reject a period close request.
 */
export async function rejectCloseAction(
  rawInput: unknown,
): Promise<ActionState<{ readonly reportingYear: number }>> {
  return runAction(
    {
      name: "rejectClose",
      resource: "calculation",
      action: "approve",
      schema: periodApprovalSchema,
      revalidate: [...PATHS],
      handler: async ({ session, input, organizationId }) => {
        await prisma.emissionInventory.update({
          where: {
            organizationId_reportingYear: { organizationId, reportingYear: input.reportingYear },
          },
          data: {
            lockedAt: null,
            lockedBy: null,
            lockReason: null,
            status: "draft",
          },
        });

        return {
          data: { reportingYear: input.reportingYear },
          message: "Period close rejected.",
          messageKey: "action.success.rejectClose",
          audit: [
            auditEntry(session, {
              entityType: "EmissionInventory",
              entityId: `${organizationId}:${input.reportingYear}`,
              action: "update",
              after: { status: "draft" },
              reason: input.comment ?? null,
            }),
          ],
        };
      },
    },
    rawInput,
  );
}

/**
 * Unlock a locked period (admin only).
 */
export async function unlockPeriodAction(
  rawInput: unknown,
): Promise<ActionState<{ readonly reportingYear: number }>> {
  return runAction(
    {
      name: "unlockPeriod",
      resource: "calculation",
      action: "approve",
      schema: periodUnlockSchema,
      revalidate: [...PATHS],
      handler: async ({ session, input, organizationId }) => {
        await prisma.emissionInventory.update({
          where: {
            organizationId_reportingYear: { organizationId, reportingYear: input.reportingYear },
          },
          data: {
            lockedAt: null,
            lockedBy: null,
            lockReason: null,
            status: "draft",
          },
        });

        return {
          data: { reportingYear: input.reportingYear },
          message: "Period unlocked.",
          messageKey: "action.success.unlockPeriod",
          audit: [
            auditEntry(session, {
              entityType: "EmissionInventory",
              entityId: `${organizationId}:${input.reportingYear}`,
              action: "update",
              after: { status: "draft" },
              reason: input.reason ?? null,
            }),
          ],
        };
      },
    },
    rawInput,
  );
}

// ---------------------------------------------------------------------------
// Period-lock guard utilities (used by other action modules)
// ---------------------------------------------------------------------------

/**
 * Check if a period is locked. Used by mutation guards.
 */
export function isPeriodLocked(inventory: {
  lockedAt: Date | null;
  status: string;
}): boolean {
  return inventory.lockedAt !== null || inventory.status === "locked" || inventory.status === "approved";
}

/**
 * Guard: returns PERIOD_LOCKED error if the period is locked.
 */
export function periodLockGuard(inventory: {
  lockedAt: Date | null;
  status: string;
}): ActionState | null {
  if (isPeriodLocked(inventory)) {
    return actionError(
      "CONFLICT",
      "This period is locked. Unlock it before making changes.",
      "action.error.PERIOD_LOCKED",
    );
  }
  return null;
}

/**
 * Throws a `PeriodLockedError` if the given reporting year is locked.
 *
 * Designed for use inside `runAction` handlers: the thrown error is caught by
 * the runtime and converted to `{status:'error', code:'CONFLICT'}`.
 */
export async function assertPeriodNotLocked(
  organizationId: string,
  reportingYear: number,
): Promise<void> {
  const inventory = await prisma.emissionInventory.findUnique({
    where: { organizationId_reportingYear: { organizationId, reportingYear } },
    select: { lockedAt: true, status: true },
  });
  // If no inventory exists yet, the period is open by definition.
  if (!inventory) return;
  if (isPeriodLocked(inventory)) {
    throw new PeriodLockedError(reportingYear);
  }
}

/**
 * Sentinel error for a locked-period write attempt.
 *
 * Caught by the `runAction` catch block and converted into an `ActionError` with
 * code `CONFLICT` and `messageKey` `action.error.PERIOD_LOCKED`.
 */
export class PeriodLockedError extends Error {
  readonly code = "PERIOD_LOCKED" as const;
  readonly reportingYear: number;
  constructor(reportingYear: number) {
    super(`Reporting year ${reportingYear} is locked. Unlock it before making changes.`);
    this.name = "PeriodLockedError";
    this.reportingYear = reportingYear;
  }
}
