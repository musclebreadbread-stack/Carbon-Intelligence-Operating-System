import { describe, expect, it } from "vitest";

import { DeterministicEmbeddingsClient } from "./deterministic-embeddings-client";
import { getEmbeddingClient, getEmbeddingMode, isEmbeddingConfigured } from "./factory";
import { OpenAiEmbeddingsClient } from "./openai-embeddings-client";

describe("isEmbeddingConfigured and getEmbeddingMode", () => {
  it("reports deterministic mode for a placeholder or absent key", () => {
    expect(isEmbeddingConfigured({})).toBe(false);
    expect(isEmbeddingConfigured({ OPENAI_API_KEY: "sk-placeholder" })).toBe(false);
    expect(getEmbeddingMode({})).toBe("deterministic");
  });

  it("reports openai mode for a real key", () => {
    expect(isEmbeddingConfigured({ OPENAI_API_KEY: "sk-proj-real" })).toBe(true);
    expect(getEmbeddingMode({ OPENAI_API_KEY: "sk-proj-real" })).toBe("openai");
  });
});

describe("getEmbeddingClient", () => {
  it("returns the deterministic client when unconfigured", () => {
    expect(getEmbeddingClient({ env: {} })).toBeInstanceOf(DeterministicEmbeddingsClient);
  });

  it("returns the OpenAI client when a real key is configured", () => {
    const client = getEmbeddingClient({ env: { OPENAI_API_KEY: "sk-proj-real" } });
    expect(client).toBeInstanceOf(OpenAiEmbeddingsClient);
    expect(client.isDeterministic).toBe(false);
  });

  it("can be forced to the deterministic client despite a real key", () => {
    const client = getEmbeddingClient({
      env: { OPENAI_API_KEY: "sk-proj-real" },
      forceDeterministic: true,
    });
    expect(client).toBeInstanceOf(DeterministicEmbeddingsClient);
  });
});
