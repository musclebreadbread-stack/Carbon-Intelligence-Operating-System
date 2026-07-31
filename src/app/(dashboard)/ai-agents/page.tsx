/**
 * AI agents module.
 *
 * Agent registry, task queue, execution log, the tool catalogue read from the
 * *live* registry (so it cannot claim a tool the runtime does not expose), MCP
 * server connections, and the conversation panel's LLM-mode state.
 */

import { connection } from "next/server";
import { Bot, Plug, Sparkles, Wrench } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/shared/empty-state";
import { KpiCard } from "@/components/shared/kpi-card";
import { PageHeader } from "@/components/shared/page-header";
import { ActionForm } from "@/components/shared/form/action-form";
import { createAgentAction, executeAgentTaskAction } from "@/lib/actions/agent";
import { activeOrganizationId } from "@/lib/auth/active-organization";
import { AGENT_STATUSES } from "@/lib/core/enums";
import {
  getLlmStatus,
  listAgentExecutions,
  listAgentTasks,
  listAgentToolAssignments,
  listAgents,
  listAgentTools,
  listMcpConnections,
  listMcpServers,
} from "@/lib/data/repositories/agent";
import {
  formatCurrency,
  formatDateTime,
  formatNumber,
  humaniseEnum,
} from "@/lib/format";
import { getDictionary } from "@/lib/i18n/server";

import { TaskRunner } from "./_components/task-runner";

const CONNECTION_TONE: Readonly<Record<string, string>> = {
  connected: "border-emerald-500/50 text-emerald-700 dark:text-emerald-300",
  disconnected: "border-slate-400/50 text-slate-700 dark:text-slate-300",
  error: "border-red-500/50 text-red-700 dark:text-red-300",
};

