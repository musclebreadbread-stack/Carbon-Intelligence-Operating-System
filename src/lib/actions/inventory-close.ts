/**
 * Inventory period close/lock + approval workflow.
 *
 * Once a period is locked, mutations targeting that period return PERIOD_LOCKED.
 * The lock can only be released by an admin through the unlock action.
 */

"use server";

import { revalidatePath } from "next/cache";

import {
  type ActionState,
  actionError,
  actionSuccess,
  demoModeFailure,
  toActionError,
} from "@/lib/actions/types";
import { getSession } from "@/lib/auth/session";
import { canWrite } from "@/lib/data/db";
import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PeriodLockInput {
  readonly organizationId: string;
  readonly reportingYear: number;
  readonly reason?: string;
}

export interface PeriodApprovalInput {
  readonly organizationId: string;
  readonly reportingYear: number;
  readonly approved: boolean;
  readonly comment?: string;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/**
 * Request to close/lock a reporting period.
 */
export async function requestCloseAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const writable = await canWrite();
    if (!writable) return demoModeFailure();

    const session = await getSession();
    if (!session) {
      return actionError("UNAUTHORIZED", "Session expired", "action.error.UNAUTHORIZED");
    }

    const organizationId = formData.get("organizationId") as string;
    const reportingYear = Number(formData.get("reportingYear"));
    const reason = (formData.get("reason") as string) || "기간 마감 요청";

    if (!organizationId || !reportingYear) {
      return actionError("VALIDATION_ERROR", "Missing required fields", "action.error.VALIDATION_ERROR");
    }

    await prisma.emissionInventory.update({
      where: {
        organizationId_reportingYear: { organizationId, reportingYear },
      },
      data: {
        lockedAt: new Date(),
        lockedBy: session.userId,
        lockReason: reason,
        status: "locked",
      },
    });

    revalidatePath("/emission-engine");
    return actionSuccess({}, "Period close requested.", "action.success.requestClose");
  } catch (error) {
    return toActionError(error);
  }
}

/**
 * Approve a period close request.
 */
export async function approveCloseAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const writable = await canWrite();
    if (!writable) return demoModeFailure();

    const session = await getSession();
    if (!session) {
      return actionError("UNAUTHORIZED", "Session expired", "action.error.UNAUTHORIZED");
    }

    const organizationId = formData.get("organizationId") as string;
    const reportingYear = Number(formData.get("reportingYear"));

    if (!organizationId || !reportingYear) {
      return actionError("VALIDATION_ERROR", "Missing required fields", "action.error.VALIDATION_ERROR");
    }

    await prisma.emissionInventory.update({
      where: {
        organizationId_reportingYear: { organizationId, reportingYear },
      },
      data: {
        status: "approved",
        verifiedAt: new Date(),
      },
    });

    revalidatePath("/emission-engine");
    return actionSuccess({}, "Period close approved.", "action.success.approveClose");
  } catch (error) {
    return toActionError(error);
  }
}

/**
 * Reject a period close request.
 */
export async function rejectCloseAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const writable = await canWrite();
    if (!writable) return demoModeFailure();

    const session = await getSession();
    if (!session) {
      return actionError("UNAUTHORIZED", "Session expired", "action.error.UNAUTHORIZED");
    }

    const organizationId = formData.get("organizationId") as string;
    const reportingYear = Number(formData.get("reportingYear"));

    if (!organizationId || !reportingYear) {
      return actionError("VALIDATION_ERROR", "Missing required fields", "action.error.VALIDATION_ERROR");
    }

    await prisma.emissionInventory.update({
      where: {
        organizationId_reportingYear: { organizationId, reportingYear },
      },
      data: {
        lockedAt: null,
        lockedBy: null,
        lockReason: null,
        status: "draft",
      },
    });

    revalidatePath("/emission-engine");
    return actionSuccess({}, "Period close rejected.", "action.success.rejectClose");
  } catch (error) {
    return toActionError(error);
  }
}

/**
 * Unlock a locked period (admin only).
 */
export async function unlockPeriodAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const writable = await canWrite();
    if (!writable) return demoModeFailure();

    const session = await getSession();
    if (!session) {
      return actionError("UNAUTHORIZED", "Session expired", "action.error.UNAUTHORIZED");
    }

    const organizationId = formData.get("organizationId") as string;
    const reportingYear = Number(formData.get("reportingYear"));

    if (!organizationId || !reportingYear) {
      return actionError("VALIDATION_ERROR", "Missing required fields", "action.error.VALIDATION_ERROR");
    }

    await prisma.emissionInventory.update({
      where: {
        organizationId_reportingYear: { organizationId, reportingYear },
      },
      data: {
        lockedAt: null,
        lockedBy: null,
        lockReason: null,
        status: "draft",
      },
    });

    revalidatePath("/emission-engine");
    return actionSuccess({}, "Period unlocked.", "action.success.unlockPeriod");
  } catch (error) {
    return toActionError(error);
  }
}

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
