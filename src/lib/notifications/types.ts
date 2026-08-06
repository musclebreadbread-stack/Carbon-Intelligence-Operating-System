/**
 * Notification channel contract.
 *
 * Outbound notifications (the rules engine's `notify` effect, and anything else
 * that needs to reach a person outside the app) sit behind this one interface, the
 * same way generative narrative sits behind `LlmClient` (`src/lib/ai/llm/types.ts`).
 * Two implementations satisfy it: `LoggingNotificationChannel` (the default — logs
 * and never fails) and `ResendNotificationChannel` (a `fetch` call against the
 * Resend REST API). The factory picks one from the environment.
 *
 * No framework imports: bare `fetch` only, so this runs unchanged in the Node
 * runtime and under the test runner.
 */

import { AppError, type ErrorDetails } from "@/lib/core/errors";

export type NotificationSeverity = "info" | "warning" | "critical";

export type Notification = {
  readonly recipient: string;
  readonly subject: string;
  readonly body: string;
  readonly severity?: NotificationSeverity;
  /** Free-form labels recorded alongside the send, e.g. the rule that triggered it. */
  readonly metadata?: Readonly<Record<string, string | number | boolean>>;
};

export type NotificationResult = {
  readonly delivered: boolean;
  /** Provider name, e.g. `"resend"` or `"logging"`. */
  readonly provider: string;
  /** Provider-assigned message id, when one is returned. */
  readonly id?: string;
  readonly durationMs: number;
};

export type NotificationChannel = {
  readonly provider: string;
  send(notification: Notification): Promise<NotificationResult>;
};

export const NOTIFICATION_ERROR_CODES = [
  "NOTIFICATION_NOT_CONFIGURED",
  "NOTIFICATION_SEND_FAILED",
  "NOTIFICATION_INVALID_RECIPIENT",
] as const;
export type NotificationErrorCode = (typeof NOTIFICATION_ERROR_CODES)[number];

export class NotificationError extends AppError {
  constructor(code: NotificationErrorCode, message: string, details?: ErrorDetails) {
    super(code, message, details);
  }
}

/** Minimal recipient-shape check shared by the recipient resolver and the Resend channel. */
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
