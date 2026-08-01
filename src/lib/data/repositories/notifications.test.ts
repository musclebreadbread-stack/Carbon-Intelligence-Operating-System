/**
 * Notification repository.
 *
 * In-app delivery is the one channel this system completes on its own, so the reads here
 * are what turn a rule's `notify` effect into something a person sees. The behaviours
 * worth pinning are the demo-mode fallback (the notification centre has to render with
 * no database, like every other page), the expiry filter, and the fact that
 * `persistNotifications` accepts a transaction client so notifications commit with the
 * work that raised them.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const notificationFindMany = vi.fn();
const notificationCount = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    notification: {
      findMany: (...args: unknown[]) => notificationFindMany(...args),
      count: (...args: unknown[]) => notificationCount(...args),
    },
  },
}));

import type { NotificationPlan } from "@/lib/domain/notifications/deliver";

import { getDataMode, resetDataMode } from "../db";
import {
  DEMO_ADMIN_USER_ID,
  DEMO_NOTIFICATIONS,
  DEMO_ORGANIZATION_ID,
} from "../demo";

import {
  countUnreadNotifications,
  listNotifications,
  persistNotifications,
} from "./notifications";

const REAL_URL = "postgresql://app:s3cret@db.internal:5432/cios";
const ORIGINAL_URL = process.env.DATABASE_URL;

function p1001(): Error & { code: string } {
  const error = new Error("Can't reach database server at db.internal:5432") as Error & {
    code: string;
  };
  error.code = "P1001";
  return error;
}

function plan(overrides: Partial<NotificationPlan> = {}): NotificationPlan {
  return {
    type: "WARNING",
    title: "Gas meter above threshold",
    message: "The Ulsan boiler gas meter exceeded 220,000 m3.",
    channel: "in_app",
    userId: "user-1",
    organizationId: DEMO_ORGANIZATION_ID,
    actionUrl: "/activity-data",
    metadata: { ruleId: "rule-1" },
    expiresAt: null,
    requiresExternalTransport: false,
    transportRequirement: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  resetDataMode();
  process.env.DATABASE_URL = REAL_URL;
});

afterEach(() => {
  if (ORIGINAL_URL === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = ORIGINAL_URL;
  resetDataMode();
});

describe("persistNotifications", () => {
  it("writes one row per plan through the client it is given", async () => {
    // The client is a parameter so a `$transaction` client fits: notifications must
    // commit with the work that raised them.
    const createMany = vi.fn(async (args: { data: readonly unknown[] }) => ({
      count: args.data.length,
    }));

    const written = await persistNotifications(
      { notification: { createMany } } as never,
      [plan(), plan({ title: "Second" })],
    );

    expect(written).toBe(2);
    const [{ data }] = createMany.mock.calls[0] as [
      { data: readonly Record<string, unknown>[] },
    ];
    expect(data[0].channel).toBe("in_app");
    expect(data[0].userId).toBe("user-1");
    expect(data[0].metadata).toEqual({ ruleId: "rule-1" });
  });

  it("keeps an external channel's name so the pending work is queryable", async () => {
    const createMany = vi.fn(async (args: { data: readonly unknown[] }) => ({
      count: args.data.length,
    }));

    await persistNotifications({ notification: { createMany } } as never, [
      plan({ channel: "email", requiresExternalTransport: true }),
    ]);

    const [{ data }] = createMany.mock.calls[0] as [
      { data: readonly Record<string, unknown>[] },
    ];
    expect(data[0].channel).toBe("email");
  });

  it("skips a plan with no resolvable recipient rather than inventing a user id", async () => {
    const createMany = vi.fn(async (args: { data: readonly unknown[] }) => ({
      count: args.data.length,
    }));

    const written = await persistNotifications({ notification: { createMany } } as never, [
      plan({ userId: null }),
    ]);

    expect(written).toBe(0);
    expect(createMany).not.toHaveBeenCalled();
  });

  it("writes nothing for an empty plan list", async () => {
    const createMany = vi.fn();

    expect(
      await persistNotifications({ notification: { createMany } } as never, []),
    ).toBe(0);
    expect(createMany).not.toHaveBeenCalled();
  });
});

describe("listNotifications against a database", () => {
  it("scopes every query to the recipient, not only to the organisation", async () => {
    // The user-facing read path takes the recipient as a required argument. It used
    // to be optional and no caller passed it, so the notification centre showed
    // every colleague's messages and action URLs.
    notificationFindMany.mockResolvedValue([]);

    await listNotifications(DEMO_ORGANIZATION_ID, "user-7");

    const [args] = notificationFindMany.mock.calls[0] as [
      { where: Record<string, unknown> },
    ];
    expect(args.where.userId).toBe("user-7");
    expect(args.where.organizationId).toBe(DEMO_ORGANIZATION_ID);
  });

  it("maps rows onto the notification shape, newest first", async () => {
    notificationFindMany.mockResolvedValue([
      {
        id: "n-1",
        organizationId: DEMO_ORGANIZATION_ID,
        userId: "user-1",
        type: "WARNING",
        title: "Threshold breached",
        message: "231,400 m3 against a 220,000 m3 threshold",
        channel: "in_app",
        isRead: false,
        readAt: null,
        actionUrl: "/activity-data",
        expiresAt: null,
        createdAt: new Date(Date.UTC(2024, 10, 3)),
      },
    ]);

    const rows = await listNotifications(DEMO_ORGANIZATION_ID, DEMO_ADMIN_USER_ID);

    expect(getDataMode()).toBe("database");
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe("Threshold breached");
    const [args] = notificationFindMany.mock.calls[0] as [
      { orderBy: { createdAt: string } },
    ];
    expect(args.orderBy.createdAt).toBe("desc");
  });

  it("excludes expired notifications", async () => {
    notificationFindMany.mockResolvedValue([]);

    await listNotifications(DEMO_ORGANIZATION_ID, DEMO_ADMIN_USER_ID);

    const [args] = notificationFindMany.mock.calls[0] as [
      { where: { OR: readonly unknown[] } },
    ];
    // Either no expiry, or an expiry still in the future.
    expect(args.where.OR).toHaveLength(2);
  });

  it("adds the unread filter when asked", async () => {
    notificationFindMany.mockResolvedValue([]);

    await listNotifications(DEMO_ORGANIZATION_ID, "user-2", { unreadOnly: true });

    const [args] = notificationFindMany.mock.calls[0] as [
      { where: Record<string, unknown> },
    ];
    expect(args.where.userId).toBe("user-2");
    expect(args.where.isRead).toBe(false);
  });
});

describe("listNotifications in demo mode", () => {
  it("falls back to the fixtures when the database is unreachable", async () => {
    notificationFindMany.mockRejectedValue(p1001());

    const rows = await listNotifications(DEMO_ORGANIZATION_ID, DEMO_ADMIN_USER_ID);

    expect(getDataMode()).toBe("demo");
    expect(rows).toHaveLength(DEMO_NOTIFICATIONS.length);
    expect(rows.every((row) => row.userId === DEMO_ADMIN_USER_ID)).toBe(true);
  });

  it("applies the unread filter to the fixtures too", async () => {
    // Demo mode and database mode must not disagree about what is unread.
    notificationFindMany.mockRejectedValue(p1001());

    const rows = await listNotifications(DEMO_ORGANIZATION_ID, DEMO_ADMIN_USER_ID, {
      unreadOnly: true,
    });

    expect(rows.every((row) => !row.isRead)).toBe(true);
    expect(rows).toHaveLength(DEMO_NOTIFICATIONS.filter((row) => !row.isRead).length);
  });

  it("returns nothing for another organisation", async () => {
    notificationFindMany.mockRejectedValue(p1001());

    expect(await listNotifications("another-company", DEMO_ADMIN_USER_ID)).toEqual([]);
  });

  it("returns nothing for another recipient in the same organisation", async () => {
    notificationFindMany.mockRejectedValue(p1001());

    expect(await listNotifications(DEMO_ORGANIZATION_ID, "someone-else")).toEqual([]);
  });

  it("includes a fixture on an external channel, so the boundary is visible in the UI", async () => {
    notificationFindMany.mockRejectedValue(p1001());

    const rows = await listNotifications(DEMO_ORGANIZATION_ID, DEMO_ADMIN_USER_ID);

    expect(rows.some((row) => row.channel !== "in_app")).toBe(true);
  });
});

describe("countUnreadNotifications", () => {
  it("counts through the database when one is reachable", async () => {
    notificationCount.mockResolvedValue(7);

    expect(await countUnreadNotifications(DEMO_ORGANIZATION_ID, DEMO_ADMIN_USER_ID)).toBe(
      7,
    );
    const [args] = notificationCount.mock.calls[0] as [
      { where: Record<string, unknown> },
    ];
    expect(args.where.userId).toBe(DEMO_ADMIN_USER_ID);
  });

  it("counts the unread fixtures in demo mode", async () => {
    notificationCount.mockRejectedValue(p1001());

    expect(await countUnreadNotifications(DEMO_ORGANIZATION_ID, DEMO_ADMIN_USER_ID)).toBe(
      DEMO_NOTIFICATIONS.filter((row) => !row.isRead).length,
    );
  });
});
