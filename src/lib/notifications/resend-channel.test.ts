import { afterEach, describe, expect, it, vi } from "vitest";

import { ResendNotificationChannel } from "./resend-channel";
import { NotificationError } from "./types";

type FetchCall = { url: string; init: RequestInit };

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

function stubFetch(
  responder: (call: FetchCall) => Response | Promise<Response>,
): { calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      const call = { url, init };
      calls.push(call);
      return responder(call);
    }),
  );
  return { calls };
}

const testChannel = () =>
  new ResendNotificationChannel({ apiKey: "re_test_key", from: "cios@example.com" });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("construction", () => {
  it("rejects a missing API key", () => {
    expect(() => new ResendNotificationChannel({ apiKey: "", from: "a@example.com" })).toThrow(
      NotificationError,
    );
  });

  it("rejects a missing from address", () => {
    expect(() => new ResendNotificationChannel({ apiKey: "re_key", from: "" })).toThrow(
      NotificationError,
    );
  });
});

describe("send", () => {
  it("POSTs to the Resend emails endpoint with a bearer token and the message shape", async () => {
    const { calls } = stubFetch(() => jsonResponse(200, { id: "email-123" }));

    const result = await testChannel().send({
      recipient: "ops@example.com",
      subject: "Rule triggered",
      body: "Quantity exceeded the plausible range.",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.resend.com/emails");
    expect(calls[0].init.method).toBe("POST");
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer re_test_key");

    const body = JSON.parse(calls[0].init.body as string);
    expect(body).toEqual({
      from: "cios@example.com",
      to: ["ops@example.com"],
      subject: "Rule triggered",
      text: "Quantity exceeded the plausible range.",
    });

    expect(result.delivered).toBe(true);
    expect(result.provider).toBe("resend");
    expect(result.id).toBe("email-123");
  });

  it("rejects a non-email recipient before making a network call", async () => {
    const { calls } = stubFetch(() => jsonResponse(200, { id: "unused" }));

    await expect(
      testChannel().send({ recipient: "sustainability-manager", subject: "s", body: "b" }),
    ).rejects.toMatchObject({ code: "NOTIFICATION_INVALID_RECIPIENT" });
    expect(calls).toHaveLength(0);
  });

  it("maps a non-OK response to NOTIFICATION_SEND_FAILED", async () => {
    stubFetch(() => jsonResponse(422, { message: "invalid from address" }));

    await expect(
      testChannel().send({ recipient: "ops@example.com", subject: "s", body: "b" }),
    ).rejects.toMatchObject({ code: "NOTIFICATION_SEND_FAILED" });
  });

  it("maps a network failure to NOTIFICATION_SEND_FAILED", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("getaddrinfo ENOTFOUND");
      }),
    );

    await expect(
      testChannel().send({ recipient: "ops@example.com", subject: "s", body: "b" }),
    ).rejects.toMatchObject({ code: "NOTIFICATION_SEND_FAILED" });
  });
});
