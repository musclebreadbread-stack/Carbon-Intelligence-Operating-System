/**
 * Notification repository.
 *
 * In-app delivery is the one channel this system completes on its own, so this is
 * where a `notify` rule effect stops being a plan and becomes something a person can
 * see. Reads go through `withDb` like every other repository, so the notification
 * centre renders in demo mode too — from fixtures, clearly labelled.
 */

import type { NotificationType } from "@/lib/core/enums";
import type { NotificationPlan } from "@/lib/domain/notifications/deliver";
import { prisma } from "@/lib/prisma";

import { withDb } from "../db";
import { DEMO_NOTIFICATIONS, type DemoNotification } from "../demo";

export type NotificationRow = DemoNotification;

/** One `Notification` row as this repository writes it. */
type NotificationCreateRow = {
  // The enum member, not `string`: Prisma's generated input type is the literal union
  // and `src/lib/core/enums.ts` is the shared source of the same members.
  type: NotificationType;
  title: string;
  message: string;
  channel: string;
  userId: string;
  organizationId: string;
  actionUrl: string | null;
  metadata: never;
  expiresAt: Date | null;
};

/**
 * The Prisma surface this repository needs.
 *
 * Structural rather than `PrismaClient`, so a `$transaction` client satisfies it too —
 * that is what lets notifications be committed with the work that raised them. The
 * array is mutable and the argument object is not `readonly`, matching Prisma's own
 * generated signature; making them readonly here would make the real client
 * unassignable.
 */
type NotificationWriter = {
  notification: {
    createMany: (args: {
      data: NotificationCreateRow[];
    }) => Promise<{ count: number }>;
  };
};

/**
 * Writes notification plans as `Notification` rows.
 *
 * Takes the client as a parameter so the caller can pass a transaction client and
 * have the notifications committed with the work that raised them — a notification
 * about a write that was rolled back would be a lie.
 *
 * Plans whose channel needs an external transport are persisted too, with their
 * channel intact. They are visible in the notification centre as "not sent", so an
 * operator can see exactly what is waiting on a transport they have not configured
 * instead of the notification being silently lost.
 *
 * A plan with no resolvable recipient is skipped rather than written against a
 * fabricated user id.
 */
export async function persistNotifications(
  client: NotificationWriter,
  plans: readonly NotificationPlan[],
): Promise<number> {
  const addressed = plans.filter(
    (plan): plan is NotificationPlan & { readonly userId: string } => plan.userId !== null,
  );
  if (addressed.length === 0) return 0;

  const result = await client.notification.createMany({
    data: addressed.map((plan) => ({
      type: plan.type,
      title: plan.title,
      message: plan.message,
      channel: plan.channel,
      userId: plan.userId,
      organizationId: plan.organizationId,
      actionUrl: plan.actionUrl,
      metadata: plan.metadata as never,
      expiresAt: plan.expiresAt,
    })),
  });
  return result.count;
}

export type ListNotificationsOptions = {
  readonly unreadOnly?: boolean;
  readonly limit?: number;
};

/**
 * Notifications addressed to one recipient, newest first.
 *
 * `userId` is required, not optional. It used to be optional and neither the
 * notification centre nor the header badge passed it, so every member of an
 * organisation read every other member's messages — including their deep links. A
 * recipient filter that a caller can forget is not a filter.
 */
export async function listNotifications(
  organizationId: string,
  userId: string,
  options: ListNotificationsOptions = {},
): Promise<readonly NotificationRow[]> {
  const limit = options.limit ?? 50;
  return withDb<readonly NotificationRow[]>(
    async () => {
      const rows = await prisma.notification.findMany({
        where: {
          organizationId,
          userId,
          ...(options.unreadOnly === true ? { isRead: false } : {}),
          // An expired notification is noise, not history: the audit trail is where
          // history lives.
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        orderBy: { createdAt: "desc" },
        take: limit,
      });
      return rows.map((row) => ({
        id: row.id,
        organizationId: row.organizationId,
        userId: row.userId,
        type: row.type,
        title: row.title,
        message: row.message,
        channel: row.channel,
        isRead: row.isRead,
        readAt: row.readAt,
        actionUrl: row.actionUrl,
        expiresAt: row.expiresAt,
        createdAt: row.createdAt,
      }));
    },
    () =>
      DEMO_NOTIFICATIONS.filter(
        (notification) =>
          notification.organizationId === organizationId &&
          notification.userId === userId &&
          (options.unreadOnly !== true || !notification.isRead),
      ).slice(0, limit),
  );
}

/** Unread count for the header badge, for one recipient. */
export async function countUnreadNotifications(
  organizationId: string,
  userId: string,
): Promise<number> {
  return withDb<number>(
    async () =>
      prisma.notification.count({
        where: {
          organizationId,
          isRead: false,
          userId,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
      }),
    () =>
      DEMO_NOTIFICATIONS.filter(
        (notification) =>
          notification.organizationId === organizationId &&
          notification.userId === userId &&
          !notification.isRead,
      ).length,
  );
}
