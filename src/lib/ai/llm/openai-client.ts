/**
 * OpenAI chat-completions client.
 *
 * A single `fetch` POST against `/v1/chat/completions` — no SDK, so there is no
 * extra dependency and nothing that assumes a particular runtime. The base URL is
 * configurable, which also makes any OpenAI-compatible gateway (Azure OpenAI, a
 * local proxy) usable without code changes.
 *
 * Retries: 429 and 5xx are retried with exponential backoff and full jitter,
 * honouring a `Retry-After` header when the provider sends one. 401/403 and 4xx
 * are not retried — a bad key does not get better by asking again.
 *
 * No framework imports; `fetch` and `AbortSignal` are used directly.
 */

import {
  DEFAULT_MODEL,
  LlmError,
  approximateTokens,
  estimateCost,
  llmErrorForStatus,
  parseJsonResponse,
  toMessages,
  type JsonValidator,
  type LlmClient,
  type LlmCompletion,
  type LlmCompletionOptions,
  type LlmFinishReason,
  type LlmJsonCompletion,
  type LlmMessage,
} from "./types";

export const OPENAI_BASE_URL = "https://api.openai.com/v1";
export const DEFAULT_TIMEOUT_MS = 60_000;
export const DEFAULT_MAX_RETRIES = 2;
export const DEFAULT_RETRY_BASE_DELAY_MS = 500;
export const MAX_RETRY_DELAY_MS = 20_000;

export type OpenAiClientConfig = {
  readonly apiKey: string;
  readonly model?: string;
  readonly baseUrl?: string;
  readonly organization?: string;
  readonly timeoutMs?: number;
  /** Retries *after* the first attempt. `0` disables retrying. */
  readonly maxRetries?: number;
  readonly retryBaseDelayMs?: number;
  /** Injected for tests; defaults to no jitter multiplier of 1. */
  readonly jitter?: () => number;
  /** Injected for tests so backoff does not actually sleep. */
  readonly sleep?: (ms: number) => Promise<void>;
  /** Injected for tests; defaults to `Date.now`. */
  readonly now?: () => number;
};

type ChatCompletionResponse = {
  readonly model?: string;
  readonly choices?: readonly {
    readonly message?: { readonly content?: string | null };
    readonly finish_reason?: string | null;
  }[];
  readonly usage?: {
    readonly prompt_tokens?: number;
    readonly completion_tokens?: number;
    readonly total_tokens?: number;
  };
};

