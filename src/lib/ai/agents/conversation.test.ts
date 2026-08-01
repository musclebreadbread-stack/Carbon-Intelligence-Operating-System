import { describe, expect, it } from "vitest";

import { DeterministicLlmClient } from "../llm/deterministic-client";
import { approximateTokens } from "../llm/types";

import { AgentConversation, DEFAULT_MAX_CONTEXT_TOKENS } from "./conversation";

const fixedClock = () => new Date(Date.UTC(2024, 0, 1));

const newConversation = (
  overrides: Partial<ConstructorParameters<typeof AgentConversation>[0]> = {},
) =>
  new AgentConversation({
    agentId: "agent-1",
    userId: "user-1",
    title: "Inventory questions",
    system: "You are a GHG inventory assistant.",
    clock: fixedClock,
    ...overrides,
  });

describe("AgentConversation", () => {
  it("records turns as AgentMessage-shaped rows", () => {
    const conversation = newConversation();
    conversation.addUserMessage("What were our Scope 1 emissions?");
    conversation.addAssistantMessage("24.24 tCO2e.", { tokensUsed: 7 });

    expect(conversation.messages).toHaveLength(2);
    expect(conversation.messages[0]).toMatchObject({
      role: "user",
      content: "What were our Scope 1 emissions?",
      metadata: null,
      isTokenEstimate: true,
      index: 0,
    });
    expect(conversation.messages[0].tokensUsed).toBe(
      approximateTokens("What were our Scope 1 emissions?"),
    );
    expect(conversation.messages[1]).toMatchObject({
      role: "assistant",
      tokensUsed: 7,
      isTokenEstimate: false,
      index: 1,
    });
    expect(conversation.messages[0].createdAt.toISOString()).toBe(
      "2024-01-01T00:00:00.000Z",
    );
  });

  it("records a tool result as a labelled turn", () => {
    const conversation = newConversation();
    conversation.addToolMessage("calculate_emissions", '{"totalEmissions":24.24}');
    expect(conversation.messages[0].role).toBe("tool");
    expect(conversation.messages[0].metadata?.tool).toBe("calculate_emissions");
    const window = conversation.contextWindow();
    expect(window.messages[1]).toEqual({
      role: "assistant",
      content: 'Tool result (calculate_emissions): {"totalEmissions":24.24}',
    });
  });

  it("totals the tokens across turns", () => {
    const conversation = newConversation();
    conversation.addUserMessage("abcd");
    conversation.addAssistantMessage("efgh", { tokensUsed: 5 });
    expect(conversation.totalTokens).toBe(1 + 5);
  });

  it("rejects an empty message", () => {
    const conversation = newConversation();
    expect(() => conversation.addUserMessage("")).toThrow(/must have content/);
  });

  it("rejects a non-positive context budget", () => {
    expect(() => newConversation({ maxContextTokens: 0 })).toThrow(
      /greater than zero/,
    );
  });

  it("defaults the context budget", () => {
    expect(newConversation({ maxContextTokens: undefined }).maxContextTokens).toBe(
      DEFAULT_MAX_CONTEXT_TOKENS,
    );
  });
});

