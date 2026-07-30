/**
 * LLM client contract.
 *
 * Generative AI sits behind this one interface so the rest of the platform never
 * knows whether a narrative was written by a hosted model or by a template. Two
 * implementations satisfy it: `OpenAiLlmClient` (a `fetch` call against the
 * OpenAI REST API) and `DeterministicLlmClient` (templates, no network). The
 * factory picks one from the environment.
 *
 * Only *narrative* passes through here. Every number the narrative describes is
 * computed deterministically by `src/lib/domain/**`, which is what keeps an
 * audited figure reproducible.
 *
 * No framework imports: this module and its implementations use bare `fetch`
 * only, so they run unchanged in the Node runtime and under the test runner.
 */

import { AppError, type ErrorDetails } from "@/lib/core/errors";

export const LLM_ROLES = ["system", "user", "assistant"] as const;
export type LlmRole = (typeof LLM_ROLES)[number];

export type LlmMessage = {
  readonly role: LlmRole;
  readonly content: string;
};

export type LlmCompletionOptions = {
  readonly model?: string;
  /** 0 for reproducible output, which is the default everywhere in CIOS. */
  readonly temperature?: number;
  readonly maxTokens?: number;
  /** Prepended as a `system` message when `prompt` is a plain string. */
  readonly system?: string;
  readonly timeoutMs?: number;
  /** Ask the provider for strict JSON output. Set automatically by `completeJson`. */
  readonly jsonMode?: boolean;
  readonly stop?: readonly string[];
  /** Provider-side determinism hint, where supported. */
  readonly seed?: number;
  /** Free-form labels recorded on the completion for cost attribution. */
  readonly metadata?: Readonly<Record<string, string | number | boolean>>;
};

export type LlmFinishReason = "stop" | "length" | "content_filter" | "error" | "template";

export type LlmCompletion = {
  readonly text: string;
  readonly tokensUsed: number;
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly model: string;
  readonly costUsd: number;
  readonly finishReason: LlmFinishReason;
  /** Provider name, e.g. `"openai"` or `"deterministic"`. */
  readonly provider: string;
  /** Wall-clock duration of the call, in milliseconds. */
  readonly durationMs: number;
};

export type LlmJsonCompletion<T> = LlmCompletion & {
  readonly data: T;
};

/**
 * Minimal validator contract for `completeJson`.
 *
 * A zod schema satisfies this structurally, so callers can pass one without this
 * module taking a dependency on zod.
 */
export type JsonValidator<T> = {
  parse(input: unknown): T;
};

export type LlmClient = {
  readonly provider: string;
  readonly model: string;
  /** True when the same input always produces byte-identical output. */
  readonly isDeterministic: boolean;
  complete(
    prompt: string | readonly LlmMessage[],
    options?: LlmCompletionOptions,
  ): Promise<LlmCompletion>;
  completeJson<T>(
    prompt: string | readonly LlmMessage[],
    validator: JsonValidator<T>,
    options?: LlmCompletionOptions,
  ): Promise<LlmJsonCompletion<T>>;
};

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export const LLM_ERROR_CODES = [
  "LLM_UNAUTHORIZED",
  "LLM_RATE_LIMITED",
  "LLM_SERVER_ERROR",
  "LLM_BAD_REQUEST",
  "LLM_TIMEOUT",
  "LLM_NETWORK_ERROR",
  "LLM_INVALID_RESPONSE",
  "LLM_NOT_CONFIGURED",
] as const;
export type LlmErrorCode = (typeof LLM_ERROR_CODES)[number];

export class LlmError extends AppError {
  readonly status?: number;
  readonly retryable: boolean;

