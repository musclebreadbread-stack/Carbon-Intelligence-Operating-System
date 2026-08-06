/**
 * OpenAI embeddings client.
 *
 * A single `fetch` POST against `/v1/embeddings` — no SDK, no retry loop. Unlike
 * `OpenAiLlmClient`, a failed embed is not retried here: the caller (a backfill
 * script or an on-demand search) decides whether to retry, the same way
 * `ResendNotificationChannel` leaves retrying to its caller.
 *
 * No framework imports; `fetch` and `AbortSignal` are used directly.
 */

import {
  DEFAULT_EMBEDDING_DIMENSIONS,
  EmbeddingError,
  embeddingErrorForStatus,
  type Embedding,
  type EmbeddingClient,
} from "./types";

export const OPENAI_EMBEDDINGS_BASE_URL = "https://api.openai.com/v1";
export const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";
export const DEFAULT_TIMEOUT_MS = 30_000;

export type OpenAiEmbeddingsClientConfig = {
  readonly apiKey: string;
  readonly model?: string;
  readonly dimensions?: number;
  readonly baseUrl?: string;
  readonly timeoutMs?: number;
};

type EmbeddingsResponse = {
  readonly model?: string;
  readonly data?: readonly { readonly embedding?: readonly number[] }[];
};

export class OpenAiEmbeddingsClient implements EmbeddingClient {
  readonly provider = "openai";
  readonly model: string;
  readonly dimensions: number;
  readonly isDeterministic = false;

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(config: OpenAiEmbeddingsClientConfig) {
    if (!config.apiKey || config.apiKey.trim().length === 0) {
      throw new EmbeddingError("EMBEDDING_NOT_CONFIGURED", "OpenAiEmbeddingsClient requires an API key");
    }
    this.apiKey = config.apiKey;
    this.model = config.model ?? DEFAULT_EMBEDDING_MODEL;
    this.dimensions = config.dimensions ?? DEFAULT_EMBEDDING_DIMENSIONS;
    this.baseUrl = (config.baseUrl ?? OPENAI_EMBEDDINGS_BASE_URL).replace(/\/$/, "");
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async embed(text: string): Promise<Embedding> {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}/embeddings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({ model: this.model, input: text, dimensions: this.dimensions }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw embeddingErrorForStatus(response.status, body);
      }

      const payload = (await response.json()) as EmbeddingsResponse;
      const vector = payload.data?.[0]?.embedding;
      if (!vector) {
        throw new EmbeddingError(
          "EMBEDDING_INVALID_RESPONSE",
          "Embeddings response contained no vector",
        );
      }

      return {
        vector,
        dimensions: vector.length,
        model: payload.model ?? this.model,
        provider: this.provider,
      };
    } catch (error) {
      if (error instanceof EmbeddingError) throw error;
      const isAbort = error instanceof Error && error.name === "AbortError";
      throw new EmbeddingError(
        isAbort ? "EMBEDDING_TIMEOUT" : "EMBEDDING_NETWORK_ERROR",
        isAbort
          ? `Embeddings request timed out after ${this.timeoutMs} ms`
          : "Embeddings request failed at the network layer",
        { retryable: true, details: { cause: error instanceof Error ? error.message : String(error) } },
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
