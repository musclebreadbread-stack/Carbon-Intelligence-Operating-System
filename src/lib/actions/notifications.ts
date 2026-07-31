"use server";

/**
 * Notification actions.
 *
 * Reading a notification is a mutation on the recipient's own row, so authorisation is
 * ownership rather than a permission: `requirePermission` in `runAction` still runs
 * (with the `notification` resource) and every query is additionally scoped to
 * `userId: session.userId`, so one user cannot dismiss another's notifications even
 * with a broad role.
 */

import { prisma } from "@/lib/prisma";
import { idSchema } from "@/lib/validation";
import { z } from "zod";

import { auditEntry, runAction } from "./runtime";
import type { ActionState } from "./types";

const PATHS = ["/notifications", "/dashboard"] as const;

const markReadSchema = z.object({
  organizationId: idSchema,
  notificationId: idSchema,
});

const markAllReadSchema = z.object({
  organizationId: idSchema,
});

/** Marks one notification read. */
export async function markNotificationReadAction(
  rawInput: unknown,
): Promise<ActionState<{ readonly id: string; readonly updated: number }>> {
  return runAction(
    {
      name: "markNotificationRead",
      resource: "notification",
      action: "update",
      schema: markReadSchema,
      revalidate: [...PATHS],
      handler: async ({ session, input, organizationId }) => {
        // `updateMany` rather than `update`: the where clause carries the ownership
        // check, so a notification belonging to someone else matches nothing and
        // returns `count: 0` instead of throwing a record-not-found that would tell
        // the caller the id exists.
        const result = await prisma.notification.updateMany({
          where: {
            id: input.notificationId,
            organizationId,
            userId: session.userId,
            isRead: false,
          },
          data: { isRead: true, readAt: new Date() },
        });

        return {
          data: { id: input.notificationId, updated: result.count },
          message:
            result.count > 0
              ? "Notification marked as read."
              : "Nothing to update — the notification was already read or is not yours.",
          messageKey: "action.success.markNotificationRead",
          audit: [
            auditEntry(session, {
              entityType: "Notification",
              entityId: input.notificationId,
              action: "update",
              before: { isRead: false },
              after: { isRead: true },
            }),
          ],
        };
      },
    },
    rawInput,
  );
}

/** Marks every unread notification for the signed-in user read. */
export async function markAllNotificationsReadAction(
  rawInput: unknown,
): Promise<ActionState<{ readonly updated: number }>> {
  return runAction(
    {
      name: "markAllNotificationsRead",
      resource: "notification",
      action: "update",
      schema: markAllReadSchema,
      revalidate: [...PATHS],
      handler: async ({ session, organizationId }) => {
        const result = await prisma.notification.updateMany({
          where: { organizationId, userId: session.userId, isRead: false },
          data: { isRead: true, readAt: new Date() },
        });

        return {
          data: { updated: result.count },
          message: `Marked ${result.count} notification(s) as read.`,
          messageKey: "action.success.markAllNotificationsRead",
          audit: [
            auditEntry(session, {
              entityType: "Notification",
              entityId: session.userId,
              action: "update",
              after: { markedRead: result.count },
              reason: "Bulk mark-all-read",
            }),
          ],
        };
      },
    },
    rawInput,
  );
}
