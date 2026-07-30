import { describe, expect, it } from "vitest";

import {
  DEFAULT_MODEL,
  LlmError,
  MODEL_PRICING,
  approximateTokens,
  estimateCost,
  isPricedModel,
  llmErrorForStatus,
  messagesToText,
  parseJsonResponse,
  toMessages,
} from "./types";

describe("toMessages", () => {
  it("wraps a string prompt as a user message", () => {
    expect(toMessages("hello")).toEqual([{ role: "user", content: "hello" }]);
  });

  it("prepends a system message when one is supplied", () => {
    expect(toMessages("hello", "be terse")).toEqual([
      { role: "system", content: "be terse" },
      { role: "user", content: "hello" },
    ]);
  });

  it("does not add a second system message", () => {
    const messages = [
      { role: "system", content: "existing" },
      { role: "user", content: "hi" },
    ] as const;
    expect(toMessages(messages, "ignored")).toEqual(messages);
  });

  it("passes a message list through unchanged", () => {
    const messages = [{ role: "user", content: "hi" }] as const;
    expect(toMessages(messages)).toBe(messages);
  });
});

describe("approximateTokens and messagesToText", () => {
  it("estimates four characters per token", () => {
    expect(approximateTokens("")).toBe(0);
    expect(approximateTokens("abcd")).toBe(1);
    expect(approximateTokens("abcde")).toBe(2);
  });

  it("renders messages with role prefixes", () => {
    expect(
      messagesToText([
        { role: "system", content: "s" },
        { role: "user", content: "u" },
      ]),
    ).toBe("system: s\n\nuser: u");
  });
});

describe("estimateCost", () => {
  it("prices a known model per million tokens", () => {
    const pricing = MODEL_PRICING["gpt-4o-mini"];
    expect(estimateCost("gpt-4o-mini", 1_000_000, 0)).toBeCloseTo(pricing.promptPerMTok, 12);
    expect(estimateCost("gpt-4o-mini", 0, 1_000_000)).toBeCloseTo(
      pricing.completionPerMTok,
      12,
    );
    expect(estimateCost("gpt-4o-mini", 1_000, 2_000)).toBeCloseTo(
      (1_000 * 0.15 + 2_000 * 0.6) / 1_000_000,
      15,
    );
  });

  it("prices an unknown model at zero rather than guessing", () => {
    expect(estimateCost("some-future-model", 1_000, 1_000)).toBe(0);
    expect(isPricedModel("some-future-model")).toBe(false);
    expect(isPricedModel(DEFAULT_MODEL)).toBe(true);
    expect(estimateCost("deterministic", 10_000, 10_000)).toBe(0);
  });
});

describe("llmErrorForStatus", () => {
  it("maps 401 and 403 to a non-retryable unauthorized error", () => {
    for (const status of [401, 403]) {
      const error = llmErrorForStatus(status, "bad key");
      expect(error).toBeInstanceOf(LlmError);
      expect(error.code).toBe("LLM_UNAUTHORIZED");
      expect(error.retryable).toBe(false);
      expect(error.status).toBe(status);
    }
  });

  it("maps 429 to a retryable rate-limit error", () => {
    const error = llmErrorForStatus(429, "slow down");
    expect(error.code).toBe("LLM_RATE_LIMITED");
    expect(error.retryable).toBe(true);
  });

  it("maps 5xx to a retryable server error", () => {
    for (const status of [500, 502, 503]) {
      const error = llmErrorForStatus(status, "oops");
      expect(error.code).toBe("LLM_SERVER_ERROR");
      expect(error.retryable).toBe(true);
    }
  });

  it("maps other 4xx to a non-retryable bad request", () => {
    const error = llmErrorForStatus(400, "malformed");
    expect(error.code).toBe("LLM_BAD_REQUEST");
    expect(error.retryable).toBe(false);
  });

  it("truncates a long provider body", () => {
    const error = llmErrorForStatus(400, "x".repeat(2_000));
    expect(String(error.details?.body).length).toBeLessThan(600);
    expect(String(error.details?.body).endsWith("…")).toBe(true);
  });
});

describe("parseJsonResponse", () => {
  it("parses plain JSON", () => {
    expect(parseJsonResponse('{"a":1}')).toEqual({ a: 1 });
  });

  it("strips a ```json fence", () => {
    expect(parseJsonResponse('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(parseJsonResponse('```\n[1,2]\n```')).toEqual([1, 2]);
  });

  it("throws a typed error on invalid JSON", () => {
    try {
      parseJsonResponse("not json at all");
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(LlmError);
      expect((error as LlmError).code).toBe("LLM_INVALID_RESPONSE");
    }
  });
});
