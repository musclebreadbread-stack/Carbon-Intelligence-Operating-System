/**
 * Resend email channel.
 *
 * A single `fetch` POST against Resend's REST API — no SDK. Unlike the OpenAI
 * client, a failed send is not retried here: `runAction`'s handlers already treat
 * a notification failure as non-fatal to the mutation (see `activity-data.ts`), so
 * the caller's own catch-and-log is the retry boundary, not this class.
 */

import { EMAIL_PATTERN, NotificationError } from "./types";
import type { Notification, NotificationChannel, NotificationResult } from "./types";

export const RESEND_BASE_URL = "https://api.resend.com";
export const DEFAULT_TIMEOUT_MS = 15_000;

export type ResendChannelConfig = {
  readonly apiKey: string;
  /** Must be a sender address verified with Resend. */
  readonly from: string;
  readonly baseUrl?: string;
  readonly timeoutMs?: number;
  /** Injected for tests; defaults to `Date.now`. */
  readonly now?: () => number;
};

type ResendEmailResponse = { readonly id?: string };

export class ResendNotificationChannel implements NotificationChannel {
  readonly provider = "resend";

  private readonly apiKey: string;
  private readonly from: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly now: () => number;

  constructor(config: ResendChannelConfig) {
    if (!config.apiKey || config.apiKey.trim().length === 0) {
      throw new NotificationError(
        "NOTIFICATION_NOT_CONFIGURED",
        "ResendNotificationChannel requires an API key",
      );
    }
    if (!config.from || config.from.trim().length === 0) {
      throw new NotificationError(
        "NOTIFICATION_NOT_CONFIGURED",
        "ResendNotificationChannel requires a verified from address",
      );
    }
    this.apiKey = config.apiKey;
    this.from = config.from;
    this.baseUrl = (config.baseUrl ?? RESEND_BASE_URL).replace(/\/$/, "");
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.now = config.now ?? (() => Date.now());
  }

  async send(notification: Notification): Promise<NotificationResult> {
    if (!EMAIL_PATTERN.test(notification.recipient)) {
      throw new NotificationError(
        "NOTIFICATION_INVALID_RECIPIENT",
        `"${notification.recipient}" is not an email address Resend can deliver to`,
        { recipient: notification.recipient },
      );
    }

    const startedAt = this.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}/emails`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          from: this.from,
          to: [notification.recipient],
          subject: notification.subject,
          text: notification.body,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new NotificationError(
          "NOTIFICATION_SEND_FAILED",
          `Resend rejected the email (${response.status})`,
          { status: response.status, body: text.slice(0, 500) },
        );
      }

      const payload = (await response.json()) as ResendEmailResponse;
      return {
        delivered: true,
        provider: this.provider,
        id: payload.id,
        durationMs: this.now() - startedAt,
      };
    } catch (error) {
      if (error instanceof NotificationError) throw error;
      const isAbort = error instanceof Error && error.name === "AbortError";
      throw new NotificationError(
        "NOTIFICATION_SEND_FAILED",
        isAbort
          ? `Resend request timed out after ${this.timeoutMs} ms`
          : "Resend request failed at the network layer",
        { cause: error instanceof Error ? error.message : String(error) },
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
