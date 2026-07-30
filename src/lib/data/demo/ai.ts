/**
 * Demo tenant: AI models, agents, tasks, MCP servers and data sources.
 *
 * No analysis *results* are stored here. Anomalies, forecasts, data gaps and
 * confidence scores are recomputed on demand by the item-24 engines over the
 * fixture activity data, so what the UI shows in demo mode is genuinely derived.
 */

import type { AIModelType, AgentStatus, DataSourceType } from "@/lib/core/enums";
import { BUILT_IN_TOOLS } from "@/lib/ai/agents/tool-registry";

import { DEMO_CURRENT_YEAR } from "./activity-data";
import { DEMO_ORGANIZATION_ID } from "./organization";

export type DemoAiModel = {
  readonly id: string;
  readonly organizationId: string;
  readonly name: string;
  readonly type: AIModelType;
  readonly version: string;
  readonly description: string;
  readonly provider: string;
  readonly endpoint: string | null;
  readonly accuracy: number;
  readonly isActive: boolean;
  readonly trainedAt: Date;
};

export const DEMO_AI_MODELS: readonly DemoAiModel[] = [
  {
    id: "demo-model-anomaly-zscore",
    organizationId: DEMO_ORGANIZATION_ID,
    name: "활동량 이상탐지 (Activity anomaly detector)",
    type: "ANOMALY_DETECTION",
    version: "1.3.0",
    description: "Robust z-score and IQR detection over monthly activity series.",
    provider: "In-house (deterministic statistics)",
    endpoint: null,
    accuracy: 0.91,
    isActive: true,
    trainedAt: new Date(Date.UTC(2024, 8, 30)),
  },
  {
    id: "demo-model-forecast-holt",
    organizationId: DEMO_ORGANIZATION_ID,
    name: "배출량 예측 (Emissions forecaster)",
    type: "TIME_SERIES",
    version: "2.0.1",
    description: "Holt linear-trend exponential smoothing with prediction intervals.",
    provider: "In-house (deterministic statistics)",
    endpoint: null,
    accuracy: 0.87,
    isActive: true,
    trainedAt: new Date(Date.UTC(2024, 10, 12)),
  },
  {
    id: "demo-model-narrative-llm",
    organizationId: DEMO_ORGANIZATION_ID,
    name: "설명 생성 LLM (Explanation narrator)",
    type: "NLP",
    version: "gpt-4o-mini",
    description:
      "Renders human-readable narrative over deterministic numeric results. Falls back to the deterministic template client when no API key is configured.",
    provider: "OpenAI (optional)",
    endpoint: "https://api.openai.com/v1/chat/completions",
    accuracy: 0.0,
    isActive: true,
    trainedAt: new Date(Date.UTC(2024, 6, 18)),
  },
  {
    id: "demo-model-recommendation",
    organizationId: DEMO_ORGANIZATION_ID,
    name: "감축 권고 엔진 (Abatement recommender)",
    type: "RECOMMENDATION",
    version: "1.1.0",
    description: "Ranks abatement technologies by marginal cost against the residual gap.",
    provider: "In-house (MACC)",
    endpoint: null,
    accuracy: 0.79,
    isActive: true,
    trainedAt: new Date(Date.UTC(2024, 7, 5)),
  },
];

export type DemoAgent = {
  readonly id: string;
  readonly organizationId: string;
  readonly name: string;
  readonly type: string;
  readonly description: string;
  readonly version: string;
  readonly capabilities: readonly string[];
  readonly status: AgentStatus;
  readonly isActive: boolean;
  readonly lastActiveAt: Date;
  readonly maxSteps: number;
};

