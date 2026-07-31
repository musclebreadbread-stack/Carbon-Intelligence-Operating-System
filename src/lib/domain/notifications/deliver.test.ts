/**
 * Notification delivery planning.
 *
 * Defect 6: the rules engine could produce a `notify` effect and the schema had the
 * models to carry it, but nothing connected the two — the effect was built, returned
 * and dropped, so a rule that said "tell the owner when the meter exceeds its
 * threshold" did nothing at all, silently.
 *
 * The properties pinned here are the ones that decide whether the channel can be
 * trusted: only `notify` effects become notifications, an unresolvable recipient does
 * not become a fabricated one, duplicates collapse, and a channel this system cannot
 * transmit on is marked rather than quietly treated as sent.
 */

import { describe, expect, it } from "vitest";

import type { RuleActionEffect } from "../rules/actions";

import {
  DELIVERABLE_CHANNELS,
  EXTERNAL_TRANSPORT_REQUIREMENTS,
  channelForEffect,
  describeDelivery,
  isDeliverableChannel,
  isNotificationChannel,
  notificationTypeForSeverity,
  partitionByDeliverability,
  planNotifications,
  recipientForEffect,
} from "./deliver";

function effect(overrides: Partial<RuleActionEffect> = {}): RuleActionEffect {
  return {
    ruleId: "rule-1",
    ruleName: "Gas meter above threshold",
    actionId: "act-1",
    type: "notify",
    orderIndex: 0,
    target: null,
    value: null,
    parameters: {},
    blocking: false,
    severity: "info",
    message: "The Ulsan boiler gas meter exceeded 220,000 m3.",
    ...overrides,
  };
}

const ORGANIZATION = { organizationId: "org-1" } as const;

describe("notificationTypeForSeverity", () => {
  it("maps severities onto the notification taxonomy", () => {
    expect(notificationTypeForSeverity("info", false)).toBe("INFO");
    expect(notificationTypeForSeverity("warning", false)).toBe("WARNING");
    expect(notificationTypeForSeverity("error", false)).toBe("ERROR");
  });

  it("treats any blocking effect as demanding a decision", () => {
    // A blocking effect stopped a write; someone has to act on it whatever its label.
    expect(notificationTypeForSeverity("info", true)).toBe("ACTION_REQUIRED");
    expect(notificationTypeForSeverity("error", true)).toBe("ACTION_REQUIRED");
  });
});

describe("channelForEffect", () => {
  it("defaults to in_app when the action names no channel", () => {
    expect(channelForEffect(effect())).toBe("in_app");
  });

  it("honours a recognised channel from the action parameters", () => {
    expect(channelForEffect(effect({ parameters: { channel: "email" } }))).toBe("email");
  });

  it("falls back to in_app for an unrecognised channel rather than dropping the notice", () => {
    // Delivering over the wrong channel is recoverable; losing the notification is not.
    expect(channelForEffect(effect({ parameters: { channel: "carrier-pigeon" } }))).toBe(
      "in_app",
    );
    expect(channelForEffect(effect({ parameters: { channel: 42 } }))).toBe("in_app");
  });
});

describe("channel classification", () => {
  it("treats in_app as the only channel this system completes", () => {
    expect([...DELIVERABLE_CHANNELS]).toEqual(["in_app"]);
    expect(isDeliverableChannel("in_app")).toBe(true);
    expect(isDeliverableChannel("email")).toBe(false);
    expect(isDeliverableChannel("webhook")).toBe(false);
  });

  it("states what every external channel needs", () => {
    for (const channel of ["email", "webhook", "slack", "sms"] as const) {
      expect(EXTERNAL_TRANSPORT_REQUIREMENTS[channel].length).toBeGreaterThan(10);
    }
  });

  it("recognises exactly its own channel names", () => {
    expect(isNotificationChannel("in_app")).toBe(true);
    expect(isNotificationChannel("teams")).toBe(false);
  });
});

describe("recipientForEffect", () => {
  it("accepts a userId parameter that names a known user", () => {
    expect(
      recipientForEffect(effect({ parameters: { userId: "user-2" } }), {
        knownUserIds: ["user-1", "user-2"],
      }),
    ).toBe("user-2");
  });

  it("accepts a target that names a known user", () => {
    expect(
      recipientForEffect(effect({ target: "user-2" }), { knownUserIds: ["user-2"] }),
    ).toBe("user-2");
  });

  it("prefers the explicit userId parameter over the free-text target", () => {
    expect(
      recipientForEffect(effect({ target: "user-3", parameters: { userId: "user-2" } }), {
        knownUserIds: ["user-2", "user-3"],
      }),
    ).toBe("user-2");
  });

  it("falls back rather than guessing when the target is a role name", () => {
    // Guessing would send a control notification to whoever happened to match.
    expect(
      recipientForEffect(effect({ target: "facility-owner" }), {
        knownUserIds: ["user-1"],
        fallbackUserId: "user-1",
      }),
    ).toBe("user-1");
  });

  it("returns null when there is no fallback either", () => {
    expect(recipientForEffect(effect({ target: "someone" }), { knownUserIds: [] })).toBeNull();
  });
});

