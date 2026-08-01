/**
 * Validation schemas for the AI subsystem — analyses, agents, tasks, tools, MCP
 * servers and data sources.
 *
 * The task-input schema mirrors the explicit planner contract in
 * `ai/agents/runtime.ts`: an `AgentTask.input` carries either a single
 * `{ tool, input }` or an ordered `{ toolCalls: [...] }` list. Validating it here
 * means the runtime never has to guess at a malformed plan.
 */

import { z } from "zod";

import { AI_MODEL_TYPES } from "@/lib/core/enums";

import {
  agentStatusSchema,
  aiModelTypeSchema,
  dataSourceTypeSchema,
  dateSchema,
  descriptionSchema,
  fractionSchema,
  idSchema,
  nameSchema,
  nonNegativeNumber,
  urlSchema,
  yearSchema,
} from "./common";

/** Analysis kinds the item-24 engines implement. */
export const AI_ANALYSIS_TYPES = [
  "ANOMALY_DETECTION",
  "FORECAST",
  "GAP_ANALYSIS",
  "RECOMMENDATION",
  "CONFIDENCE_SCORING",
] as const;
export type AiAnalysisType = (typeof AI_ANALYSIS_TYPES)[number];
export const aiAnalysisTypeSchema = z.enum(AI_ANALYSIS_TYPES);

/** `AIModel`. */
export const aiModelInputSchema = z.object({
  organizationId: idSchema,
  name: nameSchema,
  type: aiModelTypeSchema,
  version: z.string().trim().min(1).max(40),
  description: descriptionSchema.nullish(),
  provider: z.string().trim().max(80).nullish(),
  endpoint: urlSchema.nullish(),
  accuracy: fractionSchema.nullish(),
  isActive: z.boolean().default(true),
  trainedAt: dateSchema.nullish(),
});
export type AiModelInput = z.infer<typeof aiModelInputSchema>;

/** Request accepted by `runAnalysisAction`. */
export const runAnalysisInputSchema = z
  .object({
    organizationId: idSchema,
    name: nameSchema,
    type: aiAnalysisTypeSchema,
    reportingYear: yearSchema.optional(),
    modelId: idSchema.nullish(),
    /** Anomaly detection. */
    anomalyMethod: z.enum(["zscore", "iqr", "seasonal"]).default("zscore"),
    anomalyThreshold: z.number().finite().positive().max(10).default(3),
    /** Forecasting. */
    horizon: z.number().int().min(1).max(120).default(12),
    forecastMethod: z.enum(["linear", "holt"]).default("linear"),
    /** Whether to build the AIExplanation graph for the result. */
    explain: z.boolean().default(true),
  })
  .superRefine((value, ctx) => {
    if (value.type === "FORECAST" && value.horizon < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["horizon"],
        message: "A forecast needs a horizon of at least one period",
      });
    }
  });
export type RunAnalysisInput = z.infer<typeof runAnalysisInputSchema>;

/** `Agent`. */
export const agentInputSchema = z.object({
  organizationId: idSchema,
  name: nameSchema,
  type: z.string().trim().min(1).max(60),
  description: descriptionSchema.nullish(),
  version: z.string().trim().max(40).nullish(),
  capabilities: z.array(z.string().trim().min(1).max(60)).default([]),
  status: agentStatusSchema.default("IDLE"),
  isActive: z.boolean().default(true),
  maxSteps: z.number().int().min(1).max(50).default(10),
});
export type AgentInput = z.infer<typeof agentInputSchema>;

/** One planned tool call inside `AgentTask.input`. */
export const plannedToolCallSchema = z.object({
  tool: z.string().trim().min(1).max(80),
  input: z.unknown().optional(),
});
export type PlannedToolCallInput = z.infer<typeof plannedToolCallSchema>;

/**
 * `AgentTask.input`. Either form is accepted; the runtime's default planner reads
 * `toolCalls` first and falls back to the single-call shape.
 */
export const agentTaskPlanSchema = z
  .object({
    toolCalls: z.array(plannedToolCallSchema).min(1).optional(),
    tool: z.string().trim().min(1).max(80).optional(),
    input: z.unknown().optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.toolCalls && !value.tool) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["toolCalls"],
        message: "Provide either toolCalls[] or a single tool name",
      });
    }
  });
export type AgentTaskPlan = z.infer<typeof agentTaskPlanSchema>;

/** `AgentTask`. */
export const agentTaskInputSchema = z.object({
  agentId: idSchema,
  name: nameSchema,
  description: descriptionSchema.nullish(),
  type: z.string().trim().max(60).nullish(),
  priority: z.number().int().min(0).max(100).default(0),
  status: agentStatusSchema.default("IDLE"),
  input: agentTaskPlanSchema,
  scheduledAt: dateSchema.nullish(),
  /** Milliseconds. */
  timeout: z.number().int().min(1_000).max(600_000).default(60_000),
  maxRetries: z.number().int().min(0).max(10).default(3),
});
export type AgentTaskInput = z.infer<typeof agentTaskInputSchema>;

