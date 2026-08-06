/**
 * Notification channel selection.
 *
 * `getNotificationChannel()` returns the Resend channel when both `RESEND_API_KEY`
 * and `NOTIFICATION_EMAIL_FROM` are configured, and the logging channel otherwise —
 * the same placeholder-aware selection `ai/llm/factory.ts` uses for the LLM client,
 * reusing its `isPlaceholderKey` check rather than re-implementing it.
 *
 * No framework imports; only `process.env` is read.
 */

import { isPlaceholderKey } from "@/lib/ai/llm/factory";

import { LoggingNotificationChannel } from "./logging-channel";
import { ResendNotificationChannel } from "./resend-channel";
import type { NotificationChannel } from "./types";

export type NotificationEnvironment = {
  readonly [key: string]: string | undefined;
  readonly RESEND_API_KEY?: string;
  readonly NOTIFICATION_EMAIL_FROM?: string;
};

/** Whether a usable Resend key and a from-address are both present. */
export function isNotificationConfigured(env: NotificationEnvironment = process.env): boolean {
  return !isPlaceholderKey(env.RESEND_API_KEY) && !isPlaceholderKey(env.NOTIFICATION_EMAIL_FROM);
}

export type NotificationMode = "resend" | "logging";

export function getNotificationMode(env: NotificationEnvironment = process.env): NotificationMode {
  return isNotificationConfigured(env) ? "resend" : "logging";
}

export type GetNotificationChannelOptions = {
  readonly env?: NotificationEnvironment;
  /** Force the logging channel regardless of the environment. */
  readonly forceLogging?: boolean;
};

/**
 * The channel for the current environment.
 *
 * A fresh instance per call: `LoggingNotificationChannel` records sends, so
 * sharing one across requests would leak one caller's notifications into
 * another's assertions.
 */
export function getNotificationChannel(
  options: GetNotificationChannelOptions = {},
): NotificationChannel {
  const env = options.env ?? process.env;
  if (options.forceLogging === true || !isNotificationConfigured(env)) {
    return new LoggingNotificationChannel();
  }
  return new ResendNotificationChannel({
    apiKey: (env.RESEND_API_KEY as string).trim(),
    from: (env.NOTIFICATION_EMAIL_FROM as string).trim(),
  });
}

/** Human-readable description of the active mode, for a Settings-panel badge. */
export function describeNotificationMode(env: NotificationEnvironment = process.env): {
  readonly mode: NotificationMode;
  readonly label: string;
  readonly labelKo: string;
} {
  const mode = getNotificationMode(env);
  return {
    mode,
    label:
      mode === "resend"
        ? "Email delivery via Resend"
        : "Notifications are logged only (no RESEND_API_KEY configured)",
    labelKo:
      mode === "resend"
        ? "Resend를 통한 이메일 발송"
        : "알림은 로그로만 기록됩니다 (RESEND_API_KEY 미설정)",
  };
}
