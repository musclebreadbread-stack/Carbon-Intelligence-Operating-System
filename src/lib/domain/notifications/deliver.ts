/**
 * Notification delivery planning.
 *
 * Pure TypeScript — no framework, database or network imports. This module decides
 * *what* should be delivered and *over which channel*; the persistence layer performs
 * the in-app delivery, and any external transport is supplied by the operator.
 *
 * ## Why this exists
 *
 * The rules engine (`src/lib/domain/rules/actions.ts`) can produce a `notify` effect,
 * and the schema has `Notification` and `NotificationPreference` models, but nothing
 * connected the two: a `notify` effect was built, returned, and dropped. A rule that
 * says "tell the facility owner when the gas meter reads more than 220,000 m3" did
 * nothing at all, silently — the worst failure mode for a control.
 *
 * ## What is and is not delivered here
 *
 * `in_app` is delivered end to end: a `Notification` row is written and the header
 * badge and `/notifications` read it back. It needs no external service, which is why
 * it is the default channel and the one an unconfigured deployment still gets.
 *
 * `email`, `webhook`, `slack` and `sms` are *planned* but not transmitted. Each needs
 * a credential and an account the operating organisation must supply (an SMTP relay or
 * a transactional-email provider, an endpoint plus a signing secret, an incoming
 * webhook URL, a telephony provider). Rather than pretend, `planNotifications` marks
 * those plans `requiresExternalTransport: true` and records the reason, and the
 * persistence layer records them as undelivered instead of losing them. That way the
 * boundary is visible in the data rather than only in a document: an operator can query
 * exactly which notifications are waiting on a transport they have not configured.
 */

import type { NotificationType } from "@/lib/core/enums";

import type { RuleActionEffect } from "../rules/actions";

/**
 * `NotificationType` comes from the shared enum tuple rather than being restated
 * here, so it cannot drift from the Prisma enum.
 */
export type NotificationTypeName = NotificationType;

