import { describe, expect, it } from "vitest";
import { z } from "zod";

import { calendarYear } from "@/lib/core/period";
import { runCalculation } from "@/lib/domain/emissions/orchestrator";
import type { EmissionFactorLike } from "@/lib/domain/factors/types";

import { DeterministicLlmClient } from "../llm/deterministic-client";

import {
  DEFAULT_MAX_STEPS,
  defaultPlanner,
  executeTask,
  type AgentLike,
  type AgentTaskLike,
} from "./runtime";
import { ToolRegistry, createDefaultRegistry } from "./tool-registry";

const agent: AgentLike = {
  id: "agent-1",
  name: "Inventory analyst",
  type: "analysis",
  capabilities: ["calculate_emissions"],
};

/** Deterministic clock advancing 10 ms per read. */
const fakeClock = (): (() => number) => {
  let value = 0;
  return () => {
    value += 10;
    return value;
  };
};

const noSleep = async (): Promise<void> => {};

const factors: readonly EmissionFactorLike[] = [
  {
    id: "ef-gas",
    name: "Natural gas",
    value: 2.02,
    unit: "KG_CO2E_PER_M3",
    gasType: "CO2e",
    scope: "SCOPE_1",
    country: "KR",
    validFrom: new Date(Date.UTC(2024, 0, 1)),
    isActive: true,
  },
];

const entries = [
  {
    id: "entry-gas",
    name: "Boiler natural gas",
    quantity: 12_000,
    unit: "m3",
    scope: "SCOPE_1" as const,
    scope1SourceType: "STATIONARY" as const,
    country: "KR",
  },
];

const calculationTask: AgentTaskLike = {
  id: "task-1",
  name: "Calculate the 2024 inventory",
  maxRetries: 2,
  input: {
    tool: "calculate_emissions",
    input: {
      organizationId: "org-1",
      reportingYear: 2024,
      entries,
      factors,
    },
  },
};

describe("defaultPlanner", () => {
  it("reads an explicit toolCalls array", () => {
    const plan = defaultPlanner(agent, {
      id: "t",
      name: "n",
      input: { toolCalls: [{ tool: "a", input: 1 }, { tool: "b", input: 2 }] },
    });
    expect(plan.map((call) => call.tool)).toEqual(["a", "b"]);
  });

  it("reads a single tool routing", () => {
    const plan = defaultPlanner(agent, {
      id: "t",
      name: "n",
      input: { tool: "only", input: { a: 1 } },
    });
    expect(plan).toEqual([{ tool: "only", input: { a: 1 } }]);
  });

  it("throws when the task carries no plan", () => {
    expect(() => defaultPlanner(agent, { id: "t", name: "n" })).toThrow(
      /no toolCalls and no tool/,
    );
  });
});

