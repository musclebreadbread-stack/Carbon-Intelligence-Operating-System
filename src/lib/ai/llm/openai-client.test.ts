import { afterEach, describe, expect, it, vi } from "vitest";

import { MAX_RETRY_DELAY_MS, OpenAiLlmClient } from "./openai-client";
import { LlmError } from "./types";

type FetchCall = { url: string; init: RequestInit };

const okBody = (text = "narrative text", model = "gpt-4o-mini") => ({
  model,
  choices: [{ message: { content: text }, finish_reason: "stop" }],
  usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
});

const jsonResponse = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });

function stubFetch(
  responder: (call: FetchCall, attempt: number) => Response | Promise<Response>,
): { calls: FetchCall[]; spy: ReturnType<typeof vi.fn> } {
  const calls: FetchCall[] = [];
  const spy = vi.fn(async (url: string, init: RequestInit) => {
    const call = { url, init };
    calls.push(call);
    return responder(call, calls.length);
  });
  vi.stubGlobal("fetch", spy);
  return { calls, spy };
}

const sleeps: number[] = [];
const testClient = (overrides: Record<string, unknown> = {}) =>
  new OpenAiLlmClient({
    apiKey: "sk-real-key",
    sleep: async (ms: number) => {
      sleeps.push(ms);
    },
    ...overrides,
  });

afterEach(() => {
  vi.unstubAllGlobals();
  sleeps.length = 0;
});

describe("construction", () => {
  it("rejects a missing API key", () => {
    expect(() => new OpenAiLlmClient({ apiKey: "" })).toThrow(LlmError);
    expect(() => new OpenAiLlmClient({ apiKey: "  " })).toThrow(/requires an API key/);
  });

  it("defaults the model and reports itself as non-deterministic", () => {
    const client = testClient();
    expect(client.model).toBe("gpt-4o-mini");
    expect(client.provider).toBe("openai");
    expect(client.isDeterministic).toBe(false);
  });
});

describe("request shape", () => {
  it("POSTs to the chat-completions endpoint with a bearer token", async () => {
    const { calls } = stubFetch(() => jsonResponse(200, okBody()));
    await testClient().complete("hello", { system: "be terse" });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.openai.com/v1/chat/completions");
    expect(calls[0].init.method).toBe("POST");
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer sk-real-key");
    expect(headers["Content-Type"]).toBe("application/json");

    const body = JSON.parse(calls[0].init.body as string);
    expect(body).toMatchObject({
      model: "gpt-4o-mini",
      temperature: 0,
      messages: [
        { role: "system", content: "be terse" },
        { role: "user", content: "hello" },
      ],
    });
  });

  it("passes the optional generation parameters through", async () => {
    const { calls } = stubFetch(() => jsonResponse(200, okBody()));
    await testClient().complete("hello", {
      model: "gpt-4o",
      temperature: 0.4,
      maxTokens: 256,
      stop: ["END"],
      seed: 7,
      jsonMode: true,
    });
    const body = JSON.parse(calls[0].init.body as string);
    expect(body).toMatchObject({
      model: "gpt-4o",
      temperature: 0.4,
      max_tokens: 256,
      stop: ["END"],
      seed: 7,
      response_format: { type: "json_object" },
    });
  });

  it("omits optional parameters that were not supplied", async () => {
    const { calls } = stubFetch(() => jsonResponse(200, okBody()));
    await testClient().complete("hello");
    const body = JSON.parse(calls[0].init.body as string);
    expect(body).not.toHaveProperty("max_tokens");
    expect(body).not.toHaveProperty("stop");
    expect(body).not.toHaveProperty("seed");
    expect(body).not.toHaveProperty("response_format");
  });

  it("honours a custom base URL and organisation header", async () => {
    const { calls } = stubFetch(() => jsonResponse(200, okBody()));
    await testClient({
      baseUrl: "https://gateway.internal/openai/v1/",
      organization: "org-123",
    }).complete("hello");
    expect(calls[0].url).toBe("https://gateway.internal/openai/v1/chat/completions");
    expect((calls[0].init.headers as Record<string, string>)["OpenAI-Organization"]).toBe(
      "org-123",
    );
  });

  it("sends an abort signal so the timeout can fire", async () => {
    const { calls } = stubFetch(() => jsonResponse(200, okBody()));
    await testClient().complete("hello");
    expect(calls[0].init.signal).toBeInstanceOf(AbortSignal);
  });
});

