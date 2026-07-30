/**
 * Agent repository: agents, tasks, executions, the tool catalogue and MCP servers.
 *
 * The tool catalogue is read from the *live* registry rather than from a table, so
 * it can never claim a tool the runtime does not actually expose.
 */

import { createDefaultRegistry } from "@/lib/ai/agents/tool-registry";
import { describeLlmMode, getLlmMode, isLlmConfigured } from "@/lib/ai/llm/factory";
import { prisma } from "@/lib/prisma";

import { withDb } from "../db";
import {
  DEMO_AGENTS,
  DEMO_AGENT_TASKS,
  DEMO_AGENT_TOOLS,
  DEMO_MCP_CONNECTIONS,
  DEMO_MCP_SERVERS,
  type DemoAgent,
  type DemoAgentTask,
  type DemoMcpServer,
} from "../demo";

export async function listAgents(organizationId: string): Promise<readonly DemoAgent[]> {
  return withDb<readonly DemoAgent[]>(
    async () => {
      const rows = await prisma.agent.findMany({
        where: { organizationId },
        orderBy: { name: "asc" },
      });
      return rows.map((row) => ({
        id: row.id,
        organizationId: row.organizationId,
        name: row.name,
        type: row.type,
        description: row.description ?? "",
        version: row.version ?? "",
        capabilities: row.capabilities,
        status: row.status,
        isActive: row.isActive,
        lastActiveAt: row.lastActiveAt ?? row.updatedAt,
        maxSteps: 10,
      }));
    },
    () => DEMO_AGENTS.filter((agent) => agent.organizationId === organizationId),
  );
}

export async function listAgentTasks(
  organizationId: string,
): Promise<readonly DemoAgentTask[]> {
  return withDb<readonly DemoAgentTask[]>(
    async () => {
      const rows = await prisma.agentTask.findMany({
        where: { agent: { organizationId } },
        orderBy: [{ priority: "desc" }, { scheduledAt: "asc" }],
      });
      return rows.map((row) => ({
        id: row.id,
        agentId: row.agentId,
        name: row.name,
        description: row.description ?? "",
        type: row.type ?? "",
        priority: row.priority,
        status: row.status,
        input: (row.input as unknown as DemoAgentTask["input"]) ?? { toolCalls: [] },
        scheduledAt: row.scheduledAt ?? row.createdAt,
        timeout: row.timeout ?? 60_000,
        maxRetries: row.maxRetries,
      }));
    },
    () => {
      const agentIds = new Set(
        DEMO_AGENTS.filter((agent) => agent.organizationId === organizationId).map(
          (agent) => agent.id,
        ),
      );
      return DEMO_AGENT_TASKS.filter((task) => agentIds.has(task.agentId));
    },
  );
}

export type AgentExecutionRow = {
  readonly id: string;
  readonly agentId: string;
  readonly taskId: string | null;
  readonly status: string;
  readonly tokensUsed: number | null;
  readonly costUsd: number | null;
  readonly duration: number | null;
  readonly errorMessage: string | null;
  readonly startedAt: Date;
  readonly completedAt: Date | null;
};

export async function listAgentExecutions(
  organizationId: string,
  options: { readonly limit?: number } = {},
): Promise<readonly AgentExecutionRow[]> {
  return withDb<readonly AgentExecutionRow[]>(
    async () => {
      const rows = await prisma.agentExecution.findMany({
        where: { agent: { organizationId } },
        orderBy: { startedAt: "desc" },
        take: options.limit ?? 50,
      });
      return rows.map((row) => ({
        id: row.id,
        agentId: row.agentId,
        taskId: row.taskId,
        status: row.status,
        tokensUsed: row.tokensUsed,
        costUsd: row.costUsd,
        duration: row.duration,
        errorMessage: row.errorMessage,
        startedAt: row.startedAt,
        completedAt: row.completedAt,
      }));
    },
    () => [],
  );
}

/** Tool catalogue read from the live registry. */
export function listAgentTools() {
  return createDefaultRegistry().list();
}

/** Per-agent tool assignments, for the agent detail panel. */
export async function listAgentToolAssignments(organizationId: string) {
  return withDb(
    async () => {
      const rows = await prisma.agentTool.findMany({
        where: { agent: { organizationId } },
        orderBy: { name: "asc" },
      });
      return rows.map((row) => ({
        id: row.id,
        agentId: row.agentId,
        name: row.name,
        description: row.description ?? "",
        type: row.type as "builtin" | "mcp" | "http",
        isActive: row.isActive,
      }));
    },
    () => DEMO_AGENT_TOOLS,
  );
}

export async function listMcpServers(): Promise<readonly DemoMcpServer[]> {
  return withDb<readonly DemoMcpServer[]>(
    async () => {
      const rows = await prisma.mCPServer.findMany({ orderBy: { name: "asc" } });
      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        url: row.url,
        description: row.description ?? "",
        version: row.version ?? "",
        protocol: row.protocol,
        status: row.status,
        healthCheckUrl: row.healthCheckUrl ?? "",
        isActive: row.isActive,
        lastHealthCheck: row.lastHealthCheck ?? row.updatedAt,
      }));
    },
    () => DEMO_MCP_SERVERS,
  );
}

export async function listMcpConnections(organizationId: string) {
  return withDb(
    async () => {
      const rows = await prisma.mCPConnection.findMany({
        where: { agent: { organizationId } },
        orderBy: { createdAt: "asc" },
      });
      return rows.map((row) => ({
        id: row.id,
        agentId: row.agentId,
        serverId: row.serverId,
        status: row.status as "connected" | "disconnected" | "error",
        lastPingAt: row.lastPingAt ?? row.updatedAt,
        errorCount: row.errorCount,
      }));
    },
    () => DEMO_MCP_CONNECTIONS,
  );
}

/** LLM configuration status, for the agent page badge. */
export function getLlmStatus() {
  return {
    configured: isLlmConfigured(),
    mode: getLlmMode(),
    description: describeLlmMode(),
  };
}
