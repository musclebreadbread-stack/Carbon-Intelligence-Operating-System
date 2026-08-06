import { describe, expect, it, vi } from "vitest";

import { LoggingNotificationChannel } from "./logging-channel";

describe("LoggingNotificationChannel", () => {
  it("always delivers, logs the send and records it on calls", async () => {
    const log = vi.fn();
    const channel = new LoggingNotificationChannel(log);

    const result = await channel.send({
      recipient: "ops@example.com",
      subject: "Rule triggered",
      body: "Quantity exceeded the plausible range.",
      severity: "warning",
    });

    expect(result.delivered).toBe(true);
    expect(result.provider).toBe("logging");
    expect(channel.calls).toHaveLength(1);
    expect(channel.calls[0]?.recipient).toBe("ops@example.com");
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0][0]).toContain("ops@example.com");
  });

  it("resets recorded calls", async () => {
    const channel = new LoggingNotificationChannel(() => {});
    await channel.send({ recipient: "a@example.com", subject: "s", body: "b" });
    channel.reset();
    expect(channel.calls).toHaveLength(0);
  });
});
