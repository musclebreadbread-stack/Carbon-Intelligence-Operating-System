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
import { Coins, TrendingUp, ArrowUpRight } from "lucide-react";

export default function CarbonFinancePage() {
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Carbon Finance</h1>
          <p className="text-sm text-muted-foreground">
            Manage carbon credits, offsets, emissions trading, RECs, and power purchase agreements.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-md border px-3 py-1.5">
          <Coins className="size-4 text-emerald-600" />
          <span className="text-sm font-medium">Portfolio Value: $2.4M</span>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Carbon Credits</CardDescription>
            <CardTitle className="text-2xl">12,500 tCO2e</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-1 text-xs text-emerald-600">
              <ArrowUpRight className="size-3" />
              <span>+15% portfolio growth</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Avg. Credit Price</CardDescription>
            <CardTitle className="text-2xl">$48.20</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-1 text-xs text-emerald-600">
              <TrendingUp className="size-3" />
              <span>+8.5% vs last quarter</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>RECs Held</CardDescription>
            <CardTitle className="text-2xl">45,000 MWh</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Renewable energy certificates</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>ETS Exposure</CardDescription>
            <CardTitle className="text-2xl">$1.2M</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">EU ETS compliance liability</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="credits">
        <TabsList>
          <TabsTrigger value="credits">Carbon Credits</TabsTrigger>
          <TabsTrigger value="offsets">Offsets</TabsTrigger>
          <TabsTrigger value="ets">ETS</TabsTrigger>
          <TabsTrigger value="rec">REC</TabsTrigger>
          <TabsTrigger value="ppa">PPA</TabsTrigger>
        </TabsList>

        <TabsContent value="credits">
          <Card>
            <CardHeader>
              <CardTitle>Carbon Credit Portfolio</CardTitle>
              <CardDescription>Active carbon credits and retirement schedule</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <div className="grid grid-cols-5 gap-4 border-b bg-muted/50 p-3 text-xs font-medium text-muted-foreground">
                  <span>Registry</span>
                  <span>Project Type</span>
                  <span>Vintage</span>
                  <span>Quantity</span>
                  <span>Status</span>
                </div>
                {[
                  { registry: "Verra (VCS)", type: "REDD+", vintage: 2023, qty: "5,000 tCO2e", status: "active" },
                  { registry: "Gold Standard", type: "Renewable Energy", vintage: 2023, qty: "3,500 tCO2e", status: "active" },
                  { registry: "Verra (VCS)", type: "Improved Cookstoves", vintage: 2022, qty: "2,000 tCO2e", status: "retired" },
                  { registry: "ACR", type: "Afforestation", vintage: 2024, qty: "2,000 tCO2e", status: "pending" },
                ].map((credit, index) => (
                  <div key={index} className="grid grid-cols-5 gap-4 border-b p-3 text-sm last:border-0">
                    <span className="font-medium">{credit.registry}</span>
                    <span className="text-muted-foreground">{credit.type}</span>
                    <span className="text-muted-foreground">{credit.vintage}</span>
                    <span className="font-mono">{credit.qty}</span>
                    <Badge variant={credit.status === "active" ? "secondary" : "outline"} className="w-fit text-xs">
                      {credit.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="offsets">
          <Card>
            <CardHeader>
              <CardTitle>Offset Projects</CardTitle>
              <CardDescription>Carbon offset project investments and performance</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {[
                  { name: "Amazon Rainforest Protection", type: "REDD+", delivery: "5,000 tCO2e/yr", status: "delivering" },
                  { name: "Kenya Clean Cookstoves", type: "Improved Cookstoves", delivery: "2,000 tCO2e/yr", status: "delivering" },
                  { name: "India Solar Farm", type: "Renewable Energy", delivery: "3,500 tCO2e/yr", status: "delivering" },
                ].map((project) => (
                  <div key={project.name} className="flex items-center justify-between rounded-md border p-3">
                    <div>
                      <p className="text-sm font-medium">{project.name}</p>
                      <p className="text-xs text-muted-foreground">{project.type} - {project.delivery}</p>
                    </div>
                    <Badge variant="secondary" className="text-xs">{project.status}</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ets">
          <Card>
            <CardHeader>
              <CardTitle>Emissions Trading System</CardTitle>
              <CardDescription>ETS compliance and allowance management</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex h-48 items-center justify-center rounded-md border border-dashed bg-muted/50">
                <p className="text-sm text-muted-foreground">ETS allowance tracking and compliance dashboard</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rec">
          <Card>
            <CardHeader>
              <CardTitle>Renewable Energy Certificates</CardTitle>
              <CardDescription>REC portfolio and retirement tracking</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex h-48 items-center justify-center rounded-md border border-dashed bg-muted/50">
                <p className="text-sm text-muted-foreground">REC portfolio management dashboard</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ppa">
          <Card>
            <CardHeader>
              <CardTitle>Power Purchase Agreements</CardTitle>
              <CardDescription>Active PPAs and renewable energy procurement</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex h-48 items-center justify-center rounded-md border border-dashed bg-muted/50">
                <p className="text-sm text-muted-foreground">PPA contract management and energy delivery tracking</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