function mapFinishReason(reason: string | null | undefined): LlmFinishReason {
  switch (reason) {
    case "stop":
      return "stop";
    case "length":
      return "length";
    case "content_filter":
      return "content_filter";
    default:
      return "stop";
  }
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export class OpenAiLlmClient implements LlmClient {
  readonly provider = "openai";
  readonly model: string;
  readonly isDeterministic = false;

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly organization?: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly retryBaseDelayMs: number;
  private readonly jitter: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;

  constructor(config: OpenAiClientConfig) {
    if (!config.apiKey || config.apiKey.trim().length === 0) {
      throw new LlmError("LLM_NOT_CONFIGURED", "OpenAiLlmClient requires an API key");
    }
    this.apiKey = config.apiKey;
    this.model = config.model ?? DEFAULT_MODEL;
    this.baseUrl = (config.baseUrl ?? OPENAI_BASE_URL).replace(/\/$/, "");
    this.organization = config.organization;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.retryBaseDelayMs = config.retryBaseDelayMs ?? DEFAULT_RETRY_BASE_DELAY_MS;
    this.jitter = config.jitter ?? (() => 1);
    this.sleep = config.sleep ?? defaultSleep;
    this.now = config.now ?? (() => Date.now());
  }

  /** Delay before retry `attempt` (1-based), with exponential backoff and jitter. */
  retryDelayMs(attempt: number, retryAfterSeconds?: number): number {
    if (retryAfterSeconds !== undefined && Number.isFinite(retryAfterSeconds)) {
      return Math.min(Math.max(0, retryAfterSeconds) * 1000, MAX_RETRY_DELAY_MS);
    }
    const exponential = this.retryBaseDelayMs * 2 ** (attempt - 1);
    return Math.min(Math.round(exponential * this.jitter()), MAX_RETRY_DELAY_MS);
  }

  async complete(
    prompt: string | readonly LlmMessage[],
    options: LlmCompletionOptions = {},
  ): Promise<LlmCompletion> {
    const messages = toMessages(prompt, options.system);
    const model = options.model ?? this.model;
    const startedAt = this.now();

    const body: Record<string, unknown> = {
      model,
      messages: messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
      temperature: options.temperature ?? 0,
    };
    if (options.maxTokens !== undefined) body.max_tokens = options.maxTokens;
    if (options.stop !== undefined) body.stop = [...options.stop];
    if (options.seed !== undefined) body.seed = options.seed;
    if (options.jsonMode === true) body.response_format = { type: "json_object" };
    if (options.metadata !== undefined) body.metadata = options.metadata;

    const payload = await this.post("/chat/completions", body, options.timeoutMs);
    const text = payload.choices?.[0]?.message?.content ?? "";
    const promptTokens =
      payload.usage?.prompt_tokens ??
      approximateTokens(messages.map((message) => message.content).join("\n"));
    const completionTokens = payload.usage?.completion_tokens ?? approximateTokens(text);

    return {
      text,
      promptTokens,
      completionTokens,
      tokensUsed: payload.usage?.total_tokens ?? promptTokens + completionTokens,
      model: payload.model ?? model,
      costUsd: estimateCost(payload.model ?? model, promptTokens, completionTokens),
      finishReason: mapFinishReason(payload.choices?.[0]?.finish_reason),
      provider: this.provider,
      durationMs: this.now() - startedAt,
    };
  }

  async completeJson<T>(
    prompt: string | readonly LlmMessage[],
    validator: JsonValidator<T>,
    options: LlmCompletionOptions = {},
  ): Promise<LlmJsonCompletion<T>> {
    const completion = await this.complete(prompt, { ...options, jsonMode: true });
    const parsed = parseJsonResponse(completion.text);
    try {
      return { ...completion, data: validator.parse(parsed) };
    } catch (error) {
      throw new LlmError(
        "LLM_INVALID_RESPONSE",
        "LLM JSON response did not match the expected schema",
        {
          details: {
            cause: error instanceof Error ? error.message : String(error),
            text: completion.text.slice(0, 500),
          },
        },
      );
    }
  }

  private async post(
    path: string,
    body: Record<string, unknown>,
    timeoutMs?: number,
  ): Promise<ChatCompletionResponse> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.apiKey}`,
    };
    if (this.organization !== undefined) headers["OpenAI-Organization"] = this.organization;

    let lastError: LlmError | undefined;

    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => {
        controller.abort();
      }, timeoutMs ?? this.timeoutMs);

      try {
        const response = await fetch(`${this.baseUrl}${path}`, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!response.ok) {
          const text = await response.text().catch(() => "");
          const error = llmErrorForStatus(response.status, text, {
            attempt: attempt + 1,
            path,
          });
          if (!error.retryable || attempt === this.maxRetries) throw error;
          lastError = error;
          // `Number(null)` is 0, so the header has to be checked for presence
          // before being coerced, or a missing header would mean "retry now".
          const header = response.headers.get("retry-after");
          const retryAfter = header === null ? Number.NaN : Number(header);
          await this.sleep(
            this.retryDelayMs(attempt + 1, Number.isNaN(retryAfter) ? undefined : retryAfter),
          );
          continue;
        }

        return (await response.json()) as ChatCompletionResponse;
      } catch (error) {
        if (error instanceof LlmError) throw error;
        const isAbort = error instanceof Error && error.name === "AbortError";
        const mapped = isAbort
          ? new LlmError(
              "LLM_TIMEOUT",
              `LLM request timed out after ${timeoutMs ?? this.timeoutMs} ms`,
              { retryable: true, details: { attempt: attempt + 1 } },
            )
          : new LlmError("LLM_NETWORK_ERROR", "LLM request failed at the network layer", {
              retryable: true,
              details: {
                attempt: attempt + 1,
                cause: error instanceof Error ? error.message : String(error),
              },
            });
        if (attempt === this.maxRetries) throw mapped;
        lastError = mapped;
        await this.sleep(this.retryDelayMs(attempt + 1));
      } finally {
        clearTimeout(timeout);
      }
    }

    throw (
      lastError ??
      new LlmError("LLM_NETWORK_ERROR", "LLM request failed with no recorded cause")
    );
  }
}
