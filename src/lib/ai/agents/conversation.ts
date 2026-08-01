/**
 * Agent conversation state and context windowing.
 *
 * A conversation grows without bound; a model context does not. `contextWindow()`
 * keeps the system prompt and the most recent turns that fit inside
 * `maxContextTokens`, dropping the oldest turns first and always keeping the
 * latest user message — sending a request with the question dropped is worse than
 * sending one with less history.
 *
 * Token counts are estimates (`approximateTokens`, four characters per token) for
 * every message the provider has not reported usage for, and every record says so.
 *
 * Records are shaped to `AgentConversation` and `AgentMessage`.
 *
 * No framework, database or network imports.
 */

import { AppError } from "@/lib/core/errors";

import {
  approximateTokens,
  type LlmClient,
  type LlmCompletionOptions,
  type LlmMessage,
  type LlmRole,
} from "../llm/types";

export const MESSAGE_ROLES = ["system", "user", "assistant", "tool"] as const;
export type MessageRole = (typeof MESSAGE_ROLES)[number];

export const DEFAULT_MAX_CONTEXT_TOKENS = 8_000;

/** Plain object shaped to the `AgentMessage` model. */
export type AgentMessageRecord = {
  readonly role: MessageRole;
  readonly content: string;
  readonly metadata: Readonly<Record<string, unknown>> | null;
  readonly tokensUsed: number;
  /** True when `tokensUsed` is the four-characters-per-token estimate. */
  readonly isTokenEstimate: boolean;
  readonly createdAt: Date;
  readonly index: number;
};

/** Plain object shaped to the `AgentConversation` model. */
export type AgentConversationRecord = {
  readonly title: string | null;
  readonly context: Readonly<Record<string, unknown>>;
  readonly status: string;
  readonly agentId: string;
  readonly userId: string;
};

export type AgentConversationOptions = {
  readonly agentId: string;
  readonly userId: string;
  readonly title?: string;
  /** Always retained at the head of the context window. */
  readonly system?: string;
  readonly maxContextTokens?: number;
  readonly context?: Readonly<Record<string, unknown>>;
  /** Fixed clock so message timestamps are deterministic under test. */
  readonly clock?: () => Date;
};

export type ConversationWindow = {
  readonly messages: readonly LlmMessage[];
  readonly tokenEstimate: number;
  /** Messages dropped to fit the budget. */
  readonly droppedCount: number;
  readonly maxContextTokens: number;
  readonly isTruncated: boolean;
};

export class AgentConversation {
  readonly agentId: string;
  readonly userId: string;
  readonly title: string | null;
  readonly system: string | null;
  readonly maxContextTokens: number;

  private readonly history: AgentMessageRecord[] = [];
  private readonly context: Record<string, unknown>;
  private readonly clock: () => Date;
  private state = "active";

  constructor(options: AgentConversationOptions) {
    if (options.maxContextTokens !== undefined && options.maxContextTokens <= 0) {
      throw new AppError(
        "CONVERSATION_INVALID",
        "maxContextTokens must be greater than zero",
        { maxContextTokens: options.maxContextTokens },
      );
    }
    this.agentId = options.agentId;
    this.userId = options.userId;
    this.title = options.title ?? null;
    this.system = options.system ?? null;
    this.maxContextTokens = options.maxContextTokens ?? DEFAULT_MAX_CONTEXT_TOKENS;
    this.context = { ...(options.context ?? {}) };
    this.clock = options.clock ?? (() => new Date(0));
  }

  get messages(): readonly AgentMessageRecord[] {
    return this.history;
  }

  get status(): string {
    return this.state;
  }

  get totalTokens(): number {
    return this.history.reduce((total, message) => total + message.tokensUsed, 0);
  }

  get lastMessage(): AgentMessageRecord | undefined {
    return this.history[this.history.length - 1];
  }

  close(): this {
    this.state = "closed";
    return this;
  }

