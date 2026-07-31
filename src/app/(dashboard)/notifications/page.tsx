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

  const organizationId = await activeOrganizationId();
  const notifications = await listNotifications(organizationId, { limit: 100 });

  const inApp = notifications.filter((notification) => deliverable(notification.channel));
  const pending = notifications.filter((notification) => !deliverable(notification.channel));
  const unread = notifications.filter((notification) => !notification.isRead);

  return (
    <div className="space-y-6">
      <PageHeader
        title={dict["notifications.title"]}
        description="In-app delivery of rule-engine notify effects, and what is waiting on a transport you have to supply."
        meta={[
          { label: "Total", value: formatNumber(notifications.length) },
          { label: "Unread", value: formatNumber(unread.length) },
        ]}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Unread"
          value={formatNumber(unread.length)}
          icon={Bell}
          description="drives the badge in the header"
          source="countUnreadNotifications()"
        />
        <KpiCard
          title="Delivered in-app"
          value={formatNumber(inApp.length)}
          icon={Inbox}
          description="written by persistNotifications() from a notify effect"
          source="Notification.channel = in_app"
        />
        <KpiCard
          title="Recorded, not sent"
          value={formatNumber(pending.length)}
          icon={BellOff}
          description="channel needs a transport this deployment does not have"
          source="Notification.channel != in_app"
        />
        <KpiCard
          title="Action required"
          value={formatNumber(
            notifications.filter((notification) => notification.type === "ACTION_REQUIRED")
              .length,
          )}
          icon={SendHorizontal}
          description="a blocking rule effect always raises this type"
          source="notificationTypeForSeverity()"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>In-app notifications</CardTitle>
          <CardDescription>
            Delivered end to end: no external service is involved, which is why{" "}
            <code>in_app</code> is the default channel and the one an unconfigured
            deployment still gets.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {inApp.length === 0 ? (
            <EmptyState
              title="No in-app notifications"
              description="A rule set with a notify action raises one the next time it matches."
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
          <CardTitle>Recorded, not sent</CardTitle>
          <CardDescription>
            These notifications exist and are not lost, but this system does not transmit
            them: each channel terminates at a service you own. The provisioning steps are
            in <code>{SETUP_GUIDE_PATH}</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {pending.length === 0 ? (
            <EmptyState
              title="Nothing waiting on an external transport"
              description="Every notification raised so far used the in_app channel."
            />
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Channel</th>
                    <th className="px-3 py-2 text-left font-medium">Title</th>
                    <th className="px-3 py-2 text-left font-medium">You must supply</th>
                    <th className="px-3 py-2 text-left font-medium">Raised</th>
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
