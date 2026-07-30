"use server";

/**
 * Agent actions.
 *
 * The runtime is deterministic and bounded: it takes an explicit tool plan, a step
 * cap and injected clock/sleep functions, and returns an `AgentExecution`-shaped
 * record. This file supplies the real clock and the real registry and persists the
 * record — including on failure, because a failed agent run is exactly the run an
 * operator needs to read the logs of.
 */

import { NotFoundError } from "@/lib/core/errors";
import { getLlmClient } from "@/lib/ai/llm/factory";
import { executeTask } from "@/lib/ai/agents/runtime";
import { createDefaultRegistry } from "@/lib/ai/agents/tool-registry";
import { prisma } from "@/lib/prisma";
import { encryptField } from "@/lib/security/field-crypto";
import {
  agentInputSchema,
  agentTaskInputSchema,
  dataSourceInputSchema,
  executeAgentTaskInputSchema,
} from "@/lib/validation";

import { auditEntry, runAction } from "./runtime";
import type { ActionState } from "./types";

const PATHS = ["/ai-agents", "/mcp-integration", "/dashboard"] as const;

export type ExecuteAgentTaskResult = {
  readonly executionId: string;
  readonly taskId: string;
  readonly status: string;
  readonly stepCount: number;
  readonly failedSteps: number;
  readonly durationMs: number;
  readonly tokensUsed: number;
  readonly costUsd: number;
  readonly retryCount: number;
  readonly errorMessage: string | null;
  readonly summary: string | null;
};

/**
 * Executes one agent task and persists the execution.
 *
 * A task id may be supplied (re-run an existing task) or a plan (create the task
 * and run it). Either way the plan actually executed is the one stored on the
 * task, so the execution record and the task never disagree.
 */
export async function executeAgentTaskAction(
  rawInput: unknown,
): Promise<ActionState<ExecuteAgentTaskResult>> {
  return runAction(
    {
      name: "executeAgentTask",
      resource: "agent",
      action: "execute",
      schema: executeAgentTaskInputSchema,
      revalidate: [...PATHS],
      handler: async ({ session, input, organizationId }) => {
        const agent = await prisma.agent.findUnique({
          where: { id: input.agentId },
          select: {
            id: true,
            organizationId: true,
            name: true,
            type: true,
            capabilities: true,
            config: true,
            isActive: true,
          },
        });
        if (!agent || agent.organizationId !== organizationId) {
          throw new NotFoundError(`Agent ${input.agentId} was not found`);
        }

        let task: {
          id: string;
          name: string;
          description: string | null;
          type: string | null;
          input: unknown;
          timeout: number | null;
          maxRetries: number;
          retryCount: number;
        };
        if (input.taskId) {
          const existing = await prisma.agentTask.findUnique({
            where: { id: input.taskId },
            select: {
              id: true,
              agentId: true,
              name: true,
              description: true,
              type: true,
              input: true,
              timeout: true,
              maxRetries: true,
              retryCount: true,
            },
          });
          if (!existing || existing.agentId !== agent.id) {
            throw new NotFoundError(`Task ${input.taskId} was not found for this agent`);
          }
          task = existing;
        } else {
          if (!input.plan) {
            throw new NotFoundError("Supply either an existing taskId or a plan");
          }
          const created = await prisma.agentTask.create({
            data: {
              agentId: agent.id,
              name: `${agent.name} ad-hoc task`,
              type: agent.type,
              input: input.plan as never,
              status: "RUNNING",
            },
            select: {
              id: true,
              name: true,
              description: true,
              type: true,
              input: true,
              timeout: true,
              maxRetries: true,
              retryCount: true,
            },
          });
          task = created;
        }

        const startedAt = new Date();
        const record = await executeTask(
          {
            id: agent.id,
            name: agent.name,
            type: agent.type,
            capabilities: agent.capabilities,
            config: agent.config as Readonly<Record<string, unknown>> | null,
            isActive: agent.isActive,
          },
          {
            id: task.id,
            name: task.name,
            description: task.description,
            type: task.type,
            input: task.input,
            timeout: task.timeout,
            maxRetries: task.maxRetries,
            retryCount: task.retryCount,
          },
          {
            registry: createDefaultRegistry(),
            llm: getLlmClient(),
            startedAt,
            ...(input.maxSteps !== undefined ? { maxSteps: input.maxSteps } : {}),
          },
        );

        // Persisted even when the run failed: the logs are the point.
        const persisted = await prisma.$transaction(async (tx) => {
          const execution = await tx.agentExecution.create({
            data: {
              agentId: record.agentId,
              taskId: record.taskId,
              status: record.status,
              input: record.input as never,
              output: record.output as never,
              logs: record.logs as never,
              tokensUsed: record.tokensUsed,
              costUsd: record.costUsd,
              duration: record.duration,
              errorMessage: record.errorMessage,
              startedAt: record.startedAt,
              completedAt: record.completedAt,
            },
            select: { id: true },
          });
          await tx.agentTask.update({
            where: { id: task.id },
            data: {
              status: record.status,
              output: record.output as never,
              errorMessage: record.errorMessage,
              startedAt: record.startedAt,
              completedAt: record.completedAt,
              retryCount: record.retryCount,
            },
          });
          await tx.agent.update({
            where: { id: agent.id },
            data: { status: "IDLE", lastActiveAt: record.completedAt },
          });
          return execution.id;
        });

        const failedSteps = record.output.steps.filter(
          (step) => step.status === "failed",
        ).length;

        return {
          data: {
            executionId: persisted,
            taskId: task.id,
            status: record.status,
            stepCount: record.output.steps.length,
            failedSteps,
            durationMs: record.duration,
            tokensUsed: record.tokensUsed,
            costUsd: record.costUsd,
            retryCount: record.retryCount,
            errorMessage: record.errorMessage,
            summary: record.output.summary,
          },
          message:
            record.status === "COMPLETED"
              ? `Agent "${agent.name}" completed ${record.output.steps.length} step(s) in ${record.duration} ms.`
              : `Agent "${agent.name}" ended as ${record.status}: ${record.errorMessage ?? "no error message"}.`,
          messageKey: "action.success.executeAgentTask",
          audit: [
            auditEntry(session, {
              entityType: "AgentExecution",
              entityId: persisted,
              action: "create",
              after: {
                agentId: agent.id,
                taskId: task.id,
                status: record.status,
                steps: record.output.steps.length,
                failedSteps,
                durationMs: record.duration,
                tokensUsed: record.tokensUsed,
              },
              reason: record.errorMessage ?? null,
            }),
          ],
        };
      },
    },
    rawInput,
  );
}