/** `AgentTool` — a tool registered against one agent. */
export const agentToolInputSchema = z.object({
  agentId: idSchema,
  name: z.string().trim().min(1).max(80),
  description: descriptionSchema.nullish(),
  type: z.enum(["builtin", "mcp", "http"]).default("builtin"),
  isActive: z.boolean().default(true),
});
export type AgentToolInput = z.infer<typeof agentToolInputSchema>;

/** `AgentConversation` turn. */
export const agentMessageInputSchema = z.object({
  conversationId: idSchema,
  role: z.enum(["system", "user", "assistant", "tool"]),
  content: z.string().trim().min(1).max(100_000),
  tokensUsed: z.number().int().nonnegative().nullish(),
});
export type AgentMessageInput = z.infer<typeof agentMessageInputSchema>;

export const agentConversationInputSchema = z.object({
  agentId: idSchema,
  userId: idSchema,
  title: nameSchema.nullish(),
  status: z.enum(["active", "archived"]).default("active"),
});
export type AgentConversationInput = z.infer<typeof agentConversationInputSchema>;

/** `MCPServer`. */
export const mcpServerInputSchema = z.object({
  name: nameSchema,
  url: urlSchema,
  description: descriptionSchema.nullish(),
  version: z.string().trim().max(40).nullish(),
  protocol: z.enum(["stdio", "http", "sse"]).default("http"),
  status: z.enum(["active", "inactive", "error"]).default("active"),
  healthCheckUrl: urlSchema.nullish(),
  isActive: z.boolean().default(true),
  /** Encrypted at rest via `security/field-crypto.ts` before persistence. */
  config: z.record(z.string(), z.unknown()).nullish(),
});
export type McpServerInput = z.infer<typeof mcpServerInputSchema>;

export const mcpConnectionInputSchema = z.object({
  agentId: idSchema,
  serverId: idSchema,
  status: z.enum(["connected", "disconnected", "error"]).default("connected"),
});
export type McpConnectionInput = z.infer<typeof mcpConnectionInputSchema>;

/**
 * `DataSource`. `credentials` is encrypted at rest — the schema accepts the
 * plaintext record and the repository encrypts before writing.
 */
export const dataSourceInputSchema = z.object({
  name: nameSchema,
  type: dataSourceTypeSchema,
  description: descriptionSchema.nullish(),
  connectionString: z.string().trim().max(500).nullish(),
  credentials: z.record(z.string(), z.string()).nullish(),
  isActive: z.boolean().default(true),
  syncFrequency: z.string().trim().max(40).nullish(),
});
export type DataSourceInput = z.infer<typeof dataSourceInputSchema>;

/** Request accepted by `executeAgentTaskAction`. */
export const executeAgentTaskInputSchema = z.object({
  organizationId: idSchema,
  agentId: idSchema,
  taskId: idSchema.optional(),
  plan: agentTaskPlanSchema.optional(),
  maxSteps: z.number().int().min(1).max(50).optional(),
});
export type ExecuteAgentTaskInput = z.infer<typeof executeAgentTaskInputSchema>;

export const agentQuerySchema = z.object({
  organizationId: idSchema,
  status: agentStatusSchema.optional(),
  type: z.string().trim().max(60).optional(),
});
export type AgentQuery = z.infer<typeof agentQuerySchema>;

export const aiAnalysisQuerySchema = z.object({
  organizationId: idSchema,
  type: aiAnalysisTypeSchema.optional(),
  status: agentStatusSchema.optional(),
  modelType: z.enum(AI_MODEL_TYPES).optional(),
  since: dateSchema.optional(),
});
export type AiAnalysisQuery = z.infer<typeof aiAnalysisQuerySchema>;

/** `AnomalyDetection` resolution. */
export const resolveAnomalyInputSchema = z.object({
  anomalyId: idSchema,
  resolution: z.enum(["CONFIRMED", "FALSE_POSITIVE", "CORRECTED"]),
  notes: descriptionSchema.nullish(),
});
export type ResolveAnomalyInput = z.infer<typeof resolveAnomalyInputSchema>;

/** `AIRecommendation` acceptance. */
export const recommendationDecisionSchema = z.object({
  recommendationId: idSchema,
  decision: z.enum(["ACCEPTED", "REJECTED", "DEFERRED"]),
  expectedImpact: nonNegativeNumber.nullish(),
  notes: descriptionSchema.nullish(),
});
export type RecommendationDecisionInput = z.infer<typeof recommendationDecisionSchema>;
