/**
 * Agent runtime.
 *
 * Runs an `AgentTask` as a **bounded** sequence of tool calls. Bounded is the
 * operative word: an agent that can loop indefinitely is an agent that can spend
 * an unbounded amount of money, so `maxSteps`, `maxRetries` and `timeout` are all
 * enforced and every decision is written to `logs`.
 *
 * Retry policy:
 *  - a tool that *throws* is retried up to `AgentTask.maxRetries` times with
 *    exponential backoff;
 *  - a tool whose **input** fails zod validation is not retried — a malformed
 *    argument list will not validate on a second attempt.
 *
 * Output is shaped to the `AgentExecution` model.
 *
 * No framework, database or network imports.
 */

import type { AgentStatus } from "@/lib/core/enums";
import { AppError } from "@/lib/core/errors";

import type { LlmClient, LlmCompletionOptions } from "../llm/types";

import { ToolInputError, type ToolRegistry } from "./tool-registry";

export const DEFAULT_MAX_STEPS = 10;
export const DEFAULT_MAX_RETRIES = 3;
export const DEFAULT_RETRY_BASE_DELAY_MS = 200;

/** The `Agent` fields the runtime depends on. */
export type AgentLike = {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly capabilities?: readonly string[];
  readonly config?: Readonly<Record<string, unknown>> | null;
  readonly isActive?: boolean;
};

/** The `AgentTask` fields the runtime depends on. */
export type AgentTaskLike = {
  readonly id: string;
  readonly name: string;
  readonly description?: string | null;
  readonly type?: string | null;
  readonly input?: unknown;
  /** Wall-clock budget in milliseconds. */
  readonly timeout?: number | null;
  readonly maxRetries?: number;
  readonly retryCount?: number;
};

export type PlannedToolCall = {
  readonly tool: string;
  readonly input: unknown;
  readonly label?: string;
};

