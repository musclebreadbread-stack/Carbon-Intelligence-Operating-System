"use client";

/**
 * In-app notification list with mark-as-read.
 *
 * The mark-read actions are passed the organisation id and nothing else identifying
 * the recipient: the action scopes every update to `session.userId` server-side, so a
 * crafted call cannot dismiss someone else's notification.
 */

import * as React from "react";
import Link from "next/link";
import { Check, CheckCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ActionError } from "@/components/shared/form/action-error";
import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "@/lib/actions/notifications";
import { IDLE_ACTION_STATE, type ActionState } from "@/lib/actions/types";

export type NotificationItem = {
  readonly id: string;
  readonly type: string;
  readonly title: string;
  readonly message: string;
  readonly channel: string;
  readonly isRead: boolean;
  readonly actionUrl: string | null;
  readonly createdAt: string;
  readonly tone: string;
};

export type NotificationListProps = {
  readonly organizationId: string;
  readonly notifications: readonly NotificationItem[];
};

export function NotificationList({ organizationId, notifications }: NotificationListProps) {
  const [state, setState] = React.useState<ActionState<unknown>>(IDLE_ACTION_STATE);
  const [pending, startTransition] = React.useTransition();

  const unreadCount = notifications.filter((notification) => !notification.isRead).length;

  function markOne(notificationId: string) {
    startTransition(async () => {
      setState(await markNotificationReadAction({ organizationId, notificationId }));
    });
  }

  function markAll() {
    startTransition(async () => {
      setState(await markAllNotificationsReadAction({ organizationId }));
    });
  }

  return (
    <div className="space-y-3" data-testid="notification-list">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {unreadCount} unread of {notifications.length}
        </p>
        <Button
          size="sm"
          variant="outline"
          onClick={markAll}
          disabled={pending || unreadCount === 0}
        >
          <CheckCheck className="size-3.5" />
          Mark all read
        </Button>
      </div>

      <ActionError state={state} showSuccess={false} />

      <ul className="space-y-2">
        {notifications.map((notification) => (
          <li
            key={notification.id}
            data-testid={`notification-${notification.id}`}
            className={
              notification.isRead
                ? "rounded-lg border p-3 opacity-70"
                : "rounded-lg border bg-muted/30 p-3"
            }
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="outline" className={notification.tone}>
                    {notification.type}
                  </Badge>
                  <span className="text-sm font-medium">{notification.title}</span>
                  {!notification.isRead && (
                    <Badge variant="secondary" className="text-[10px]">
                      unread
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">{notification.message}</p>
                <p className="text-xs text-muted-foreground">{notification.createdAt}</p>
              </div>
              <div className="flex items-center gap-1.5">
                {notification.actionUrl !== null && (
                  <Button size="sm" variant="ghost" render={<Link href={notification.actionUrl} />}>
                    Open
                  </Button>
                )}
                {!notification.isRead && (
                  <Button
                    size="sm"
                    variant="outline"
                    aria-label={`Mark "${notification.title}" as read`}
                    onClick={() => markOne(notification.id)}
                    disabled={pending}
                  >
                    <Check className="size-3.5" />
                  </Button>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