export const DEMO_AGENTS: readonly DemoAgent[] = [
  {
    id: "demo-agent-inventory",
    organizationId: DEMO_ORGANIZATION_ID,
    name: "인벤토리 에이전트 (Inventory agent)",
    type: "inventory",
    description: "Runs calculations and answers inventory questions.",
    version: "1.2.0",
    capabilities: ["calculate_emissions", "query_inventory", "lookup_emission_factor"],
    status: "IDLE",
    isActive: true,
    lastActiveAt: new Date(Date.UTC(2024, 11, 19, 6, 12)),
    maxSteps: 10,
  },
  {
    id: "demo-agent-quality",
    organizationId: DEMO_ORGANIZATION_ID,
    name: "데이터품질 에이전트 (Data quality agent)",
    type: "quality",
    description: "Screens activity data for anomalies and gaps before the assurance cycle.",
    version: "1.0.4",
    capabilities: ["detect_anomalies", "query_inventory"],
    status: "IDLE",
    isActive: true,
    lastActiveAt: new Date(Date.UTC(2024, 11, 20, 1, 40)),
    maxSteps: 8,
  },
  {
    id: "demo-agent-strategy",
    organizationId: DEMO_ORGANIZATION_ID,
    name: "전략 시뮬레이션 에이전트 (Strategy simulation agent)",
    type: "strategy",
    description: "Projects scenarios and compares pathways against the SBTi target.",
    version: "0.9.2",
    capabilities: ["project_scenario", "query_inventory"],
    status: "IDLE",
    isActive: true,
    lastActiveAt: new Date(Date.UTC(2024, 11, 17, 22, 5)),
    maxSteps: 12,
  },
];

export type DemoAgentTask = {
  readonly id: string;
  readonly agentId: string;
  readonly name: string;
  readonly description: string;
  readonly type: string;
  readonly priority: number;
  readonly status: AgentStatus;
  readonly input: { readonly toolCalls: readonly { readonly tool: string; readonly input: unknown }[] };
  readonly scheduledAt: Date;
  readonly timeout: number;
  readonly maxRetries: number;
};

export const DEMO_AGENT_TASKS: readonly DemoAgentTask[] = [
  {
    id: "demo-task-monthly-close",
    agentId: "demo-agent-inventory",
    name: "월간 마감 계산 (Monthly close calculation)",
    description: "Recalculate the year-to-date inventory after the monthly data load.",
    type: "calculation",
    priority: 10,
    status: "IDLE",
    input: {
      toolCalls: [
        {
          tool: "query_inventory",
          input: { organizationId: DEMO_ORGANIZATION_ID, reportingYear: DEMO_CURRENT_YEAR },
        },
      ],
    },
    scheduledAt: new Date(Date.UTC(2025, 0, 5, 1, 0)),
    timeout: 120_000,
    maxRetries: 3,
  },
  {
    id: "demo-task-anomaly-sweep",
    agentId: "demo-agent-quality",
    name: "이상치 점검 (Anomaly sweep)",
    description: "Screen every activity series for outliers before the assurance visit.",
    type: "quality",
    priority: 8,
    status: "IDLE",
    input: {
      toolCalls: [
        {
          tool: "detect_anomalies",
          input: { method: "zscore", threshold: 3 },
        },
      ],
    },
    scheduledAt: new Date(Date.UTC(2025, 0, 7, 2, 0)),
    timeout: 60_000,
    maxRetries: 2,
  },
  {
    id: "demo-task-scenario-refresh",
    agentId: "demo-agent-strategy",
    name: "시나리오 갱신 (Scenario refresh)",
    description: "Reproject every published scenario off the new baseline.",
    type: "strategy",
    priority: 5,
    status: "IDLE",
    input: {
      toolCalls: [
        {
          tool: "project_scenario",
          input: { type: "NET_ZERO", targetYear: 2050 },
        },
      ],
    },
    scheduledAt: new Date(Date.UTC(2025, 0, 9, 3, 0)),
    timeout: 90_000,
    maxRetries: 2,
  },
];

/** Tool catalogue rows, derived from the real registry rather than restated. */
export const DEMO_AGENT_TOOLS = DEMO_AGENTS.flatMap((agent) =>
  BUILT_IN_TOOLS.filter((tool) => agent.capabilities.includes(tool.name)).map((tool) => ({
    id: `demo-agent-tool-${agent.id}-${tool.name}`,
    agentId: agent.id,
    name: tool.name,
    description: tool.description,
    type: "builtin" as const,
    isActive: true,
  })),
);

