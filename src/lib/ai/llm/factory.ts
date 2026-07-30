/**
 * LLM client selection.
 *
 * `getLlmClient()` returns the OpenAI client when a real API key is configured,
 * and the deterministic template client otherwise. Placeholder values are treated
 * as *not configured*: `.env.local` ships `OPENAI_API_KEY=sk-placeholder`, and a
 * placeholder that reached the provider would produce a 401 at request time
 * instead of a clean fallback at construction time.
 *
 * `isLlmConfigured()` drives the UI badge that tells the user which mode they are
 * in, so generated narrative is never silently passed off as model output.
 *
 * No framework imports; only `process.env` is read.
 */

import { DeterministicLlmClient } from "./deterministic-client";
import { OpenAiLlmClient, type OpenAiClientConfig } from "./openai-client";
import { DEFAULT_MODEL, type LlmClient } from "./types";

/**
 * Values that look like a key but are not one. Matched case-insensitively after
 * trimming; any value containing `placeholder` is also rejected.
 */
export const PLACEHOLDER_API_KEYS = [
  "sk-placeholder",
  "placeholder",
  "your-api-key",
  "changeme",
  "todo",
  "none",
] as const;

export type LlmEnvironment = {
  /** Index signature so `process.env` is assignable without a cast. */
  readonly [key: string]: string | undefined;
  readonly OPENAI_API_KEY?: string;
  readonly OPENAI_MODEL?: string;
  readonly OPENAI_BASE_URL?: string;
  readonly OPENAI_ORGANIZATION?: string;
  readonly OPENAI_TIMEOUT_MS?: string;
};

/** True when `value` is absent, blank or one of the known placeholders. */
export function isPlaceholderKey(value: string | undefined | null): boolean {
  if (value === undefined || value === null) return true;
  const trimmed = value.trim();
  if (trimmed.length === 0) return true;
  const lower = trimmed.toLowerCase();
  if (lower.includes("placeholder")) return true;
  return (PLACEHOLDER_API_KEYS as readonly string[]).includes(lower);
}

/** Whether a usable OpenAI key is present in the given environment. */
export function isLlmConfigured(env: LlmEnvironment = process.env): boolean {
  return !isPlaceholderKey(env.OPENAI_API_KEY);
}

export type LlmMode = "openai" | "deterministic";

export function getLlmMode(env: LlmEnvironment = process.env): LlmMode {
  return isLlmConfigured(env) ? "openai" : "deterministic";
}

export type GetLlmClientOptions = {
  readonly env?: LlmEnvironment;
  /** Force the deterministic client regardless of the environment. */
  readonly forceDeterministic?: boolean;
  readonly model?: string;
  /** Overrides merged into the OpenAI client config. */
  readonly openai?: Partial<Omit<OpenAiClientConfig, "apiKey">>;
};

/**
 * The client for the current environment.
 *
 * A fresh instance per call: the deterministic client records prompts, so sharing
 * one across requests would leak one caller's prompts into another's assertions.
 */
export function getLlmClient(options: GetLlmClientOptions = {}): LlmClient {
  const env = options.env ?? process.env;
  if (options.forceDeterministic === true || !isLlmConfigured(env)) {
    return new DeterministicLlmClient({ model: options.model });
  }
  const timeoutMs = Number(env.OPENAI_TIMEOUT_MS);
  return new OpenAiLlmClient({
    apiKey: (env.OPENAI_API_KEY as string).trim(),
    model: options.model ?? env.OPENAI_MODEL ?? DEFAULT_MODEL,
    baseUrl: env.OPENAI_BASE_URL,
    organization: env.OPENAI_ORGANIZATION,
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : undefined,
    ...options.openai,
  });
}

/** Human-readable description of the active mode, for the UI badge. */
export function describeLlmMode(env: LlmEnvironment = process.env): {
  readonly mode: LlmMode;
  readonly model: string;
  readonly label: string;
  readonly labelKo: string;
} {
  const mode = getLlmMode(env);
  const model = mode === "openai" ? (env.OPENAI_MODEL ?? DEFAULT_MODEL) : "deterministic";
  return {
    mode,
    model,
    label:
      mode === "openai"
        ? `Generative narrative via OpenAI (${model})`
        : "Deterministic narrative (no OPENAI_API_KEY configured)",
    labelKo:
      mode === "openai"
        ? `OpenAI 생성형 서술 (${model})`
        : "결정론적 서술 (OPENAI_API_KEY 미설정)",
  };
}
