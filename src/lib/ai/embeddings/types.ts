/**
 * Embedding client contract.
 *
 * Mirrors `src/lib/ai/llm/types.ts`: generative narrative sits behind
 * `LlmClient`, and vector embeddings sit behind this one interface so semantic
 * search never knows whether a vector came from a hosted model or a
 * deterministic placeholder. Two implementations satisfy it —
 * `OpenAiEmbeddingsClient` (`fetch` against `/v1/embeddings`) and
 * `DeterministicEmbeddingsClient` (a seeded pseudo-embedding, no network) — and
 * `getEmbeddingClient()` in `factory.ts` picks one from the environment.
 *
 * No framework imports: bare `fetch` only, so this runs unchanged in the Node
 * runtime and under the test runner.
 */

import { AppError, type ErrorDetails } from "@/lib/core/errors";

export type EmbeddingVector = readonly number[];

export type Embedding = {
  readonly vector: EmbeddingVector;
  readonly dimensions: number;
  readonly model: string;
  /** Provider name, e.g. `"openai"` or `"deterministic"`. */
  readonly provider: string;
};

export type EmbeddingClient = {
  readonly provider: string;
  readonly model: string;
  readonly dimensions: number;
  /** True when the same input always produces byte-identical output. */
  readonly isDeterministic: boolean;
  embed(text: string): Promise<Embedding>;
};

export const EMBEDDING_ERROR_CODES = [
  "EMBEDDING_UNAUTHORIZED",
  "EMBEDDING_RATE_LIMITED",
  "EMBEDDING_SERVER_ERROR",
  "EMBEDDING_BAD_REQUEST",
  "EMBEDDING_TIMEOUT",
  "EMBEDDING_NETWORK_ERROR",
  "EMBEDDING_INVALID_RESPONSE",
  "EMBEDDING_NOT_CONFIGURED",
] as const;
export type EmbeddingErrorCode = (typeof EMBEDDING_ERROR_CODES)[number];

export class EmbeddingError extends AppError {
  readonly status?: number;
  readonly retryable: boolean;

  constructor(
    code: EmbeddingErrorCode,
    message: string,
    options: {
      readonly status?: number;
      readonly retryable?: boolean;
      readonly details?: ErrorDetails;
    } = {},
  ) {
    super(code, message, options.details);
    this.status = options.status;
    this.retryable = options.retryable ?? false;
  }
}

/** Maps an HTTP status from a provider onto a typed error. */
export function embeddingErrorForStatus(
  status: number,
  body: string,
  details?: ErrorDetails,
): EmbeddingError {
  const truncated = body.length > 500 ? `${body.slice(0, 500)}…` : body;
  if (status === 401 || status === 403) {
    return new EmbeddingError(
      "EMBEDDING_UNAUTHORIZED",
      `Embeddings provider rejected the API key (${status})`,
      { status, retryable: false, details: { ...details, body: truncated } },
    );
  }
  if (status === 429) {
    return new EmbeddingError(
      "EMBEDDING_RATE_LIMITED",
      "Embeddings provider rate limit exceeded (429)",
      { status, retryable: true, details: { ...details, body: truncated } },
    );
  }
  if (status >= 500) {
    return new EmbeddingError(
      "EMBEDDING_SERVER_ERROR",
      `Embeddings provider server error (${status})`,
      { status, retryable: true, details: { ...details, body: truncated } },
    );
  }
  return new EmbeddingError(
    "EMBEDDING_BAD_REQUEST",
    `Embeddings provider rejected the request (${status})`,
    { status, retryable: false, details: { ...details, body: truncated } },
  );
}

export const DEFAULT_EMBEDDING_DIMENSIONS = 1536;
