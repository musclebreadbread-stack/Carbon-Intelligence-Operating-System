/**
 * Logging notification channel.
 *
 * The default channel: never fails, makes no network call, and is what a CIOS
 * deployment with no `RESEND_API_KEY` runs on. Sends are logged server-side and
 * recorded on `calls`, so a test — or an operator reading server logs — can see
 * exactly what would have gone out.
 */

import type { Notification, NotificationChannel, NotificationResult } from "./types";

export class LoggingNotificationChannel implements NotificationChannel {
  readonly provider = "logging";

  private readonly recorded: Notification[] = [];

  constructor(private readonly log: (message: string) => void = console.info) {}

  /** Every notification this channel has been given, in order. */
  get calls(): readonly Notification[] {
    return this.recorded;
  }

  reset(): void {
    this.recorded.length = 0;
  }

  async send(notification: Notification): Promise<NotificationResult> {
    this.recorded.push(notification);
    this.log(
      `[notification:${notification.severity ?? "info"}] → ${notification.recipient}: ${notification.subject}`,
    );
    return { delivered: true, provider: this.provider, durationMs: 0 };
  }
}
