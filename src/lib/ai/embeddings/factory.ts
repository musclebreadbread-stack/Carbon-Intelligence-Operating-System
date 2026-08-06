/**
 * Embedding client selection.
 *
 * Mirrors `ai/llm/factory.ts`: `getEmbeddingClient()` returns the OpenAI client
 * when a real `OPENAI_API_KEY` is configured, and the deterministic client
 * otherwise — reusing `isPlaceholderKey` rather than re-implementing the
 * placeholder-detection rule.
 *
 * No framework imports; only `process.env` is read.
 */

import { isPlaceholderKey } from "@/lib/ai/llm/factory";

import { DeterministicEmbeddingsClient } from "./deterministic-embeddings-client";
import { DEFAULT_EMBEDDING_MODEL, OpenAiEmbeddingsClient } from "./openai-embeddings-client";
import type { EmbeddingClient } from "./types";

export type EmbeddingEnvironment = {
  readonly [key: string]: string | undefined;
  readonly OPENAI_API_KEY?: string;
};

export function isEmbeddingConfigured(env: EmbeddingEnvironment = process.env): boolean {
  return !isPlaceholderKey(env.OPENAI_API_KEY);
}

export type EmbeddingMode = "openai" | "deterministic";

export function getEmbeddingMode(env: EmbeddingEnvironment = process.env): EmbeddingMode {
  return isEmbeddingConfigured(env) ? "openai" : "deterministic";
}

export type GetEmbeddingClientOptions = {
  readonly env?: EmbeddingEnvironment;
  readonly forceDeterministic?: boolean;
  readonly model?: string;
};

/** A fresh client for the current environment, mirroring `getLlmClient()`. */
export function getEmbeddingClient(options: GetEmbeddingClientOptions = {}): EmbeddingClient {
  const env = options.env ?? process.env;
  if (options.forceDeterministic === true || !isEmbeddingConfigured(env)) {
    return new DeterministicEmbeddingsClient({ model: options.model });
  }
  return new OpenAiEmbeddingsClient({
    apiKey: (env.OPENAI_API_KEY as string).trim(),
    model: options.model ?? DEFAULT_EMBEDDING_MODEL,
  });
}
