"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Globe, Key, Plus, Copy } from "lucide-react";

const endpoints = [
  { method: "GET", path: "/api/v1/emissions", name: "List Emissions", status: "active", rateLimit: "1000/hr" },
  { method: "POST", path: "/api/v1/emissions", name: "Create Emission Record", status: "active", rateLimit: "500/hr" },
  { method: "GET", path: "/api/v1/organizations", name: "List Organizations", status: "active", rateLimit: "1000/hr" },
  { method: "GET", path: "/api/v1/factors", name: "Get Emission Factors", status: "active", rateLimit: "2000/hr" },
  { method: "POST", path: "/api/v1/calculations/run", name: "Run Calculation", status: "active", rateLimit: "100/hr" },
  { method: "GET", path: "/api/v1/reports", name: "List Reports", status: "active", rateLimit: "500/hr" },
  { method: "POST", path: "/api/v1/activity-data/import", name: "Import Activity Data", status: "active", rateLimit: "50/hr" },
  { method: "GET", path: "/api/v2/emissions", name: "List Emissions (v2)", status: "deprecated", rateLimit: "500/hr" },
];

const apiKeys = [
  { name: "Production Key", prefix: "cios_prod_", created: "2024-01-15", lastUsed: "2 min ago", status: "active" },
  { name: "Staging Key", prefix: "cios_stg_", created: "2024-02-20", lastUsed: "1 hour ago", status: "active" },
  { name: "Development Key", prefix: "cios_dev_", created: "2024-03-01", lastUsed: "3 days ago", status: "active" },
  { name: "Legacy Integration", prefix: "cios_leg_", created: "2023-06-10", lastUsed: "30 days ago", status: "revoked" },
];

function getMethodColor(method: string) {
  switch (method) {
    case "GET":
      return "bg-emerald-100 text-emerald-700";
    case "POST":
      return "bg-blue-100 text-blue-700";
    case "PUT":
      return "bg-amber-100 text-amber-700";
    case "DELETE":
      return "bg-red-100 text-red-700";
    default:
      return "";
  }
}

export default function APIGatewayPage() {
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">API Gateway</h1>
          <p className="text-sm text-muted-foreground">
            Manage API endpoints, access keys, and integration configurations.
          </p>
        </div>
        <Button size="sm">
          <Plus className="size-4" />
          Create API Key
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <Globe className="size-3" />
              Active Endpoints
            </CardDescription>
            <CardTitle className="text-2xl">7</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">v1 API (1 deprecated)</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>API Calls Today</CardDescription>
            <CardTitle className="text-2xl">12,847</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">+18% vs yesterday</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Avg Response Time</CardDescription>
            <CardTitle className="text-2xl">124ms</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">P95: 340ms</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Error Rate</CardDescription>
            <CardTitle className="text-2xl">0.12%</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Below 1% threshold</p>
          </CardContent>
        </Card>
      </div>

      {/* API Endpoints */}
      <Card>
        <CardHeader>
          <CardTitle>API Endpoints</CardTitle>
          <CardDescription>Available REST API endpoints and their configuration</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <div className="grid grid-cols-5 gap-4 border-b bg-muted/50 p-3 text-xs font-medium text-muted-foreground">
              <span>Method</span>
              <span className="col-span-2">Endpoint</span>
              <span>Rate Limit</span>
              <span>Status</span>
            </div>
            {endpoints.map((endpoint, index) => (
              <div key={index} className="grid grid-cols-5 gap-4 border-b p-3 text-sm last:border-0">
                <Badge className={`w-fit text-xs font-mono ${getMethodColor(endpoint.method)}`}>
                  {endpoint.method}
                </Badge>
                <div className="col-span-2">
                  <p className="font-mono text-xs">{endpoint.path}</p>
                  <p className="text-xs text-muted-foreground">{endpoint.name}</p>
                </div>
                <span className="text-xs text-muted-foreground">{endpoint.rateLimit}</span>
                <Badge
                  variant={endpoint.status === "active" ? "secondary" : "destructive"}
                  className="w-fit text-xs"
                >
                  {endpoint.status}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* API Key Management */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>API Keys</CardTitle>
              <CardDescription>Manage access credentials for API integrations</CardDescription>
            </div>
            <Button variant="outline" size="sm">
              <Key className="size-4" />
              Rotate Keys
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {apiKeys.map((key) => (
              <div key={key.name} className="flex items-center gap-4 rounded-md border p-3">
                <Key className="size-4 text-muted-foreground" />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{key.name}</p>
                    <Badge
                      variant={key.status === "active" ? "secondary" : "destructive"}
                      className="text-xs"
                    >
                      {key.status}
                    </Badge>
                  </div>
                  <p className="font-mono text-xs text-muted-foreground">
                    {key.prefix}••••••••••••
                  </p>
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  <p>Last used: {key.lastUsed}</p>
                  <p>Created: {key.created}</p>
                </div>
                <Button variant="ghost" size="icon-sm">
                  <Copy className="size-3" />
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