export default async function AiAgentsPage() {
  await connection();
  const dict = await getDictionary();

  const organizationId = await activeOrganizationId();

  const [agents, tasks, executions, assignments, servers, connections] = await Promise.all([
    listAgents(organizationId),
    listAgentTasks(organizationId),
    listAgentExecutions(organizationId, { limit: 25 }),
    listAgentToolAssignments(organizationId),
    listMcpServers(),
    listMcpConnections(organizationId),
  ]);

  const tools = listAgentTools();
  const llm = getLlmStatus();

  const agentNames = new Map(agents.map((agent) => [agent.id, agent.name]));
  const serverNames = new Map(servers.map((server) => [server.id, server.name]));
  const assignmentsByAgent = new Map<string, typeof assignments>();
  for (const assignment of assignments) {
    const bucket = assignmentsByAgent.get(assignment.agentId);
    if (bucket) assignmentsByAgent.set(assignment.agentId, [...bucket, assignment]);
    else assignmentsByAgent.set(assignment.agentId, [assignment]);
  }

  const totalTokens = executions.reduce(
    (total, execution) => total + (execution.tokensUsed ?? 0),
    0,
  );
  const totalCost = executions.reduce((total, execution) => total + (execution.costUsd ?? 0), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title={dict["agents.title"]}
        description="Agent registry, task queue, bounded tool-call runtime, tool catalogue and MCP server connections."
        meta={[
          { label: "Agents", value: formatNumber(agents.length) },
          { label: "Tools", value: formatNumber(tools.length) },
          { label: "LLM", value: llm.mode },
        ]}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Registered agents"
          value={formatNumber(agents.length)}
          icon={Bot}
          description={`${agents.filter((agent) => agent.isActive).length} active`}
          source="listAgents()"
        />
        <KpiCard
          title="Queued tasks"
          value={formatNumber(tasks.length)}
          icon={Wrench}
          description={`${tasks.filter((task) => task.status === "IDLE").length} idle`}
          source="listAgentTasks()"
        />
        <KpiCard
          title="Built-in tools"
          value={formatNumber(tools.length)}
          icon={Wrench}
          description="read from the live registry, not a table"
          source="createDefaultRegistry().list()"
        />
        <KpiCard
          title="MCP servers"
          value={formatNumber(servers.length)}
          icon={Plug}
          description={`${connections.filter((row) => row.status === "connected").length} connected`}
          source="listMcpServers()"
        />
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="size-4 text-muted-foreground" />
                Conversation and narrative capability
              </CardTitle>
              <CardDescription>{llm.description.label}</CardDescription>
            </div>
            <Badge variant={llm.configured ? "secondary" : "outline"}>
              {llm.description.mode} · {llm.description.model}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-1.5 text-xs text-muted-foreground">
          <p>{llm.description.labelKo}</p>
          <p>
            {llm.configured
              ? "A real OPENAI_API_KEY is configured, so agent conversations reach the model and the token and cost figures below are real spend."
              : "No OPENAI_API_KEY is configured, so the deterministic client answers every prompt from templates. Tool calls, their inputs and their numeric results are unaffected — only the prose is."}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Agents</CardTitle>
          <CardDescription>
            Capabilities are the tool names an agent is allowed to call; the runtime rejects
            anything outside the list.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {agents.length === 0 ? (
            <EmptyState title="No agents registered" />
          ) : (
            agents.map((agent) => (
              <div key={agent.id} className="rounded-lg border p-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{agent.name}</span>
                  <Badge variant="secondary">{humaniseEnum(agent.type)}</Badge>
                  <Badge variant={agent.isActive ? "outline" : "destructive"}>
                    {agent.status}
                  </Badge>
                  <Badge variant="outline">v{agent.version}</Badge>
                  <span className="text-xs text-muted-foreground">
                    max {agent.maxSteps} steps · last active{" "}
                    {formatDateTime(agent.lastActiveAt)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{agent.description}</p>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {agent.capabilities.map((capability) => (
                    <Badge key={capability} variant="outline" className="font-mono">
                      {capability}
                    </Badge>
                  ))}
                </div>
                {(assignmentsByAgent.get(agent.id) ?? []).length > 0 && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Assigned tools:{" "}
                    {(assignmentsByAgent.get(agent.id) ?? [])
                      .map((assignment) => `${assignment.name} (${assignment.type})`)
                      .join(", ")}
                  </p>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Task queue and execution</CardTitle>
          <CardDescription>
            Tasks carry their planned tool calls, a timeout and a retry budget. Running one
            persists an `AgentExecution` with its log, tokens and duration.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="queue">
            <TabsList variant="line">
              <TabsTrigger value="queue">Queue ({tasks.length})</TabsTrigger>
              <TabsTrigger value="run">Run a task</TabsTrigger>
              <TabsTrigger value="log">Execution log ({executions.length})</TabsTrigger>
              <TabsTrigger value="new">New agent</TabsTrigger>
            </TabsList>

            <TabsContent value="queue" className="space-y-2 pt-3">
              {tasks.length === 0 ? (
                <EmptyState title="No queued tasks" />
              ) : (
                tasks.map((task) => (
                  <div key={task.id} className="rounded-lg border p-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{task.name}</span>
                      <Badge variant="secondary">{task.status}</Badge>
                      <Badge variant="outline">priority {task.priority}</Badge>
                      <Badge variant="outline">
                        {agentNames.get(task.agentId) ?? task.agentId}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        scheduled {formatDateTime(task.scheduledAt)} · timeout{" "}
                        {formatNumber(task.timeout)} ms · up to {task.maxRetries} retries
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{task.description}</p>
                    <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                      plan: {task.input.toolCalls.map((call) => call.tool).join(" → ")}
                    </p>
                  </div>
                ))
              )}
            </TabsContent>

            <TabsContent value="run" className="pt-3">
              <TaskRunner
                organizationId={organizationId}
                agents={agents.map((agent) => ({ value: agent.id, label: agent.name }))}
                tasks={tasks.map((task) => ({ value: task.id, label: task.name }))}
                executeTask={executeAgentTaskAction}
              />
            </TabsContent>

            <TabsContent value="log" className="space-y-2 pt-3">
              {executions.length === 0 ? (
                <div className="space-y-2">
                  <EmptyState
                    title="No executions recorded"
                    description="An AgentExecution row is written per run, so this log stays empty until a database is configured."
                  />
                  <p className="text-xs text-muted-foreground">
                    Lifetime totals across the recorded executions:{" "}
                    {formatNumber(totalTokens)} tokens, {formatCurrency(totalCost, "USD", 4)}.
                  </p>
                </div>
              ) : (
                executions.map((execution) => (
                  <div
                    key={execution.id}
                    className="flex flex-wrap items-center gap-2 rounded-md border p-2.5 text-sm"
                  >
                    <Badge
                      variant={execution.status === "completed" ? "secondary" : "destructive"}
                    >
                      {execution.status}
                    </Badge>
                    <span className="font-medium">
                      {agentNames.get(execution.agentId) ?? execution.agentId}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatDateTime(execution.startedAt)} →{" "}
                      {formatDateTime(execution.completedAt)}
                    </span>
                    <span className="ml-auto font-mono text-xs">
                      {formatNumber(execution.duration ?? 0)} ms ·{" "}
                      {formatNumber(execution.tokensUsed ?? 0)} tokens ·{" "}
                      {formatCurrency(execution.costUsd ?? 0, "USD", 4)}
                    </span>
                    {execution.errorMessage && (
                      <p className="w-full text-xs text-destructive">
                        {execution.errorMessage}
                      </p>
                    )}
                  </div>
                ))
              )}
            </TabsContent>

            <TabsContent value="new" className="pt-3">
              <ActionForm
                action={createAgentAction}
                hidden={{ organizationId }}
                submitLabel="Create agent"
                fields={[
                  { name: "name", label: "Name", required: true },
                  { name: "type", label: "Type", required: true, placeholder: "inventory" },
                  {
                    name: "status",
                    label: "Status",
                    type: "select",
                    options: AGENT_STATUSES.map((status) => ({
                      value: status,
                      label: status,
                    })),
                    defaultValue: "IDLE",
                  },
                  { name: "version", label: "Version", placeholder: "1.0.0" },
                  { name: "maxSteps", label: "Max steps", type: "number", defaultValue: 10 },
                  {
                    name: "description",
                    label: "Description",
                    type: "textarea",
                    wide: true,
                  },
                ]}
              />
              <p className="mt-2 text-xs text-muted-foreground">
                Capabilities are assigned after creation; the form keeps the initial payload to
                what `agentInputSchema` requires.
              </p>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Tool catalogue</CardTitle>
            <CardDescription>
              Read from `createDefaultRegistry()`, so every tool listed is one the runtime can
              actually call, with its zod-derived parameter list.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {tools.map((tool) => (
              <div key={tool.name} className="rounded-lg border p-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-medium">{tool.name}</span>
                  <Badge variant="secondary">{tool.type}</Badge>
                  <Badge variant={tool.isActive ? "outline" : "destructive"}>
                    {tool.isActive ? "active" : "inactive"}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{tool.description}</p>
                <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                  parameters: {tool.schema.parameters.join(", ") || "none"}
                  {tool.schema.required.length > 0
                    ? ` · required: ${tool.schema.required.join(", ")}`
                    : ""}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>MCP servers</CardTitle>
            <CardDescription>
              Model Context Protocol endpoints and their last health check.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {servers.map((server) => {
              const serverConnections = connections.filter(
                (row) => row.serverId === server.id,
              );
              return (
                <div key={server.id} className="rounded-lg border p-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{server.name}</span>
                    <Badge variant="secondary">{server.protocol}</Badge>
                    <Badge variant={server.isActive ? "outline" : "destructive"}>
                      {server.status}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      checked {formatDateTime(server.lastHealthCheck)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{server.description}</p>
                  <p className="mt-1 font-mono text-[11px] break-all text-muted-foreground">
                    {server.url}
                  </p>
                  {serverConnections.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {serverConnections.map((row) => (
                        <Badge
                          key={row.id}
                          variant="outline"
                          className={CONNECTION_TONE[row.status] ?? ""}
                        >
                          {agentNames.get(row.agentId) ?? row.agentId}: {row.status}
                          {row.errorCount > 0 ? ` (${row.errorCount} errors)` : ""}
                        </Badge>
                      ))}
                    </div>
                  )}
                  {serverConnections.length === 0 && (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      No agent is connected to {serverNames.get(server.id) ?? server.name}.
                    </p>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