  private add(
    role: MessageRole,
    content: string,
    options: {
      readonly tokensUsed?: number;
      readonly metadata?: Readonly<Record<string, unknown>>;
    } = {},
  ): AgentMessageRecord {
    if (content.length === 0) {
      throw new AppError("CONVERSATION_INVALID", "A message must have content", { role });
    }
    const record: AgentMessageRecord = {
      role,
      content,
      metadata: options.metadata ?? null,
      tokensUsed: options.tokensUsed ?? approximateTokens(content),
      isTokenEstimate: options.tokensUsed === undefined,
      createdAt: this.clock(),
      index: this.history.length,
    };
    this.history.push(record);
    return record;
  }

  addUserMessage(
    content: string,
    metadata?: Readonly<Record<string, unknown>>,
  ): AgentMessageRecord {
    return this.add("user", content, { metadata });
  }

  addAssistantMessage(
    content: string,
    options: {
      readonly tokensUsed?: number;
      readonly metadata?: Readonly<Record<string, unknown>>;
    } = {},
  ): AgentMessageRecord {
    return this.add("assistant", content, options);
  }

  /** Records a tool result as a conversation turn, so the model can see it. */
  addToolMessage(
    toolName: string,
    content: string,
    metadata?: Readonly<Record<string, unknown>>,
  ): AgentMessageRecord {
    return this.add("tool", content, { metadata: { ...metadata, tool: toolName } });
  }

  /**
   * The message list for the next model call.
   *
   * `tool` messages are sent as `assistant` turns, because the chat-completions
   * schema this platform targets has no separate tool role in its message list.
   */
  contextWindow(): ConversationWindow {
    const systemMessage: LlmMessage | null =
      this.system === null ? null : { role: "system", content: this.system };
    const systemTokens = systemMessage ? approximateTokens(systemMessage.content) : 0;
    const budget = Math.max(0, this.maxContextTokens - systemTokens);

    const kept: AgentMessageRecord[] = [];
    let used = 0;
    for (let index = this.history.length - 1; index >= 0; index -= 1) {
      const message = this.history[index];
      const cost = approximateTokens(message.content);
      // Always keep the most recent message, even if it alone exceeds the budget:
      // a request without the question is useless.
      if (kept.length > 0 && used + cost > budget) break;
      kept.unshift(message);
      used += cost;
    }

    const asLlmRole = (role: MessageRole): LlmRole =>
      role === "tool" ? "assistant" : (role as LlmRole);

    return {
      messages: [
        ...(systemMessage ? [systemMessage] : []),
        ...kept.map((message) => ({
          role: asLlmRole(message.role),
          content:
            message.role === "tool"
              ? `Tool result (${String(message.metadata?.tool ?? "unknown")}): ${message.content}`
              : message.content,
        })),
      ],
      tokenEstimate: systemTokens + used,
      droppedCount: this.history.length - kept.length,
      maxContextTokens: this.maxContextTokens,
      isTruncated: kept.length < this.history.length,
    };
  }

  /**
   * Adds a user turn, calls the injected client with the windowed context, and
   * records the reply. The client is a parameter, never an import.
   */
  async send(
    content: string,
    deps: { readonly llm: LlmClient; readonly options?: LlmCompletionOptions },
  ): Promise<AgentMessageRecord> {
    if (this.state !== "active") {
      throw new AppError("CONVERSATION_CLOSED", "Cannot send to a closed conversation", {
        status: this.state,
      });
    }
    this.addUserMessage(content);
    const window = this.contextWindow();
    const completion = await deps.llm.complete(window.messages, {
      temperature: 0,
      ...deps.options,
    });
    return this.addAssistantMessage(completion.text, {
      tokensUsed: completion.completionTokens,
      metadata: {
        provider: completion.provider,
        model: completion.model,
        costUsd: completion.costUsd,
        promptTokens: completion.promptTokens,
        droppedMessages: window.droppedCount,
      },
    });
  }

  /** Plain object shaped to the `AgentConversation` model. */
  toRecord(): AgentConversationRecord {
    return {
      title: this.title,
      context: {
        ...this.context,
        messageCount: this.history.length,
        totalTokens: this.totalTokens,
        maxContextTokens: this.maxContextTokens,
        system: this.system,
      },
      status: this.state,
      agentId: this.agentId,
      userId: this.userId,
    };
  }

  /** `AgentMessage`-shaped rows for persistence, in order. */
  toMessageRecords(): readonly AgentMessageRecord[] {
    return [...this.history];
  }
}
