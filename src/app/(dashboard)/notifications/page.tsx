/**
 * Notification centre.
 *
 * This is the delivery endpoint for a rule's `notify` effect. Before it existed the
 * effect was built by the pure rules engine, returned, and discarded, so a rule that
 * said "tell the owner when the meter exceeds its threshold" did nothing at all — and
 * did so silently, which is the worst failure mode a control can have.
 *
 * The page is deliberately explicit about the boundary. Anything on the `in_app`
 * channel is delivered end to end and shown here. Anything on `email`, `webhook`,
 * `slack` or `sms` is *recorded* with its channel intact but not transmitted, because
 * sending it needs a credential and an account only the operating organisation can
 * supply. Those rows are listed under "Recorded, not sent" with what is missing, so the
 * gap is visible in the product rather than only in a document.
 */

import { connection } from "next/server";
import { Bell, BellOff, Inbox, SendHorizontal } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { KpiCard } from "@/components/shared/kpi-card";
import { PageHeader } from "@/components/shared/page-header";
import { activeOrganizationId } from "@/lib/auth/active-organization";
import { requireSession } from "@/lib/auth/session";
import {
  DELIVERABLE_CHANNELS,
  EXTERNAL_TRANSPORT_REQUIREMENTS,
  isNotificationChannel,
  type NotificationChannel,
} from "@/lib/domain/notifications/deliver";
import { listNotifications } from "@/lib/data/repositories/notifications";
import { formatDateTime, formatNumber } from "@/lib/format";
import { SETUP_GUIDE_PATH } from "@/lib/i18n/messages";
import { getDictionary } from "@/lib/i18n/server";

import { NotificationList } from "./_components/notification-list";

const TYPE_TONE: Readonly<Record<string, string>> = {
  ERROR: "border-red-500/50 text-red-700 dark:text-red-300",
  WARNING: "border-amber-500/50 text-amber-700 dark:text-amber-300",
  ACTION_REQUIRED: "border-violet-500/50 text-violet-700 dark:text-violet-300",
  SUCCESS: "border-emerald-500/50 text-emerald-700 dark:text-emerald-300",
  INFO: "border-blue-500/50 text-blue-700 dark:text-blue-300",
};

function deliverable(channel: string): boolean {
  return (
    isNotificationChannel(channel) &&
    DELIVERABLE_CHANNELS.includes(channel as NotificationChannel)
  );
}

export default async function NotificationsPage() {
  await connection();
  const dict = await getDictionary();

  const [organizationId, session] = await Promise.all([
    activeOrganizationId(),
    requireSession(),
  ]);
  const notifications = await listNotifications(organizationId, session.userId, {
    limit: 100,
  });

  const inApp = notifications.filter((notification) => deliverable(notification.channel));
  const pending = notifications.filter((notification) => !deliverable(notification.channel));
  const unread = notifications.filter((notification) => !notification.isRead);

  return (
    <div className="space-y-6">
      <PageHeader
        title={dict["notifications.title"]}
        description={dict["notifications.desc"]}
        meta={[
          { label: dict["notifications.meta.total"], value: formatNumber(notifications.length) },
          { label: dict["notifications.meta.unread"], value: formatNumber(unread.length) },
        ]}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title={dict["notifications.kpi.unreadKpi"]}
          value={formatNumber(unread.length)}
          icon={Bell}
          description={dict["notifications.kpi.unreadDesc"]}
          source="countUnreadNotifications()"
        />
        <KpiCard
          title={dict["notifications.kpi.deliveredInApp"]}
          value={formatNumber(inApp.length)}
          icon={Inbox}
          description={dict["notifications.kpi.deliveredInAppDesc"]}
          source="Notification.channel = in_app"
        />
        <KpiCard
          title={dict["notifications.kpi.recordedNotSent"]}
          value={formatNumber(pending.length)}
          icon={BellOff}
          description={dict["notifications.kpi.recordedNotSentDesc"]}
          source="Notification.channel != in_app"
        />
        <KpiCard
          title={dict["notifications.kpi.actionRequired"]}
          value={formatNumber(
            notifications.filter((notification) => notification.type === "ACTION_REQUIRED")
              .length,
          )}
          icon={SendHorizontal}
          description={dict["notifications.kpi.actionRequiredDesc"]}
          source="notificationTypeForSeverity()"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{dict["notifications.card.inApp"]}</CardTitle>
          <CardDescription>
            {dict["notifications.card.inAppDesc"]}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {inApp.length === 0 ? (
            <EmptyState
              title={dict["notifications.empty.noInApp"]}
              description={dict["notifications.empty.noInAppDesc"]}
            />
          ) : (
            <NotificationList
              organizationId={organizationId}
              notifications={inApp.map((notification) => ({
                id: notification.id,
                type: notification.type,
                title: notification.title,
                message: notification.message,
                channel: notification.channel,
                isRead: notification.isRead,
                actionUrl: notification.actionUrl,
                createdAt: formatDateTime(notification.createdAt),
                tone: TYPE_TONE[notification.type] ?? TYPE_TONE.INFO,
              }))}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{dict["notifications.card.recordedNotSent"]}</CardTitle>
          <CardDescription>
            {dict["notifications.card.recordedNotSentDesc"]}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {pending.length === 0 ? (
            <EmptyState
              title={dict["notifications.empty.noPending"]}
              description={dict["notifications.empty.noPendingDesc"]}
            />
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">{dict["notifications.table.channel"]}</th>
                    <th className="px-3 py-2 text-left font-medium">{dict["notifications.table.title"]}</th>
                    <th className="px-3 py-2 text-left font-medium">{dict["notifications.table.youMustSupply"]}</th>
                    <th className="px-3 py-2 text-left font-medium">{dict["notifications.table.raised"]}</th>
                  </tr>
                </thead>
                <tbody>
                  {pending.map((notification) => (
                    <tr key={notification.id} className="border-t">
                      <td className="px-3 py-2">
                        <Badge variant="outline">{notification.channel}</Badge>
                      </td>
                      <td className="px-3 py-2">{notification.title}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {isNotificationChannel(notification.channel) &&
                        notification.channel !== "in_app"
                          ? EXTERNAL_TRANSPORT_REQUIREMENTS[notification.channel]
                          : "an unrecognised channel — check the rule's action parameters"}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {formatDateTime(notification.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