  constructor(
    code: LlmErrorCode,
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
export function llmErrorForStatus(
  status: number,
  body: string,
  details?: ErrorDetails,
): LlmError {
  const truncated = body.length > 500 ? `${body.slice(0, 500)}…` : body;
  if (status === 401 || status === 403) {
    return new LlmError("LLM_UNAUTHORIZED", `LLM provider rejected the API key (${status})`, {
      status,
      retryable: false,
      details: { ...details, body: truncated },
    });
  }
  if (status === 429) {
    return new LlmError("LLM_RATE_LIMITED", "LLM provider rate limit exceeded (429)", {
      status,
      retryable: true,
      details: { ...details, body: truncated },
    });
  }
  if (status >= 500) {
    return new LlmError("LLM_SERVER_ERROR", `LLM provider server error (${status})`, {
      status,
      retryable: true,
      details: { ...details, body: truncated },
    });
  }
  return new LlmError("LLM_BAD_REQUEST", `LLM provider rejected the request (${status})`, {
    status,
    retryable: false,
    details: { ...details, body: truncated },
  });
}

// ---------------------------------------------------------------------------
// Cost model
// ---------------------------------------------------------------------------

/** USD per million tokens, by model. */
export const MODEL_PRICING: Readonly<
  Record<string, { readonly promptPerMTok: number; readonly completionPerMTok: number }>
> = {
  "gpt-4o": { promptPerMTok: 2.5, completionPerMTok: 10 },
  "gpt-4o-mini": { promptPerMTok: 0.15, completionPerMTok: 0.6 },
  "gpt-4.1": { promptPerMTok: 2, completionPerMTok: 8 },
  "gpt-4.1-mini": { promptPerMTok: 0.4, completionPerMTok: 1.6 },
  "gpt-4.1-nano": { promptPerMTok: 0.1, completionPerMTok: 0.4 },
  deterministic: { promptPerMTok: 0, completionPerMTok: 0 },
};

export const DEFAULT_MODEL = "gpt-4o-mini";

/**
 * Cost of a completion in USD.
 *
 * An unknown model is priced at zero rather than guessed: a fabricated cost in an
 * audit trail is worse than a missing one, and `isPricedModel` lets the caller
 * detect the gap.
 */
export function estimateCost(
  model: string,
  promptTokens: number,
  completionTokens: number,
): number {
  const pricing = MODEL_PRICING[model];
  if (!pricing) return 0;
  return (
    (promptTokens * pricing.promptPerMTok + completionTokens * pricing.completionPerMTok) /
    1_000_000
  );
}

export function isPricedModel(model: string): boolean {
  return MODEL_PRICING[model] !== undefined;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Normalises a prompt into a message list, prepending `system` when given. */
export function toMessages(
  prompt: string | readonly LlmMessage[],
  system?: string,
): readonly LlmMessage[] {
  const body: readonly LlmMessage[] =
    typeof prompt === "string" ? [{ role: "user", content: prompt }] : prompt;
  if (system === undefined) return body;
  if (body.some((message) => message.role === "system")) return body;
  return [{ role: "system", content: system }, ...body];
}

/**
 * Rough token count: four characters per token.
 *
 * Used only where the provider does not report usage (the deterministic client)
 * and for the context-window budgeting in `ai/agents/conversation.ts`. It is an
 * estimate and is labelled as such wherever it surfaces.
 */
export function approximateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function messagesToText(messages: readonly LlmMessage[]): string {
  return messages.map((message) => `${message.role}: ${message.content}`).join("\n\n");
}

/**
 * Extracts a JSON object from model output, tolerating the ```json fences models
 * add even when asked not to.
 */
export function parseJsonResponse(text: string): unknown {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(trimmed);
  const candidate = fenced ? fenced[1] : trimmed;
  try {
    return JSON.parse(candidate) as unknown;
  } catch (error) {
    throw new LlmError("LLM_INVALID_RESPONSE", "LLM response was not valid JSON", {
      details: {
        text: trimmed.length > 500 ? `${trimmed.slice(0, 500)}…` : trimmed,
        cause: error instanceof Error ? error.message : String(error),
      },
    });
  }
}