describe("response mapping", () => {
  it("maps the completion, usage and cost", async () => {
    stubFetch(() => jsonResponse(200, okBody("the narrative")));
    const completion = await testClient().complete("hello");
    expect(completion).toMatchObject({
      text: "the narrative",
      promptTokens: 100,
      completionTokens: 50,
      tokensUsed: 150,
      model: "gpt-4o-mini",
      finishReason: "stop",
      provider: "openai",
    });
    // (100 × 0.15 + 50 × 0.6) / 1e6
    expect(completion.costUsd).toBeCloseTo(0.000045, 12);
  });

  it("estimates usage when the provider omits it", async () => {
    stubFetch(() =>
      jsonResponse(200, {
        model: "gpt-4o-mini",
        choices: [{ message: { content: "abcdefgh" }, finish_reason: "stop" }],
      }),
    );
    const completion = await testClient().complete("hello");
    expect(completion.completionTokens).toBe(2);
    expect(completion.promptTokens).toBeGreaterThan(0);
    expect(completion.tokensUsed).toBe(
      completion.promptTokens + completion.completionTokens,
    );
  });

  it("maps the finish reason, defaulting unknown values to stop", async () => {
    stubFetch(() =>
      jsonResponse(200, {
        model: "gpt-4o-mini",
        choices: [{ message: { content: "x" }, finish_reason: "length" }],
      }),
    );
    expect((await testClient().complete("hi")).finishReason).toBe("length");

    vi.unstubAllGlobals();
    stubFetch(() =>
      jsonResponse(200, {
        model: "gpt-4o-mini",
        choices: [{ message: { content: "x" }, finish_reason: "something_new" }],
      }),
    );
    expect((await testClient().complete("hi")).finishReason).toBe("stop");
  });

  it("treats a missing choice as empty text", async () => {
    stubFetch(() => jsonResponse(200, { model: "gpt-4o-mini", choices: [] }));
    expect((await testClient().complete("hi")).text).toBe("");
  });
});

describe("error mapping", () => {
  it("maps 401 to LLM_UNAUTHORIZED without retrying", async () => {
    const { calls } = stubFetch(() =>
      jsonResponse(401, { error: { message: "Incorrect API key provided" } }),
    );
    try {
      await testClient().complete("hello");
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(LlmError);
      expect((error as LlmError).code).toBe("LLM_UNAUTHORIZED");
      expect((error as LlmError).status).toBe(401);
      expect((error as LlmError).retryable).toBe(false);
    }
    expect(calls).toHaveLength(1);
    expect(sleeps).toEqual([]);
  });

  it("does not retry a 400", async () => {
    const { calls } = stubFetch(() => jsonResponse(400, { error: "bad" }));
    await expect(testClient().complete("hello")).rejects.toMatchObject({
      code: "LLM_BAD_REQUEST",
    });
    expect(calls).toHaveLength(1);
  });

  it("retries a 429 with exponential backoff and then succeeds", async () => {
    const { calls } = stubFetch((_call, attempt) =>
      attempt <= 2 ? jsonResponse(429, { error: "slow down" }) : jsonResponse(200, okBody()),
    );
    const completion = await testClient({ retryBaseDelayMs: 100 }).complete("hello");
    expect(completion.text).toBe("narrative text");
    expect(calls).toHaveLength(3);
    // 100 × 2^0, then 100 × 2^1
    expect(sleeps).toEqual([100, 200]);
  });

  it("gives up after maxRetries and surfaces the rate-limit error", async () => {
    const { calls } = stubFetch(() => jsonResponse(429, { error: "slow down" }));
    await expect(
      testClient({ retryBaseDelayMs: 10, maxRetries: 2 }).complete("hello"),
    ).rejects.toMatchObject({ code: "LLM_RATE_LIMITED", retryable: true });
    expect(calls).toHaveLength(3);
    expect(sleeps).toEqual([10, 20]);
  });

  it("honours a Retry-After header", async () => {
    stubFetch((_call, attempt) =>
      attempt === 1
        ? jsonResponse(429, { error: "slow down" }, { "retry-after": "3" })
        : jsonResponse(200, okBody()),
    );
    await testClient({ retryBaseDelayMs: 100 }).complete("hello");
    expect(sleeps).toEqual([3_000]);
  });

  it("retries a 500 and maps it when retries are exhausted", async () => {
    const { calls } = stubFetch(() => jsonResponse(503, { error: "unavailable" }));
    await expect(
      testClient({ retryBaseDelayMs: 5, maxRetries: 1 }).complete("hello"),
    ).rejects.toMatchObject({ code: "LLM_SERVER_ERROR" });
    expect(calls).toHaveLength(2);
  });

  it("does not retry at all when maxRetries is zero", async () => {
    const { calls } = stubFetch(() => jsonResponse(429, { error: "slow down" }));
    await expect(testClient({ maxRetries: 0 }).complete("hello")).rejects.toMatchObject({
      code: "LLM_RATE_LIMITED",
    });
    expect(calls).toHaveLength(1);
  });

  it("maps an aborted request to LLM_TIMEOUT", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        const error = new Error("aborted");
        error.name = "AbortError";
        return Promise.reject(error);
      }),
    );
    await expect(
      testClient({ maxRetries: 0, timeoutMs: 25 }).complete("hello"),
    ).rejects.toMatchObject({ code: "LLM_TIMEOUT", retryable: true });
  });

  it("maps a network failure to LLM_NETWORK_ERROR and retries it", async () => {
    const spy = vi.fn(() => Promise.reject(new Error("ECONNRESET")));
    vi.stubGlobal("fetch", spy);
    await expect(
      testClient({ maxRetries: 1, retryBaseDelayMs: 5 }).complete("hello"),
    ).rejects.toMatchObject({ code: "LLM_NETWORK_ERROR" });
    expect(spy).toHaveBeenCalledTimes(2);
  });
});

