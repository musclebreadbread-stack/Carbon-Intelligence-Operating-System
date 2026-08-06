import { afterEach, describe, expect, it, vi } from "vitest";

import { OpenAiEmbeddingsClient } from "./openai-embeddings-client";
import { EmbeddingError } from "./types";

type FetchCall = { url: string; init: RequestInit };

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

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

const testClient = (overrides: Record<string, unknown> = {}) =>
  new OpenAiEmbeddingsClient({ apiKey: "sk-real-key", ...overrides });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("construction", () => {
  it("rejects a missing API key", () => {
    expect(() => new OpenAiEmbeddingsClient({ apiKey: "" })).toThrow(EmbeddingError);
  });

  it("defaults the model and dimensions and reports itself as non-deterministic", () => {
    const client = testClient();
    expect(client.model).toBe("text-embedding-3-small");
    expect(client.dimensions).toBe(1536);
    expect(client.isDeterministic).toBe(false);
    expect(client.provider).toBe("openai");
  });
});

describe("embed", () => {
  it("POSTs to the embeddings endpoint with a bearer token and the input text", async () => {
    const { calls } = stubFetch(() =>
      jsonResponse(200, { model: "text-embedding-3-small", data: [{ embedding: [0.1, 0.2, 0.3] }] }),
    );

    const result = await testClient().embed("diesel delivery truck");

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.openai.com/v1/embeddings");
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer sk-real-key");
    const body = JSON.parse(calls[0].init.body as string);
    expect(body.input).toBe("diesel delivery truck");
    expect(body.model).toBe("text-embedding-3-small");

    expect(result.vector).toEqual([0.1, 0.2, 0.3]);
    expect(result.provider).toBe("openai");
  });

  it("maps a non-OK response onto EmbeddingError", async () => {
    stubFetch(() => jsonResponse(401, { error: "invalid key" }));
    await expect(testClient().embed("x")).rejects.toMatchObject({ code: "EMBEDDING_UNAUTHORIZED" });
  });

  it("maps a response with no vector onto EMBEDDING_INVALID_RESPONSE", async () => {
    stubFetch(() => jsonResponse(200, { model: "m", data: [] }));
    await expect(testClient().embed("x")).rejects.toMatchObject({ code: "EMBEDDING_INVALID_RESPONSE" });
  });

  it("maps a network failure onto EMBEDDING_NETWORK_ERROR", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("getaddrinfo ENOTFOUND");
      }),
    );
    await expect(testClient().embed("x")).rejects.toMatchObject({ code: "EMBEDDING_NETWORK_ERROR" });
  });
});