describe("planNotifications", () => {
  it("plans one notification per notify effect", () => {
    const plans = planNotifications([effect()], {
      ...ORGANIZATION,
      fallbackUserId: "user-1",
    });

    expect(plans).toHaveLength(1);
    expect(plans[0].title).toBe("Gas meter above threshold");
    expect(plans[0].message).toContain("220,000 m3");
    expect(plans[0].channel).toBe("in_app");
    expect(plans[0].userId).toBe("user-1");
    expect(plans[0].organizationId).toBe("org-1");
    expect(plans[0].requiresExternalTransport).toBe(false);
    expect(plans[0].transportRequirement).toBeNull();
  });

  it("ignores every effect type other than notify", () => {
    // A flag is already visible on the record and a reject is already reported as a
    // refusal; notifying about them too would train people to ignore the channel.
    const plans = planNotifications(
      [
        effect({ type: "flag" }),
        effect({ type: "reject", blocking: true }),
        effect({ type: "set_field", target: "dataQuality" }),
        effect({ type: "recalculate" }),
        effect({ type: "assign", target: "user-2" }),
      ],
      { ...ORGANIZATION, fallbackUserId: "user-1" },
    );

    expect(plans).toEqual([]);
  });

  it("carries the rule and entity identity in metadata for traceability", () => {
    const [plan] = planNotifications([effect({ severity: "warning" })], {
      ...ORGANIZATION,
      fallbackUserId: "user-1",
      entityType: "ActivityDataEntry",
      entityId: "entry-9",
      actionUrl: "/activity-data",
    });

    expect(plan.type).toBe("WARNING");
    expect(plan.actionUrl).toBe("/activity-data");
    expect(plan.metadata.ruleId).toBe("rule-1");
    expect(plan.metadata.entityType).toBe("ActivityDataEntry");
    expect(plan.metadata.entityId).toBe("entry-9");
  });

  it("marks an external channel as requiring a transport instead of pretending to send", () => {
    const [plan] = planNotifications([effect({ parameters: { channel: "email" } })], {
      ...ORGANIZATION,
      fallbackUserId: "user-1",
    });

    expect(plan.channel).toBe("email");
    expect(plan.requiresExternalTransport).toBe(true);
    expect(plan.transportRequirement).toBe(EXTERNAL_TRANSPORT_REQUIREMENTS.email);
    expect(plan.metadata.pendingTransport).toBe("email");
  });

  it("collapses identical notifications from several rules", () => {
    const plans = planNotifications(
      [
        effect({ ruleId: "rule-1" }),
        effect({ ruleId: "rule-2", ruleName: "Gas meter above threshold" }),
      ],
      { ...ORGANIZATION, fallbackUserId: "user-1" },
    );

    expect(plans).toHaveLength(1);
  });

  it("keeps notifications that differ in channel or recipient", () => {
    const plans = planNotifications(
      [
        effect(),
        effect({ parameters: { channel: "email" } }),
        effect({ parameters: { userId: "user-2" } }),
      ],
      { ...ORGANIZATION, fallbackUserId: "user-1", knownUserIds: ["user-1", "user-2"] },
    );

    expect(plans).toHaveLength(3);
  });

  it("plans nothing for an empty effect list", () => {
    expect(planNotifications([], ORGANIZATION)).toEqual([]);
  });
});

describe("partitionByDeliverability", () => {
  it("separates what is sent from what is only recorded", () => {
    const plans = planNotifications(
      [effect(), effect({ parameters: { channel: "webhook" }, message: "webhook one" })],
      { ...ORGANIZATION, fallbackUserId: "user-1" },
    );

    const { deliverable, pending } = partitionByDeliverability(plans);

    expect(deliverable).toHaveLength(1);
    expect(deliverable[0].channel).toBe("in_app");
    expect(pending).toHaveLength(1);
    expect(pending[0].channel).toBe("webhook");
  });
});

describe("describeDelivery", () => {
  it("says nothing was raised when nothing was", () => {
    expect(describeDelivery([])).toBe("No notifications were raised.");
  });

  it("distinguishes delivered from recorded-but-not-sent", () => {
    const plans = planNotifications(
      [
        effect(),
        effect({ parameters: { channel: "email" }, message: "email one" }),
        effect({ parameters: { channel: "email" }, message: "email two" }),
      ],
      { ...ORGANIZATION, fallbackUserId: "user-1" },
    );

    const summary = describeDelivery(plans);

    expect(summary).toContain("1 delivered in-app");
    expect(summary).toContain("2 recorded but not sent (email transport not configured)");
  });
});
