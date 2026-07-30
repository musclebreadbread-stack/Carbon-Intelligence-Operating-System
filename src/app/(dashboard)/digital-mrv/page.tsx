"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Shield, Radio, FileText, CheckCircle } from "lucide-react";

export default function DigitalMRVPage() {
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Digital MRV</h1>
          <p className="text-sm text-muted-foreground">
            Monitoring, Reporting, and Verification - digital infrastructure for transparent carbon accounting.
          </p>
        </div>
        <Badge variant="secondary" className="bg-emerald-100 text-emerald-700">
          <Shield className="mr-1 size-3" />
          ISO 14064 Aligned
        </Badge>
      </div>

      {/* Overview Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <Radio className="size-3" />
              Monitoring Points
            </CardDescription>
            <CardTitle className="text-2xl">142</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Active data collection streams</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <FileText className="size-3" />
              Reports Generated
            </CardDescription>
            <CardTitle className="text-2xl">24</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">This fiscal year</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <CheckCircle className="size-3" />
              Verified Claims
            </CardDescription>
            <CardTitle className="text-2xl">18</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Third-party verified</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs: Monitoring, Reporting, Verification */}
      <Tabs defaultValue="monitoring">
        <TabsList>
          <TabsTrigger value="monitoring">Monitoring</TabsTrigger>
          <TabsTrigger value="reporting">Reporting</TabsTrigger>
          <TabsTrigger value="verification">Verification</TabsTrigger>
        </TabsList>

        <TabsContent value="monitoring">
          <Card>
            <CardHeader>
              <CardTitle>Data Monitoring</CardTitle>
              <CardDescription>Real-time monitoring of emission sources and data streams</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {[
                  { name: "Energy Meters", streams: 45, coverage: 98, status: "active" },
                  { name: "Fleet Telematics", streams: 32, coverage: 94, status: "active" },
                  { name: "Process Sensors", streams: 28, coverage: 87, status: "active" },
                  { name: "Waste Management", streams: 12, coverage: 76, status: "partial" },
                  { name: "Supply Chain APIs", streams: 25, coverage: 62, status: "partial" },
                ].map((item) => (
                  <div key={item.name} className="flex items-center gap-4 rounded-md border p-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">{item.name}</p>
                        <Badge variant={item.status === "active" ? "secondary" : "outline"} className="text-xs">
                          {item.status}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{item.streams} active streams</p>
                    </div>
                    <div className="w-32">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Coverage</span>
                        <span className="font-medium">{item.coverage}%</span>
                      </div>
                      <Progress value={item.coverage} className="mt-1 h-1.5" />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reporting">
          <Card>
            <CardHeader>
              <CardTitle>Reporting Workflows</CardTitle>
              <CardDescription>Automated report generation and submission tracking</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {[
                  { name: "Annual GHG Inventory 2023", framework: "GHG Protocol", due: "2024-03-31", status: "submitted" },
                  { name: "CDP Climate Change 2024", framework: "CDP", due: "2024-07-31", status: "in_progress" },
                  { name: "CSRD Double Materiality", framework: "ESRS", due: "2024-12-31", status: "draft" },
                  { name: "Q1 2024 Internal Report", framework: "Internal", due: "2024-04-15", status: "in_progress" },
                ].map((report) => (
                  <div key={report.name} className="flex items-center justify-between rounded-md border p-3">
                    <div>
                      <p className="text-sm font-medium">{report.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {report.framework} - Due: {report.due}
                      </p>
                    </div>
                    <Badge
                      variant={report.status === "submitted" ? "secondary" : "outline"}
                      className="text-xs"
                    >
                      {report.status.replace("_", " ")}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="verification">
          <Card>
            <CardHeader>
              <CardTitle>Verification Status</CardTitle>
              <CardDescription>Third-party verification and assurance engagements</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {[
                  { name: "FY2023 Scope 1 & 2", verifier: "Bureau Veritas", level: "Limited Assurance", status: "completed" },
                  { name: "FY2023 Scope 3", verifier: "ERM CVS", level: "Limited Assurance", status: "in_progress" },
                  { name: "Carbon Neutrality Claim", verifier: "SGS", level: "Reasonable Assurance", status: "planned" },
                ].map((item) => (
                  <div key={item.name} className="flex items-center justify-between rounded-md border p-3">
                    <div>
                      <p className="text-sm font-medium">{item.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.verifier} - {item.level}
                      </p>
                    </div>
                    <Badge
                      variant={item.status === "completed" ? "secondary" : "outline"}
                      className="text-xs"
                    >
                      {item.status.replace("_", " ")}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