describe("executeTask", () => {
  it("routes a task to calculate_emissions and returns the orchestrator total", async () => {
    const execution = await executeTask(agent, calculationTask, {
      registry: createDefaultRegistry(),
      now: fakeClock(),
      sleep: noSleep,
    });

    const expected = runCalculation({
      organizationId: "org-1",
      name: "Agent calculation",
      reportingYear: 2024,
      period: calendarYear(2024),
      gwpVersion: "AR6",
      candidateFactors: factors,
      entries,
    });

    expect(execution.status).toBe("COMPLETED");
    expect(execution.errorMessage).toBeNull();
    const output = execution.output.results.calculate_emissions as {
      totalEmissions: number;
    };
    expect(output.totalEmissions).toBeCloseTo(expected.inventory.totalEmissions, 9);
    expect(output.totalEmissions).toBeCloseTo(24.24, 6);
  });

  it("shapes the execution to the AgentExecution columns", async () => {
    const execution = await executeTask(agent, calculationTask, {
      registry: createDefaultRegistry(),
      now: fakeClock(),
      sleep: noSleep,
      startedAt: new Date(Date.UTC(2024, 5, 1)),
    });
    expect(execution).toMatchObject({
      agentId: "agent-1",
      taskId: "task-1",
      status: "COMPLETED",
      tokensUsed: 0,
      costUsd: 0,
    });
    expect(execution.duration).toBeGreaterThan(0);
    expect(execution.startedAt.toISOString()).toBe("2024-06-01T00:00:00.000Z");
    expect(execution.completedAt.getTime()).toBe(
      execution.startedAt.getTime() + execution.duration,
    );
    expect(execution.output.steps).toHaveLength(1);
    expect(execution.output.steps[0]).toMatchObject({
      step: 1,
      tool: "calculate_emissions",
      status: "succeeded",
      attempts: 1,
    });
  });

  it("logs every decision", async () => {
    const execution = await executeTask(agent, calculationTask, {
      registry: createDefaultRegistry(),
      now: fakeClock(),
      sleep: noSleep,
    });
    expect(execution.logs.length).toBeGreaterThanOrEqual(3);
    expect(execution.logs[0].message).toContain("Planned 1 tool call(s)");
    expect(execution.logs.some((entry) => entry.message.includes("succeeded"))).toBe(true);
    expect(execution.logs[execution.logs.length - 1].message).toContain("completed");
    expect(execution.logs.every((entry) => entry.elapsedMs >= 0)).toBe(true);
  });

  it("runs a multi-step plan in order and labels the results", async () => {
    const execution = await executeTask(
      agent,
      {
        id: "task-multi",
        name: "Calculate then aggregate",
        input: {
          toolCalls: [
            {
              tool: "calculate_emissions",
              label: "calc",
              input: { organizationId: "org-1", reportingYear: 2024, entries, factors },
            },
            {
              tool: "query_inventory",
              label: "inventory",
              input: { results: [{ scope: "SCOPE_1", totalCO2e: 24.24 }] },
            },
          ],
        },
      },
      { registry: createDefaultRegistry(), now: fakeClock(), sleep: noSleep },
    );
    expect(execution.status).toBe("COMPLETED");
    expect(execution.output.steps.map((step) => step.tool)).toEqual([
      "calculate_emissions",
      "query_inventory",
    ]);
    expect(Object.keys(execution.output.results)).toEqual(["calc", "inventory"]);
  });

  it("retries a throwing tool up to maxRetries then records the failure", async () => {
    let attempts = 0;
    const registry = new ToolRegistry();
    registry.register({
      name: "flaky",
      description: "Always throws",
      type: "test",
      schema: z.object({}),
      execute: () => {
        attempts += 1;
        throw new Error("upstream unavailable");
      },
    });

    const sleeps: number[] = [];
    const execution = await executeTask(
      agent,
      { id: "task-flaky", name: "Flaky", maxRetries: 2, input: { tool: "flaky", input: {} } },
      {
        registry,
        now: fakeClock(),
        sleep: async (ms) => {
          sleeps.push(ms);
        },
        retryBaseDelayMs: 100,
      },
    );

    expect(attempts).toBe(3); // the first try plus two retries
    expect(execution.status).toBe("FAILED");
    expect(execution.errorMessage).toContain("after 3 attempt(s)");
    expect(execution.errorMessage).toContain("upstream unavailable");
    expect(execution.output.steps[0]).toMatchObject({
      status: "failed",
      attempts: 3,
      output: null,
    });
    expect(execution.output.steps[0].errorMessage).toContain("upstream unavailable");
    expect(execution.retryCount).toBe(2);
    expect(sleeps).toEqual([100, 200]);
    // One warning per failed attempt, plus the terminal error entry.
    expect(execution.logs.filter((entry) => entry.level === "warn")).toHaveLength(3);
    expect(execution.logs.filter((entry) => entry.level === "error")).toHaveLength(1);
  });

  it("succeeds on a later attempt when the tool recovers", async () => {
    let attempts = 0;
    const registry = new ToolRegistry();
    registry.register({
      name: "recovers",
      description: "Fails once",
      type: "test",
      schema: z.object({}),
      execute: () => {
        attempts += 1;
        if (attempts < 2) throw new Error("transient");
        return { ok: true };
      },
    });
    const execution = await executeTask(
      agent,
      { id: "t", name: "Recovers", maxRetries: 3, input: { tool: "recovers", input: {} } },
      { registry, now: fakeClock(), sleep: noSleep },
    );
    expect(execution.status).toBe("COMPLETED");
    expect(execution.output.steps[0].attempts).toBe(2);
    expect(execution.retryCount).toBe(1);
  });

  it("does not retry an input-validation failure", async () => {
    let attempts = 0;
    const registry = new ToolRegistry();
    registry.register({
      name: "strict",
      description: "Requires a number",
      type: "test",
      schema: z.object({ value: z.number() }),
      execute: () => {
        attempts += 1;
        return null;
      },
    });
    const execution = await executeTask(
      agent,
      {
        id: "t",
        name: "Bad input",
        maxRetries: 5,
        input: { tool: "strict", input: { value: "nope" } },
      },
      { registry, now: fakeClock(), sleep: noSleep },
    );
    expect(attempts).toBe(0);
    expect(execution.status).toBe("FAILED");
    expect(execution.output.steps[0].attempts).toBe(1);
    expect(execution.errorMessage).toContain("Invalid input");
    expect(execution.errorMessage).toContain("value");
    expect(execution.retryCount).toBe(0);
  });

  it("stops at a step budget", async () => {
    const execution = await executeTask(
      agent,
      {
        id: "t",
        name: "Too many steps",
        input: {
          toolCalls: Array.from({ length: DEFAULT_MAX_STEPS + 1 }, () => ({
            tool: "query_inventory",
            input: { results: [{ scope: "SCOPE_1", totalCO2e: 1 }] },
          })),
        },
      },
      { registry: createDefaultRegistry(), now: fakeClock(), sleep: noSleep },
    );
    expect(execution.status).toBe("FAILED");
    expect(execution.errorMessage).toContain("above the maximum");
    expect(execution.output.steps).toEqual([]);
  });

  it("honours the task timeout", async () => {
    const registry = createDefaultRegistry();
    const execution = await executeTask(
      agent,
      {
        id: "t",
        name: "Slow",
        timeout: 5,
        input: {
          toolCalls: [
            { tool: "query_inventory", input: { results: [{ scope: "SCOPE_1", totalCO2e: 1 }] } },
            { tool: "query_inventory", input: { results: [{ scope: "SCOPE_1", totalCO2e: 2 }] } },
          ],
        },
      },
      { registry, now: fakeClock(), sleep: noSleep },
    );
    expect(execution.status).toBe("FAILED");
    expect(execution.errorMessage).toContain("exceeded its 5 ms budget");
  });

  it("cancels a task for an inactive agent", async () => {
    const execution = await executeTask(
      { ...agent, isActive: false },
      calculationTask,
      { registry: createDefaultRegistry(), now: fakeClock(), sleep: noSleep },
    );
    expect(execution.status).toBe("CANCELLED");
    expect(execution.errorMessage).toContain("not active");
    expect(execution.output.steps).toEqual([]);
  });

  it("fails cleanly when the task cannot be planned", async () => {
    const execution = await executeTask(
      agent,
      { id: "t", name: "No plan" },
      { registry: createDefaultRegistry(), now: fakeClock(), sleep: noSleep },
    );
    expect(execution.status).toBe("FAILED");
    expect(execution.errorMessage).toContain("no toolCalls");
    expect(execution.logs[0].level).toBe("error");
  });

  it("accepts a custom planner", async () => {
    const execution = await executeTask(
      agent,
      { id: "t", name: "Planned externally" },
      {
        registry: createDefaultRegistry(),
        now: fakeClock(),
        sleep: noSleep,
        planner: () => [
          { tool: "query_inventory", input: { results: [{ scope: "SCOPE_1", totalCO2e: 7 }] } },
        ],
      },
    );
    expect(execution.status).toBe("COMPLETED");
    expect(
      (execution.output.results.query_inventory as { totalEmissions: number }).totalEmissions,
    ).toBe(7);
  });

  it("renders a narrative summary when an LLM client is injected", async () => {
    const llm = new DeterministicLlmClient();
    const execution = await executeTask(agent, calculationTask, {
      registry: createDefaultRegistry(),
      now: fakeClock(),
      sleep: noSleep,
      llm,
    });
    expect(execution.output.summary).toBeTruthy();
    expect(llm.calls).toHaveLength(1);
    expect(llm.calls[0].messages[1].content).toContain("calculate_emissions");
    expect(execution.tokensUsed).toBeGreaterThan(0);
    expect(execution.costUsd).toBe(0);
    expect(execution.logs.some((entry) => entry.message.includes("Narrative summary"))).toBe(
      true,
    );
  });

  it("leaves the summary null when no client is injected", async () => {
    const execution = await executeTask(agent, calculationTask, {
      registry: createDefaultRegistry(),
      now: fakeClock(),
      sleep: noSleep,
    });
    expect(execution.output.summary).toBeNull();
  });

  it("does not fail the task when the narrative call fails", async () => {
    const execution = await executeTask(agent, calculationTask, {
      registry: createDefaultRegistry(),
      now: fakeClock(),
      sleep: noSleep,
      llm: {
        provider: "openai",
        model: "gpt-4o-mini",
        isDeterministic: false,
        complete: () => Promise.reject(new Error("provider down")),
        completeJson: () => Promise.reject(new Error("provider down")),
      },
    });
    expect(execution.status).toBe("COMPLETED");
    expect(execution.output.summary).toBeNull();
    expect(
      execution.logs.some(
        (entry) => entry.level === "warn" && entry.message.includes("provider down"),
      ),
    ).toBe(true);
  });
});