export const LOG_LEVELS = ["info", "warn", "error"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export type AgentExecutionLogEntry = {
  readonly step: number;
  readonly level: LogLevel;
  readonly message: string;
  readonly tool?: string;
  readonly attempt?: number;
  readonly durationMs?: number;
  readonly elapsedMs: number;
};

export type ToolStepResult = {
  readonly step: number;
  readonly tool: string;
  readonly label: string | null;
  readonly status: "succeeded" | "failed";
  readonly attempts: number;
  readonly output: unknown;
  readonly errorMessage: string | null;
  readonly durationMs: number;
};

/** Plain object shaped to the `AgentExecution` model. */
export type AgentExecutionRecord = {
  readonly agentId: string;
  readonly taskId: string;
  readonly status: AgentStatus;
  readonly input: unknown;
  readonly output: {
    readonly steps: readonly ToolStepResult[];
    readonly results: Readonly<Record<string, unknown>>;
    readonly summary: string | null;
  };
  readonly logs: readonly AgentExecutionLogEntry[];
  readonly tokensUsed: number;
  readonly costUsd: number;
  /** Milliseconds, from the injected clock. */
  readonly duration: number;
  readonly errorMessage: string | null;
  readonly startedAt: Date;
  readonly completedAt: Date;
  readonly retryCount: number;
};

export type TaskPlanner = (
  agent: AgentLike,
  task: AgentTaskLike,
) => readonly PlannedToolCall[];

export type ExecuteTaskDeps = {
  readonly registry: ToolRegistry;
  /** Optional; used only to render the `summary` narrative over the results. */
  readonly llm?: LlmClient;
  readonly llmOptions?: LlmCompletionOptions;
  readonly planner?: TaskPlanner;
  /** Injected monotonic clock in milliseconds, for deterministic durations. */
  readonly now?: () => number;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly maxSteps?: number;
  readonly retryBaseDelayMs?: number;
  /** Fixed timestamp for the record's date fields. */
  readonly startedAt?: Date;
};

/**
 * Default planner.
 *
 * Reads an explicit plan from `AgentTask.input`, accepting either
 * `{ toolCalls: [{ tool, input }] }` or a single `{ tool, input }`. There is no
 * hidden model-driven planning step: an agent that decides its own tool sequence
 * would make execution non-reproducible, and the whole platform is built the
 * other way round.
 */
export const defaultPlanner: TaskPlanner = (agent, task) => {
  const input = task.input as
    | { toolCalls?: readonly PlannedToolCall[]; tool?: string; input?: unknown }
    | null
    | undefined;

  if (input && Array.isArray(input.toolCalls) && input.toolCalls.length > 0) {
    return input.toolCalls;
  }
  if (input && typeof input.tool === "string") {
    return [{ tool: input.tool, input: input.input }];
  }
  throw new AppError(
    "AGENT_TASK_NOT_PLANNABLE",
    `Task "${task.name}" carries no toolCalls and no tool to route to`,
    { agentId: agent.id, taskId: task.id },
  );
};

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

function errorMessageOf(error: unknown): string {
  if (error instanceof ToolInputError) {
    return `${error.message}: ${error.issues.map((issue) => `${issue.path || "(root)"} ${issue.message}`).join("; ")}`;
  }
  return error instanceof Error ? error.message : String(error);
}

/**
 * Executes one task.
 *
 * Always resolves: a failure is reported as `status: "FAILED"` with
 * `errorMessage` set, because the caller needs the logs and the partial results
 * more than it needs an exception.
 */
export async function executeTask(
  agent: AgentLike,
  task: AgentTaskLike,
  deps: ExecuteTaskDeps,
): Promise<AgentExecutionRecord> {
  const now = deps.now ?? (() => Date.now());
  const sleep = deps.sleep ?? defaultSleep;
  const maxSteps = deps.maxSteps ?? DEFAULT_MAX_STEPS;
  const maxRetries = task.maxRetries ?? DEFAULT_MAX_RETRIES;
  const retryBaseDelayMs = deps.retryBaseDelayMs ?? DEFAULT_RETRY_BASE_DELAY_MS;
  const startClock = now();
  const startedAt = deps.startedAt ?? new Date(0);

  const logs: AgentExecutionLogEntry[] = [];
  const steps: ToolStepResult[] = [];
  const results: Record<string, unknown> = {};
  let tokensUsed = 0;
  let costUsd = 0;
  let errorMessage: string | null = null;
  let status: AgentStatus = "COMPLETED";
  let retryCount = task.retryCount ?? 0;
  let summary: string | null = null;

  const log = (
    level: LogLevel,
    message: string,
    extra: Partial<Omit<AgentExecutionLogEntry, "level" | "message" | "elapsedMs">> = {},
  ): void => {
    logs.push({
      step: extra.step ?? steps.length,
      level,
      message,
      elapsedMs: now() - startClock,
      ...extra,
    });
  };

  const finish = (): AgentExecutionRecord => {
    const duration = now() - startClock;
    return {
      agentId: agent.id,
      taskId: task.id,
      status,
      input: task.input ?? null,
      output: { steps, results, summary },
      logs,
      tokensUsed,
      costUsd,
      duration,
      errorMessage,
      startedAt,
      completedAt: new Date(startedAt.getTime() + duration),
      retryCount,
    };
  };

  if (agent.isActive === false) {
    status = "CANCELLED";
    errorMessage = `Agent "${agent.name}" is not active`;
    log("error", errorMessage);
    return finish();
  }

  // --- plan -------------------------------------------------------------
  let plan: readonly PlannedToolCall[];
  try {
    plan = (deps.planner ?? defaultPlanner)(agent, task);
  } catch (error) {
    status = "FAILED";
    errorMessage = errorMessageOf(error);
    log("error", `Planning failed: ${errorMessage}`);
    return finish();
  }

  if (plan.length > maxSteps) {
    status = "FAILED";
    errorMessage = `Plan has ${plan.length} step(s), above the maximum of ${maxSteps}`;
    log("error", errorMessage);
    return finish();
  }
  log("info", `Planned ${plan.length} tool call(s) for task "${task.name}"`);

  // --- run --------------------------------------------------------------
  for (const [index, planned] of plan.entries()) {
    const step = index + 1;

    if (task.timeout != null && now() - startClock > task.timeout) {
      status = "FAILED";
      errorMessage = `Task exceeded its ${task.timeout} ms budget before step ${step}`;
      log("error", errorMessage, { step });
      return finish();
    }

    let attempt = 0;
    let succeeded = false;
    let lastError: string | null = null;
    const stepStart = now();

    while (attempt <= maxRetries) {
      attempt += 1;
      try {
        const call = await deps.registry.call(planned.tool, planned.input, {
          organizationId: undefined,
        });
        results[planned.label ?? planned.tool] = call.output;
        steps.push({
          step,
          tool: planned.tool,
          label: planned.label ?? null,
          status: "succeeded",
          attempts: attempt,
          output: call.output,
          errorMessage: null,
          durationMs: now() - stepStart,
        });
        log("info", `Tool "${planned.tool}" succeeded`, {
          step,
          tool: planned.tool,
          attempt,
          durationMs: now() - stepStart,
        });
        succeeded = true;
        break;
      } catch (error) {
        lastError = errorMessageOf(error);
        const terminal = error instanceof ToolInputError;
        log(terminal ? "error" : "warn", `Tool "${planned.tool}" failed: ${lastError}`, {
          step,
          tool: planned.tool,
          attempt,
        });
        if (terminal) break;
        // Another attempt follows only while `attempt` is still within budget.
        if (attempt <= maxRetries) {
          retryCount += 1;
          await sleep(retryBaseDelayMs * 2 ** (attempt - 1));
        }
      }
    }

    if (!succeeded) {
      steps.push({
        step,
        tool: planned.tool,
        label: planned.label ?? null,
        status: "failed",
        attempts: attempt,
        output: null,
        errorMessage: lastError,
        durationMs: now() - stepStart,
      });
      status = "FAILED";
      errorMessage = `Step ${step} (${planned.tool}) failed after ${attempt} attempt(s): ${lastError}`;
      log("error", errorMessage, { step, tool: planned.tool });
      return finish();
    }
  }

  // --- narrative --------------------------------------------------------
  if (deps.llm && steps.length > 0) {
    const prompt = [
      `Summarise the outcome of agent task "${task.name}".`,
      ...steps.map(
        (step) => `- ${step.tool}: ${JSON.stringify(step.output).slice(0, 400)}`,
      ),
    ].join("\n");
    try {
      const completion = await deps.llm.complete(prompt, {
        system:
          "You are an agent supervisor. Summarise the tool results factually in two sentences. Use only the figures given.",
        temperature: 0,
        ...deps.llmOptions,
      });
      summary = completion.text;
      tokensUsed += completion.tokensUsed;
      costUsd += completion.costUsd;
      log("info", `Narrative summary generated by ${completion.provider}`);
    } catch (error) {
      // A failed summary does not fail the task: the results are already in hand.
      log("warn", `Narrative summary failed: ${errorMessageOf(error)}`);
    }
  }

  log("info", `Task "${task.name}" completed with ${steps.length} step(s)`);
  return finish();
}