describe("contextWindow", () => {
  it("always puts the system prompt first", () => {
    const conversation = newConversation();
    conversation.addUserMessage("hello");
    const window = conversation.contextWindow();
    expect(window.messages[0]).toEqual({
      role: "system",
      content: "You are a GHG inventory assistant.",
    });
    expect(window.isTruncated).toBe(false);
    expect(window.droppedCount).toBe(0);
  });

  it("omits the system message when none is configured", () => {
    const conversation = newConversation({ system: undefined });
    conversation.addUserMessage("hello");
    expect(conversation.contextWindow().messages).toEqual([
      { role: "user", content: "hello" },
    ]);
  });

  it("drops the oldest turns to fit the budget", () => {
    const conversation = newConversation({
      system: undefined,
      maxContextTokens: 10, // ≈40 characters
    });
    conversation.addUserMessage("a".repeat(40)); // 10 tokens
    conversation.addAssistantMessage("b".repeat(40));
    conversation.addUserMessage("c".repeat(40));

    const window = conversation.contextWindow();
    expect(window.messages).toHaveLength(1);
    expect(window.messages[0].content).toBe("c".repeat(40));
    expect(window.droppedCount).toBe(2);
    expect(window.isTruncated).toBe(true);
    expect(window.tokenEstimate).toBe(10);
    // Nothing is removed from the stored history.
    expect(conversation.messages).toHaveLength(3);
  });

  it("keeps as many recent turns as fit", () => {
    const conversation = newConversation({ system: undefined, maxContextTokens: 20 });
    conversation.addUserMessage("a".repeat(40));
    conversation.addAssistantMessage("b".repeat(40));
    conversation.addUserMessage("c".repeat(40));
    const window = conversation.contextWindow();
    expect(window.messages.map((message) => message.content[0])).toEqual(["b", "c"]);
    expect(window.droppedCount).toBe(1);
  });

  it("always keeps the latest message even when it alone exceeds the budget", () => {
    const conversation = newConversation({ system: undefined, maxContextTokens: 2 });
    conversation.addUserMessage("old");
    conversation.addUserMessage("x".repeat(400));
    const window = conversation.contextWindow();
    expect(window.messages).toHaveLength(1);
    expect(window.messages[0].content).toBe("x".repeat(400));
    expect(window.tokenEstimate).toBe(100);
  });

  it("reserves budget for the system prompt", () => {
    const system = "s".repeat(40); // 10 tokens
    const conversation = newConversation({ system, maxContextTokens: 15 });
    conversation.addUserMessage("a".repeat(40)); // 10 tokens
    conversation.addUserMessage("b".repeat(20)); // 5 tokens
    const window = conversation.contextWindow();
    expect(window.messages[0].role).toBe("system");
    expect(window.messages).toHaveLength(2);
    expect(window.messages[1].content).toBe("b".repeat(20));
    expect(window.tokenEstimate).toBe(15);
  });
});

describe("send", () => {
  it("adds the user turn, calls the client with the window and records the reply", async () => {
    const conversation = newConversation();
    const llm = new DeterministicLlmClient();
    const reply = await conversation.send(
      "Explain the Scope 1 emission result\n- Total emissions: 24.24 tCO2e",
      { llm },
    );

    expect(conversation.messages).toHaveLength(2);
    expect(conversation.messages[0].role).toBe("user");
    expect(reply.role).toBe("assistant");
    expect(reply.content.length).toBeGreaterThan(0);
    expect(reply.isTokenEstimate).toBe(false);
    expect(reply.metadata).toMatchObject({
      provider: "deterministic",
      droppedMessages: 0,
    });

    expect(llm.calls).toHaveLength(1);
    expect(llm.calls[0].messages[0].role).toBe("system");
    expect(llm.calls[0].options.temperature).toBe(0);
  });

  it("carries prior turns into the next call", async () => {
    const conversation = newConversation();
    const llm = new DeterministicLlmClient();
    await conversation.send("First emission question", { llm });
    await conversation.send("Second emission question", { llm });
    expect(conversation.messages).toHaveLength(4);
    const secondCall = llm.calls[1];
    expect(secondCall.messages.map((message) => message.role)).toEqual([
      "system",
      "user",
      "assistant",
      "user",
    ]);
  });

  it("refuses to send to a closed conversation", async () => {
    const conversation = newConversation().close();
    expect(conversation.status).toBe("closed");
    await expect(
      conversation.send("hello", { llm: new DeterministicLlmClient() }),
    ).rejects.toThrow(/closed conversation/);
  });
});

describe("toRecord", () => {
  it("shapes the conversation to the AgentConversation columns", () => {
    const conversation = newConversation({ context: { organizationId: "org-1" } });
    conversation.addUserMessage("abcd");
    const record = conversation.toRecord();
    expect(record).toMatchObject({
      title: "Inventory questions",
      status: "active",
      agentId: "agent-1",
      userId: "user-1",
    });
    expect(record.context).toMatchObject({
      organizationId: "org-1",
      messageCount: 1,
      totalTokens: 1,
      system: "You are a GHG inventory assistant.",
    });
  });

  it("returns the message rows for persistence", () => {
    const conversation = newConversation();
    conversation.addUserMessage("one");
    conversation.addAssistantMessage("two");
    const rows = conversation.toMessageRecords();
    expect(rows.map((row) => row.index)).toEqual([0, 1]);
    expect(rows).not.toBe(conversation.messages);
  });

  it("reports a closed status", () => {
    expect(newConversation().close().toRecord().status).toBe("closed");
  });
});