/** Channels the `Notification.channel` column may carry. */
export const NOTIFICATION_CHANNELS = ["in_app", "email", "webhook", "slack", "sms"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

/**
 * The only channel this system can deliver on its own.
 *
 * Everything else terminates at an external service the operator owns.
 */
export const DELIVERABLE_CHANNELS: readonly NotificationChannel[] = ["in_app"];

/** What each external channel needs before it can carry anything. */
export const EXTERNAL_TRANSPORT_REQUIREMENTS: Readonly<
  Record<Exclude<NotificationChannel, "in_app">, string>
> = {
  email:
    "an SMTP relay or transactional-email provider (credentials and a verified sender domain)",
  webhook: "an HTTPS endpoint and a shared signing secret",
  slack: "a Slack incoming-webhook URL or bot token",
  sms: "a telephony provider account and a sender number",
};

export function isNotificationChannel(value: string): value is NotificationChannel {
  return (NOTIFICATION_CHANNELS as readonly string[]).includes(value);
}

export function isDeliverableChannel(channel: NotificationChannel): boolean {
  return DELIVERABLE_CHANNELS.includes(channel);
}

/** Plain object shaped to the `Notification` model, plus the delivery verdict. */
export type NotificationPlan = {
  readonly type: NotificationTypeName;
  readonly title: string;
  readonly message: string;
  readonly channel: NotificationChannel;
  /** Recipient user id, or `null` when the effect named no resolvable recipient. */
  readonly userId: string | null;
  readonly organizationId: string;
  /** Deep link the notification should open, when one is meaningful. */
  readonly actionUrl: string | null;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly expiresAt: Date | null;
  /**
   * `true` when the channel terminates at a service the operator must configure.
   * Such a plan is still persisted, so nothing is lost — it is simply not sent.
   */
  readonly requiresExternalTransport: boolean;
  /** Human-readable reason, present only when `requiresExternalTransport`. */
  readonly transportRequirement: string | null;
};

/** Maps an effect's severity onto the notification taxonomy. */
export function notificationTypeForSeverity(
  severity: RuleActionEffect["severity"],
  blocking: boolean,
): NotificationTypeName {
  // A blocking effect always demands a human decision, whatever its severity.
  if (blocking) return "ACTION_REQUIRED";
  switch (severity) {
    case "error":
      return "ERROR";
    case "warning":
      return "WARNING";
    default:
      return "INFO";
  }
}

/**
 * Resolves the channel a `notify` effect asks for.
 *
 * The channel is read from `parameters.channel` and falls back to `in_app`. An
 * unrecognised channel also falls back to `in_app` rather than being dropped:
 * delivering a notification over the wrong channel is recoverable, losing it is not.
 */
export function channelForEffect(effect: RuleActionEffect): NotificationChannel {
  const requested = effect.parameters["channel"];
  if (typeof requested === "string" && isNotificationChannel(requested)) return requested;
  return "in_app";
}

/**
 * Resolves the recipient of a `notify` effect.
 *
 * A `notify` action's `target` is free text — it may name a user id, a role, or
 * nothing. Only an id that exists in `knownUserIds` is accepted; anything else
 * resolves to `null`, which the persistence layer turns into a notification for the
 * user who triggered the rule. Guessing a recipient from a role name would send a
 * control notification to whoever happened to match, which is worse than telling the
 * one person known to be involved.
 */
export function recipientForEffect(
  effect: RuleActionEffect,
  options: {
    readonly knownUserIds?: readonly string[];
    readonly fallbackUserId?: string | null;
  } = {},
): string | null {
  const known = new Set(options.knownUserIds ?? []);
  const candidates = [effect.parameters["userId"], effect.target].filter(
    (value): value is string => typeof value === "string" && value.length > 0,
  );
  for (const candidate of candidates) {
    if (known.has(candidate)) return candidate;
  }
  return options.fallbackUserId ?? null;
}

export type PlanNotificationsOptions = {
  readonly organizationId: string;
  /** User ids the recipient may be resolved to. */
  readonly knownUserIds?: readonly string[];
  /** Recipient used when an effect names none; normally the triggering user. */
  readonly fallbackUserId?: string | null;
  /** Entity the effects were raised about, for the deep link and metadata. */
  readonly entityType?: string;
  readonly entityId?: string;
  /** Path the notification should open. */
  readonly actionUrl?: string | null;
  /** Notifications older than this are of no use; `null` for no expiry. */
  readonly expiresAt?: Date | null;
};

/**
 * Turns the `notify` effects of a rule-set run into notification plans.
 *
 * Only `notify` effects become notifications. A `flag` is already visible on the
 * record it flagged and a `reject` is already reported to the caller as a refusal, so
 * turning those into notifications as well would produce noise that trains people to
 * ignore the channel.
 *
 * Identical plans are collapsed: a rule set with several rules that all notify the
 * same person about the same thing should notify them once.
 */
export function planNotifications(
  effects: readonly RuleActionEffect[],
  options: PlanNotificationsOptions,
): readonly NotificationPlan[] {
  const plans: NotificationPlan[] = [];
  const seen = new Set<string>();

  for (const effect of effects) {
    if (effect.type !== "notify") continue;

    const channel = channelForEffect(effect);
    const external = !isDeliverableChannel(channel);
    const userId = recipientForEffect(effect, {
      ...(options.knownUserIds !== undefined ? { knownUserIds: options.knownUserIds } : {}),
      ...(options.fallbackUserId !== undefined
        ? { fallbackUserId: options.fallbackUserId }
        : {}),
    });

    const plan: NotificationPlan = {
      type: notificationTypeForSeverity(effect.severity, effect.blocking),
      // The rule name is the useful title: it tells the recipient which control
      // fired without them having to read the message first.
      title: effect.ruleName,
      message: effect.message,
      channel,
      userId,
      organizationId: options.organizationId,
      actionUrl: options.actionUrl ?? null,
      metadata: {
        ruleId: effect.ruleId,
        ruleName: effect.ruleName,
        effectType: effect.type,
        severity: effect.severity,
        ...(options.entityType !== undefined ? { entityType: options.entityType } : {}),
        ...(options.entityId !== undefined ? { entityId: options.entityId } : {}),
        ...(external ? { pendingTransport: channel } : {}),
      },
      expiresAt: options.expiresAt ?? null,
      requiresExternalTransport: external,
      transportRequirement: external
        ? EXTERNAL_TRANSPORT_REQUIREMENTS[channel as Exclude<NotificationChannel, "in_app">]
        : null,
    };

    const key = `${plan.channel}|${plan.userId ?? ""}|${plan.title}|${plan.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    plans.push(plan);
  }

  return plans;
}

/** Splits plans into the ones this system delivers and the ones it only records. */
export function partitionByDeliverability(plans: readonly NotificationPlan[]): {
  readonly deliverable: readonly NotificationPlan[];
  readonly pending: readonly NotificationPlan[];
} {
  return {
    deliverable: plans.filter((plan) => !plan.requiresExternalTransport),
    pending: plans.filter((plan) => plan.requiresExternalTransport),
  };
}

/**
 * One-line summary of what a run will and will not send.
 *
 * Returned to the caller so the UI can say "2 delivered in-app, 1 waiting on an email
 * transport" instead of appearing to have sent everything.
 */
export function describeDelivery(plans: readonly NotificationPlan[]): string {
  if (plans.length === 0) return "No notifications were raised.";
  const { deliverable, pending } = partitionByDeliverability(plans);
  const parts: string[] = [];
  if (deliverable.length > 0) {
    parts.push(`${deliverable.length} delivered in-app`);
  }
  for (const channel of NOTIFICATION_CHANNELS) {
    const count = pending.filter((plan) => plan.channel === channel).length;
    if (count > 0) {
      parts.push(`${count} recorded but not sent (${channel} transport not configured)`);
    }
  }
  return `${parts.join("; ")}.`;
}
