import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const canWrite = vi.fn();
const trialRequestCreate = vi.fn();
const notificationSend = vi.fn();
const getNotificationChannel = vi.fn((..._args: unknown[]) => ({ send: notificationSend }));

vi.mock("@/lib/data/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/data/db")>();
  return { ...actual, canWrite: () => canWrite() };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    trialRequest: { create: (...args: unknown[]) => trialRequestCreate(...args) },
  },
}));

vi.mock("@/lib/notifications/factory", () => ({
  getNotificationChannel: (...args: unknown[]) => getNotificationChannel(...args),
}));

import { submitTrialRequestAction } from "./trial-request";

const VALID_INPUT = {
  companyName: "테스트 제조",
  contactName: "홍길동",
  email: "hong@example.com",
  phone: "010-1234-5678",
  facilityCount: 3,
  message: "문의합니다",
};

beforeEach(() => {
  vi.clearAllMocks();
  canWrite.mockResolvedValue(true);
  trialRequestCreate.mockResolvedValue({ id: "trial-1" });
  delete process.env.SALES_NOTIFICATION_EMAIL;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("submitTrialRequestAction", () => {
  it("rejects invalid input without touching the database", async () => {
    const result = await submitTrialRequestAction({ companyName: "", contactName: "", email: "not-an-email" });

    expect(result.status).toBe("error");
    expect(trialRequestCreate).not.toHaveBeenCalled();
  });

  it("refuses to fake success in demo mode", async () => {
    canWrite.mockResolvedValue(false);

    const result = await submitTrialRequestAction(VALID_INPUT);

    expect(result.status).toBe("error");
    if (result.status === "error") expect(result.code).toBe("DEMO_MODE");
    expect(trialRequestCreate).not.toHaveBeenCalled();
  });

  it("persists a valid lead and returns its id", async () => {
    const result = await submitTrialRequestAction(VALID_INPUT);

    expect(result.status).toBe("success");
    if (result.status === "success") expect(result.data).toEqual({ id: "trial-1" });
    expect(trialRequestCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ companyName: "테스트 제조", email: "hong@example.com" }),
      }),
    );
  });

  it("does not send a notification when no recipient is configured", async () => {
    await submitTrialRequestAction(VALID_INPUT);

    expect(getNotificationChannel).not.toHaveBeenCalled();
    expect(notificationSend).not.toHaveBeenCalled();
  });

  it("notifies the configured sales recipient", async () => {
    process.env.SALES_NOTIFICATION_EMAIL = "sales@example.com";

    await submitTrialRequestAction(VALID_INPUT);

    expect(notificationSend).toHaveBeenCalledWith(
      expect.objectContaining({ recipient: "sales@example.com" }),
    );
  });
});