export type DemoMcpServer = {
  readonly id: string;
  readonly name: string;
  readonly url: string;
  readonly description: string;
  readonly version: string;
  readonly protocol: string;
  readonly status: string;
  readonly healthCheckUrl: string;
  readonly isActive: boolean;
  readonly lastHealthCheck: Date;
};

export const DEMO_MCP_SERVERS: readonly DemoMcpServer[] = [
  {
    id: "demo-mcp-factor-library",
    name: "배출계수 MCP 서버 (Emission factor MCP server)",
    url: "https://example.com/mcp/emission-factors",
    description: "Remote factor library exposing lookup and version-diff tools.",
    version: "1.0.0",
    protocol: "http",
    status: "inactive",
    healthCheckUrl: "https://example.com/mcp/emission-factors/health",
    isActive: false,
    lastHealthCheck: new Date(Date.UTC(2024, 11, 20, 3, 0)),
  },
  {
    id: "demo-mcp-registry",
    name: "크레딧 레지스트리 MCP 서버 (Credit registry MCP server)",
    url: "https://example.com/mcp/credit-registry",
    description: "Remote registry exposing serial-number lookup and retirement status.",
    version: "0.4.1",
    protocol: "http",
    status: "inactive",
    healthCheckUrl: "https://example.com/mcp/credit-registry/health",
    isActive: false,
    lastHealthCheck: new Date(Date.UTC(2024, 11, 20, 3, 0)),
  },
];

export const DEMO_MCP_CONNECTIONS = DEMO_MCP_SERVERS.map((server) => ({
  id: `demo-mcp-connection-${server.id}`,
  agentId: "demo-agent-inventory",
  serverId: server.id,
  status: "disconnected" as const,
  lastPingAt: server.lastHealthCheck,
  errorCount: 0,
}));

export type DemoDataSource = {
  readonly id: string;
  readonly name: string;
  readonly type: DataSourceType;
  readonly description: string;
  readonly connectionString: string | null;
  readonly isActive: boolean;
  readonly lastSyncAt: Date | null;
  readonly syncFrequency: string;
};

export const DEMO_DATA_SOURCES: readonly DemoDataSource[] = [
  {
    id: "demo-datasource-erp",
    name: "ERP (구매·생산) / ERP purchasing and production",
    type: "ERP_SYSTEM",
    description: "Goods receipts, production volumes and spend by cost centre.",
    connectionString: null,
    isActive: true,
    lastSyncAt: new Date(Date.UTC(2024, 11, 20, 18, 0)),
    syncFrequency: "daily",
  },
  {
    id: "demo-datasource-bems",
    name: "BEMS 계측 데이터 (Building energy monitoring)",
    type: "IOT_SENSOR",
    description: "Half-hourly electricity and gas readings from the plant BEMS.",
    connectionString: null,
    isActive: true,
    lastSyncAt: new Date(Date.UTC(2024, 11, 20, 23, 30)),
    syncFrequency: "hourly",
  },
  {
    id: "demo-datasource-3pl",
    name: "3PL 운송 API (Third-party logistics API)",
    type: "API_INTEGRATION",
    description: "Consignment-level freight data from the logistics provider.",
    connectionString: null,
    isActive: true,
    lastSyncAt: new Date(Date.UTC(2024, 11, 19, 9, 15)),
    syncFrequency: "daily",
  },
  {
    id: "demo-datasource-travel",
    name: "출장 관리 시스템 (Travel management system)",
    type: "API_INTEGRATION",
    description: "Ticketed passenger-kilometres by employee cost centre.",
    connectionString: null,
    isActive: true,
    lastSyncAt: new Date(Date.UTC(2024, 11, 18, 7, 45)),
    syncFrequency: "weekly",
  },
];
