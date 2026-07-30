import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Bot, Plug, Plus, Activity, CheckCircle2, AlertCircle } from "lucide-react";

const agents = [
  {
    name: "Data Quality Agent",
    type: "Quality Assurance",
    description: "Monitors incoming activity data for anomalies, duplicates, and format issues",
    status: "active" as const,
    lastRun: "2 min ago",
    successRate: 99.2,
    tasksCompleted: 1247,
  },
  {
    name: "Emission Calculator Agent",
    type: "Calculation",
    description: "Automatically applies emission factors and calculates GHG emissions from activity data",
    status: "active" as const,
    lastRun: "5 min ago",
    successRate: 98.7,
    tasksCompleted: 856,
  },
  {
    name: "Report Generator Agent",
    type: "Reporting",
    description: "Generates compliance reports and disclosure documents from validated data",
    status: "idle" as const,
    lastRun: "3 hours ago",
    successRate: 97.5,
    tasksCompleted: 52,
  },
  {
    name: "Supplier Engagement Agent",
    type: "Scope 3",
    description: "Manages supplier data collection requests and follow-ups for Scope 3 reporting",
    status: "active" as const,
    lastRun: "30 min ago",
    successRate: 94.1,
    tasksCompleted: 340,
  },
  {
    name: "Anomaly Detection Agent",
    type: "AI Analytics",
    description: "Real-time pattern recognition for identifying unusual emission trends",
    status: "active" as const,
    lastRun: "1 min ago",
    successRate: 96.8,
    tasksCompleted: 2130,
  },
  {
    name: "Compliance Monitor Agent",
    type: "Regulatory",
    description: "Tracks regulatory changes and assesses impact on reporting requirements",
    status: "error" as const,
    lastRun: "1 hour ago",
    successRate: 91.3,
    tasksCompleted: 189,
  },
];

const mcpConnections = [
  { name: "Supabase Database", type: "Data Source", status: "connected", latency: "12ms" },
  { name: "OpenAI GPT-4", type: "LLM Provider", status: "connected", latency: "245ms" },
  { name: "IoT Sensor Hub", type: "Data Stream", status: "connected", latency: "34ms" },
  { name: "ERP System (SAP)", type: "Integration", status: "connected", latency: "89ms" },
  { name: "Email Service", type: "Notification", status: "degraded", latency: "520ms" },
];

export default function AIAgentsPage() {
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">AI Agents</h1>
          <p className="text-sm text-muted-foreground">
            Manage autonomous AI agents and their MCP (Model Context Protocol) connections.
          </p>
        </div>
        <Button size="sm">
          <Plus className="size-4" />
          Deploy Agent
        </Button>
      </div>

      {/* Agent Status Overview */}
      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <Bot className="size-3" />
              Total Agents
            </CardDescription>
            <CardTitle className="text-2xl">6</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">4 active, 1 idle, 1 error</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <Activity className="size-3" />
              Tasks Today
            </CardDescription>
            <CardTitle className="text-2xl">342</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Completed autonomously</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <CheckCircle2 className="size-3" />
              Success Rate
            </CardDescription>
            <CardTitle className="text-2xl">96.3%</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Across all agents</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <Plug className="size-3" />
              MCP Connections
            </CardDescription>
            <CardTitle className="text-2xl">5</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">4 healthy, 1 degraded</p>
          </CardContent>
        </Card>
      </div>

      {/* Agent Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {agents.map((agent) => (
          <Card key={agent.name}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardDescription className="flex items-center gap-1.5">
                  <Bot className="size-3" />
                  {agent.type}
                </CardDescription>
                <Badge
                  variant={
                    agent.status === "active"
                      ? "secondary"
                      : agent.status === "error"
                        ? "destructive"
                        : "outline"
                  }
                  className="text-xs"
                >
                  {agent.status}
                </Badge>
              </div>
              <CardTitle className="text-base">{agent.name}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">{agent.description}</p>
              <div className="mt-3 space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Success Rate</span>
                  <span className="font-medium">{agent.successRate}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tasks Completed</span>
                  <span className="font-medium">{agent.tasksCompleted.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Last Run</span>
                  <span className="font-medium">{agent.lastRun}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* MCP Connections */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Plug className="size-4" />
            <CardTitle>MCP Connections</CardTitle>
          </div>
          <CardDescription>Model Context Protocol service connections</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {mcpConnections.map((conn) => (
              <div key={conn.name} className="flex items-center gap-4 rounded-md border p-3">
                {conn.status === "connected" ? (
                  <CheckCircle2 className="size-4 text-emerald-600" />
                ) : (
                  <AlertCircle className="size-4 text-amber-500" />
                )}
                <div className="flex-1">
                  <p className="text-sm font-medium">{conn.name}</p>
                  <p className="text-xs text-muted-foreground">{conn.type}</p>
                </div>
                <span className="text-xs text-muted-foreground">{conn.latency}</span>
                <Badge
                  variant={conn.status === "connected" ? "secondary" : "outline"}
                  className="text-xs"
                >
                  {conn.status}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
