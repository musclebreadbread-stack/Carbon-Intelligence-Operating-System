/**
 * Demo tenant: in-app notifications.
 *
 * These are shaped exactly like the rows `persistNotifications()` writes from a
 * `notify` rule effect, so the notification centre and the header badge render the
 * same way in demo mode and on a database.
 *
 * One fixture deliberately carries `channel: "email"` and stays unread: that is the
 * boundary this system stops at. An email notification is *recorded* so it is not
 * lost, but it is not transmitted, because sending it needs an SMTP relay or a
 * transactional-email provider that only the operating organisation can supply.
 */

import type { NotificationType } from "@/lib/core/enums";

import { DEMO_CURRENT_YEAR } from "./activity-data";
import { DEMO_ORGANIZATION_ID } from "./organization";
import { DEMO_ADMIN_USER_ID } from "./security";

export type DemoNotification = {
  readonly id: string;
  readonly organizationId: string;
  readonly userId: string;
  readonly type: NotificationType;
  readonly title: string;
  readonly message: string;
  readonly channel: string;
  readonly isRead: boolean;
  readonly readAt: Date | null;
  readonly actionUrl: string | null;
  readonly expiresAt: Date | null;
  readonly createdAt: Date;
};

export const DEMO_NOTIFICATIONS: readonly DemoNotification[] = [
  {
    id: "demo-notification-gas-threshold",
    organizationId: DEMO_ORGANIZATION_ID,
    userId: DEMO_ADMIN_USER_ID,
    type: "WARNING",
    title: "울산 가스 사용량 임계치 초과 (Ulsan gas above threshold)",
    message:
      "The Ulsan boiler gas meter reported 231,400 m3 against a monitoring threshold of 220,000 m3.",
    channel: "in_app",
    isRead: false,
    readAt: null,
    actionUrl: "/activity-data",
    expiresAt: null,
    createdAt: new Date(Date.UTC(DEMO_CURRENT_YEAR, 10, 3, 8, 12)),
  },
  {
    id: "demo-notification-estimated-entry",
    organizationId: DEMO_ORGANIZATION_ID,
    userId: DEMO_ADMIN_USER_ID,
    type: "ACTION_REQUIRED",
    title: "추정값 검토 필요 (Estimated entry needs review)",
    message:
      "Two months of Pyeongtaek electricity are estimated. Obtain the settlement meter data before the assurance visit.",
    channel: "in_app",
    isRead: false,
    readAt: null,
    actionUrl: "/verification",
    expiresAt: null,
    createdAt: new Date(Date.UTC(DEMO_CURRENT_YEAR, 10, 1, 2, 40)),
  },
  {
    id: "demo-notification-email-pending",
    organizationId: DEMO_ORGANIZATION_ID,
    userId: DEMO_ADMIN_USER_ID,
    type: "INFO",
    title: "협력사 PCF 요청 (Supplier PCF request)",
    message:
      "Recorded but not sent: delivering this over email needs an SMTP relay or a transactional-email provider, which is an operator-supplied service.",
    channel: "email",
    isRead: false,
    readAt: null,
    actionUrl: "/settings",
    expiresAt: null,
    createdAt: new Date(Date.UTC(DEMO_CURRENT_YEAR, 9, 28, 6, 5)),
  },
  {
    id: "demo-notification-calculation-done",
    organizationId: DEMO_ORGANIZATION_ID,
    userId: DEMO_ADMIN_USER_ID,
    type: "SUCCESS",
    title: "인벤토리 산정 완료 (Inventory calculation complete)",
    message: `The ${DEMO_CURRENT_YEAR} inventory recalculated with no blocking rule failures.`,
    channel: "in_app",
    isRead: true,
    readAt: new Date(Date.UTC(DEMO_CURRENT_YEAR, 9, 20, 1, 15)),
    actionUrl: "/emission-engine",
    expiresAt: null,
    createdAt: new Date(Date.UTC(DEMO_CURRENT_YEAR, 9, 20, 1, 2)),
  },
];
