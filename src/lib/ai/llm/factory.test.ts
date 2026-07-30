import { describe, expect, it } from "vitest";

import { DeterministicLlmClient } from "./deterministic-client";
import {
  PLACEHOLDER_API_KEYS,
  describeLlmMode,
  getLlmClient,
  getLlmMode,
  isLlmConfigured,
  isPlaceholderKey,
} from "./factory";
import { OpenAiLlmClient } from "./openai-client";

describe("isPlaceholderKey", () => {
  it("treats the .env.local placeholder as unconfigured", () => {
    expect(isPlaceholderKey("sk-placeholder")).toBe(true);
    expect(isPlaceholderKey("placeholder")).toBe(true);
  });

  it("treats every declared placeholder as unconfigured, case-insensitively", () => {
    for (const value of PLACEHOLDER_API_KEYS) {
      expect(isPlaceholderKey(value)).toBe(true);
      expect(isPlaceholderKey(value.toUpperCase())).toBe(true);
      expect(isPlaceholderKey(`  ${value}  `)).toBe(true);
    }
  });

  it("treats absent and blank values as unconfigured", () => {
    expect(isPlaceholderKey(undefined)).toBe(true);
    expect(isPlaceholderKey(null)).toBe(true);
    expect(isPlaceholderKey("")).toBe(true);
    expect(isPlaceholderKey("   ")).toBe(true);
  });

  it("rejects anything containing the word placeholder", () => {
    expect(isPlaceholderKey("sk-proj-PLACEHOLDER-1234")).toBe(true);
  });

  it("accepts a realistic key", () => {
    expect(isPlaceholderKey("sk-proj-abc123def456")).toBe(false);
  });
});

describe("isLlmConfigured and getLlmMode", () => {
  it("reports deterministic mode for the placeholder key", () => {
    expect(isLlmConfigured({ OPENAI_API_KEY: "sk-placeholder" })).toBe(false);
    expect(getLlmMode({ OPENAI_API_KEY: "sk-placeholder" })).toBe("deterministic");
  });

  it("reports openai mode for a real key", () => {
    expect(isLlmConfigured({ OPENAI_API_KEY: "sk-proj-real" })).toBe(true);
    expect(getLlmMode({ OPENAI_API_KEY: "sk-proj-real" })).toBe("openai");
  });

  it("reports deterministic mode for an empty environment", () => {
    expect(isLlmConfigured({})).toBe(false);
  });
});

describe("getLlmClient", () => {
  it("returns the deterministic client when the key is absent", () => {
    expect(getLlmClient({ env: {} })).toBeInstanceOf(DeterministicLlmClient);
  });

  it("returns the deterministic client for the sk-placeholder value", () => {
    const client = getLlmClient({ env: { OPENAI_API_KEY: "sk-placeholder" } });
    expect(client).toBeInstanceOf(DeterministicLlmClient);
    expect(client.isDeterministic).toBe(true);
  });

  it("returns the OpenAI client when a real key is configured", () => {
    const client = getLlmClient({
      env: { OPENAI_API_KEY: "sk-proj-real", OPENAI_MODEL: "gpt-4o" },
    });
    expect(client).toBeInstanceOf(OpenAiLlmClient);
    expect(client.model).toBe("gpt-4o");
    expect(client.isDeterministic).toBe(false);
  });

  it("can be forced to the deterministic client despite a real key", () => {
    const client = getLlmClient({
      env: { OPENAI_API_KEY: "sk-proj-real" },
      forceDeterministic: true,
    });
    expect(client).toBeInstanceOf(DeterministicLlmClient);
  });

  it("lets an explicit model override the environment", () => {
    expect(
      getLlmClient({ env: { OPENAI_API_KEY: "sk-proj-real", OPENAI_MODEL: "gpt-4o" }, model: "gpt-4.1-mini" })
        .model,
    ).toBe("gpt-4.1-mini");
  });

  it("defaults the model when the environment does not set one", () => {
    expect(getLlmClient({ env: { OPENAI_API_KEY: "sk-proj-real" } }).model).toBe(
      "gpt-4o-mini",
    );
  });

  it("ignores a non-numeric timeout instead of failing", () => {
    expect(() =>
      getLlmClient({
        env: { OPENAI_API_KEY: "sk-proj-real", OPENAI_TIMEOUT_MS: "not-a-number" },
      }),
    ).not.toThrow();
  });

  it("returns a fresh instance per call so recorded prompts do not leak", async () => {
    const first = getLlmClient({ env: {} }) as DeterministicLlmClient;
    await first.complete("prompt one");
    const second = getLlmClient({ env: {} }) as DeterministicLlmClient;
    expect(first).not.toBe(second);
    expect(second.calls).toEqual([]);
  });
});

describe("describeLlmMode", () => {
  it("labels deterministic mode in English and Korean", () => {
    const described = describeLlmMode({ OPENAI_API_KEY: "sk-placeholder" });
    expect(described.mode).toBe("deterministic");
    expect(described.model).toBe("deterministic");
    expect(described.label).toContain("no OPENAI_API_KEY configured");
    expect(described.labelKo).toContain("결정론적 서술");
  });

  it("labels OpenAI mode with the model in use", () => {
    const described = describeLlmMode({
      OPENAI_API_KEY: "sk-proj-real",
      OPENAI_MODEL: "gpt-4o",
    });
    expect(described.mode).toBe("openai");
    expect(described.label).toContain("gpt-4o");
    expect(described.labelKo).toContain("OpenAI 생성형 서술");
  });
});