describe("retryDelayMs", () => {
  it("doubles the base delay per attempt", () => {
    const client = testClient({ retryBaseDelayMs: 250 });
    expect(client.retryDelayMs(1)).toBe(250);
    expect(client.retryDelayMs(2)).toBe(500);
    expect(client.retryDelayMs(3)).toBe(1_000);
  });

  it("applies the injected jitter multiplier", () => {
    const client = testClient({ retryBaseDelayMs: 100, jitter: () => 0.5 });
    expect(client.retryDelayMs(2)).toBe(100);
  });

  it("caps the delay", () => {
    const client = testClient({ retryBaseDelayMs: 10_000 });
    expect(client.retryDelayMs(10)).toBe(MAX_RETRY_DELAY_MS);
    expect(client.retryDelayMs(1, 9_999)).toBe(MAX_RETRY_DELAY_MS);
  });

  it("never returns a negative delay", () => {
    expect(testClient().retryDelayMs(1, -5)).toBe(0);
  });
});

describe("completeJson", () => {
  const validator = {
    parse: (input: unknown) => {
      const record = input as { summary?: unknown };
      if (typeof record.summary !== "string") throw new Error("summary must be a string");
      return { summary: record.summary };
    },
  };

  it("requests JSON mode and validates the payload", async () => {
    const { calls } = stubFetch(() => jsonResponse(200, okBody('{"summary":"ok"}')));
    const result = await testClient().completeJson("summarise", validator);
    expect(result.data).toEqual({ summary: "ok" });
    const body = JSON.parse(calls[0].init.body as string);
    expect(body.response_format).toEqual({ type: "json_object" });
  });

  it("tolerates a fenced JSON response", async () => {
    stubFetch(() => jsonResponse(200, okBody('```json\n{"summary":"fenced"}\n```')));
    const result = await testClient().completeJson("summarise", validator);
    expect(result.data).toEqual({ summary: "fenced" });
  });

  it("maps invalid JSON to LLM_INVALID_RESPONSE", async () => {
    stubFetch(() => jsonResponse(200, okBody("this is prose, not json")));
    await expect(testClient().completeJson("summarise", validator)).rejects.toMatchObject({
      code: "LLM_INVALID_RESPONSE",
    });
  });

  it("maps a schema mismatch to LLM_INVALID_RESPONSE", async () => {
    stubFetch(() => jsonResponse(200, okBody('{"summary":42}')));
    await expect(testClient().completeJson("summarise", validator)).rejects.toMatchObject({
      code: "LLM_INVALID_RESPONSE",
    });
  });
});