/** Registers an agent. */
export async function createAgentAction(
  rawInput: unknown,
): Promise<ActionState<{ readonly id: string }>> {
  return runAction(
    {
      name: "createAgent",
      resource: "agent",
      action: "create",
      schema: agentInputSchema,
      revalidate: [...PATHS],
      handler: async ({ session, input, organizationId }) => {
        const created = await prisma.agent.create({
          data: {
            organizationId,
            name: input.name,
            type: input.type,
            description: input.description ?? null,
            version: input.version ?? null,
            capabilities: [...input.capabilities],
            config: { maxSteps: input.maxSteps } as never,
            status: input.status,
            isActive: input.isActive,
          },
          select: { id: true },
        });
        return {
          data: { id: created.id },
          message: `Registered agent "${input.name}".`,
          messageKey: "action.success.createAgent",
          audit: [
            auditEntry(session, {
              entityType: "Agent",
              entityId: created.id,
              action: "create",
              after: {
                name: input.name,
                type: input.type,
                capabilities: input.capabilities,
                isActive: input.isActive,
              },
            }),
          ],
        };
      },
    },
    rawInput,
  );
}

/** Queues a task against an agent without running it. */
export async function createAgentTaskAction(
  rawInput: unknown,
): Promise<ActionState<{ readonly id: string }>> {
  return runAction(
    {
      name: "createAgentTask",
      resource: "agent",
      action: "create",
      schema: agentTaskInputSchema,
      revalidate: [...PATHS],
      handler: async ({ session, input, organizationId }) => {
        const agent = await prisma.agent.findUnique({
          where: { id: input.agentId },
          select: { id: true, organizationId: true },
        });
        if (!agent || agent.organizationId !== organizationId) {
          throw new NotFoundError(`Agent ${input.agentId} was not found`);
        }
        const created = await prisma.agentTask.create({
          data: {
            agentId: agent.id,
            name: input.name,
            description: input.description ?? null,
            type: input.type ?? null,
            priority: input.priority,
            status: input.status,
            input: input.input as never,
            scheduledAt: input.scheduledAt ?? null,
            timeout: input.timeout,
            maxRetries: input.maxRetries,
          },
          select: { id: true },
        });
        return {
          data: { id: created.id },
          message: `Queued task "${input.name}".`,
          messageKey: "action.success.createAgentTask",
          audit: [
            auditEntry(session, {
              entityType: "AgentTask",
              entityId: created.id,
              action: "create",
              after: {
                name: input.name,
                agentId: agent.id,
                priority: input.priority,
                status: input.status,
              },
            }),
          ],
        };
      },
    },
    rawInput,
  );
}

/**
 * Registers an external data source.
 *
 * `credentials` are encrypted with AES-256-GCM before they are stored (decision
 * 13) and redacted from the audit trail by `auditEntry`'s default redaction list.
 */
export async function createDataSourceAction(
  rawInput: unknown,
): Promise<ActionState<{ readonly id: string }>> {
  return runAction(
    {
      name: "createDataSource",
      resource: "data_source",
      action: "create",
      schema: dataSourceInputSchema,
      revalidate: ["/mcp-integration", "/settings"],
      handler: async ({ session, input, organizationId }) => {
        // `DataSource` is a shared reference table with no `organizationId`
        // column, so the tenant is enforced by the permission check above rather
        // than by a foreign key. Recorded on the audit entry for traceability.
        const created = await prisma.dataSource.create({
          data: {
            name: input.name,
            type: input.type,
            description: input.description ?? null,
            connectionString: input.connectionString ?? null,
            // The ciphertext is stored as a JSON string; the column is `Json?`,
            // and a JSON string is the smallest shape that round-trips cleanly.
            ...(input.credentials == null
              ? {}
              : { credentials: encryptField(JSON.stringify(input.credentials)) }),
            isActive: input.isActive,
            syncFrequency: input.syncFrequency ?? null,
          },
          select: { id: true },
        });
        return {
          data: { id: created.id },
          message: `Registered data source "${input.name}".`,
          messageKey: "action.success.createDataSource",
          audit: [
            auditEntry(session, {
              entityType: "DataSource",
              entityId: created.id,
              action: "create",
              after: {
                name: input.name,
                type: input.type,
                organizationId,
                connectionString: input.connectionString ?? null,
                isActive: input.isActive,
                // Redacted by `auditEntry`; listed so the diff records that the
                // field was set at all.
                credentials: input.credentials == null ? null : "set",
              },
            }),
          ],
        };
      },
    },
    rawInput,
  );
}
