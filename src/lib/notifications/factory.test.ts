import { describe, expect, it } from "vitest";

import {
  describeNotificationMode,
  getNotificationChannel,
  getNotificationMode,
  isNotificationConfigured,
} from "./factory";
import { LoggingNotificationChannel } from "./logging-channel";
import { ResendNotificationChannel } from "./resend-channel";

describe("isNotificationConfigured and getNotificationMode", () => {
  it("reports logging mode when either variable is absent", () => {
    expect(isNotificationConfigured({})).toBe(false);
    expect(isNotificationConfigured({ RESEND_API_KEY: "re_real" })).toBe(false);
    expect(isNotificationConfigured({ NOTIFICATION_EMAIL_FROM: "cios@example.com" })).toBe(false);
  });

  it("reports logging mode for a placeholder key", () => {
    expect(
      isNotificationConfigured({
        RESEND_API_KEY: "placeholder",
        NOTIFICATION_EMAIL_FROM: "cios@example.com",
      }),
    ).toBe(false);
  });

  it("reports resend mode when both variables are real", () => {
    const env = { RESEND_API_KEY: "re_real", NOTIFICATION_EMAIL_FROM: "cios@example.com" };
    expect(isNotificationConfigured(env)).toBe(true);
    expect(getNotificationMode(env)).toBe("resend");
  });
});

describe("getNotificationChannel", () => {
  it("returns the logging channel when unconfigured", () => {
    expect(getNotificationChannel({ env: {} })).toBeInstanceOf(LoggingNotificationChannel);
  });

  it("returns the Resend channel when configured", () => {
    const channel = getNotificationChannel({
      env: { RESEND_API_KEY: "re_real", NOTIFICATION_EMAIL_FROM: "cios@example.com" },
    });
    expect(channel).toBeInstanceOf(ResendNotificationChannel);
  });

  it("can be forced to logging despite real credentials", () => {
    const channel = getNotificationChannel({
      env: { RESEND_API_KEY: "re_real", NOTIFICATION_EMAIL_FROM: "cios@example.com" },
      forceLogging: true,
    });
    expect(channel).toBeInstanceOf(LoggingNotificationChannel);
  });

  it("returns a fresh logging channel per call so recorded sends do not leak", async () => {
    const first = getNotificationChannel({ env: {} }) as LoggingNotificationChannel;
    await first.send({ recipient: "a@example.com", subject: "s", body: "b" });
    const second = getNotificationChannel({ env: {} }) as LoggingNotificationChannel;
    expect(first).not.toBe(second);
    expect(second.calls).toEqual([]);
  });
});

describe("describeNotificationMode", () => {
  it("labels logging mode in English and Korean", () => {
    const described = describeNotificationMode({});
    expect(described.mode).toBe("logging");
    expect(described.label).toContain("no RESEND_API_KEY configured");
    expect(described.labelKo).toContain("로그로만");
  });

  it("labels resend mode", () => {
    const described = describeNotificationMode({
      RESEND_API_KEY: "re_real",
      NOTIFICATION_EMAIL_FROM: "cios@example.com",
    });
    expect(described.mode).toBe("resend");
    expect(described.labelKo).toContain("Resend");
  });
});
