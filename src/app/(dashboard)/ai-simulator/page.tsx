import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FlaskConical, Play, TrendingDown, DollarSign, Calendar } from "lucide-react";

const scenarios = [
  {
    name: "Business as Usual (BAU)",
    type: "bau" as const,
    description: "Continuation of current operations without additional decarbonization measures.",
    targetYear: 2050,
    reduction: 15,
    capex: 0,
    opex: 2.1,
    risk: "high",
    color: "text-red-500",
  },
  {
    name: "Carbon Neutral",
    type: "carbon_neutral" as const,
    description: "Achieve carbon neutrality through a mix of reduction and high-quality offsets.",
    targetYear: 2035,
    reduction: 65,
    capex: 28.5,
    opex: -4.2,
    risk: "medium",
    color: "text-amber-500",
  },
  {
    name: "Net Zero",
    type: "net_zero" as const,
    description: "Full value chain net-zero aligned with SBTi Net-Zero Standard.",
    targetYear: 2050,
    reduction: 90,
    capex: 45.2,
    opex: -8.7,
    risk: "medium",
    color: "text-emerald-500",
  },
  {
    name: "Aggressive",
    type: "aggressive" as const,
    description: "Accelerated decarbonization with maximum investment and earliest possible timeline.",
    targetYear: 2040,
    reduction: 95,
    capex: 62.8,
    opex: -12.3,
    risk: "high",
    color: "text-blue-500",
  },
  {
    name: "Conservative",
    type: "conservative" as const,
    description: "Phased approach prioritizing low-cost measures and proven technologies.",
    targetYear: 2050,
    reduction: 50,
    capex: 18.4,
    opex: -3.5,
    risk: "low",
    color: "text-slate-500",
  },
  {
    name: "Custom",
    type: "custom" as const,
    description: "Define your own scenario parameters, initiatives, and timeline.",
    targetYear: 2045,
    reduction: 75,
    capex: 35.0,
    opex: -6.0,
    risk: "medium",
    color: "text-purple-500",
  },
];

export default function AISimulatorPage() {
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">AI Simulator</h1>
          <p className="text-sm text-muted-foreground">
            Simulate and compare decarbonization scenarios to find the optimal pathway.
          </p>
        </div>
        <Button size="sm">
          <Play className="size-4" />
          Run Comparison
        </Button>
      </div>

      {/* Status Bar */}
      <Card>
        <CardContent className="flex items-center gap-3 p-4">
          <FlaskConical className="size-5 text-purple-500" />
          <div className="flex-1">
            <p className="text-sm font-medium">6 scenarios configured</p>
            <p className="text-xs text-muted-foreground">
              Last simulation run: 2 hours ago. Based on current emission baseline of 12,450 tCO2e.
            </p>
          </div>
          <Badge variant="secondary">Ready</Badge>
        </CardContent>
      </Card>

      {/* Scenario Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {scenarios.map((scenario) => (
          <Card key={scenario.name} className="flex flex-col">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{scenario.name}</CardTitle>
                <Badge
                  variant={
                    scenario.risk === "low"
                      ? "secondary"
                      : scenario.risk === "high"
                        ? "destructive"
                        : "outline"
                  }
                  className="text-xs"
                >
                  {scenario.risk} risk
                </Badge>
              </div>
              <CardDescription className="text-xs">
                {scenario.description}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-1">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <TrendingDown className="size-3" />
                    Reduction
                  </span>
                  <span className={`text-sm font-semibold ${scenario.color}`}>
                    {scenario.reduction}%
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Calendar className="size-3" />
                    Target Year
                  </span>
                  <span className="text-sm font-medium">{scenario.targetYear}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <DollarSign className="size-3" />
                    CAPEX
                  </span>
                  <span className="text-sm font-medium">${scenario.capex}M</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <DollarSign className="size-3" />
                    OPEX Impact
                  </span>
                  <span className={`text-sm font-medium ${scenario.opex < 0 ? "text-emerald-600" : "text-red-500"}`}>
                    {scenario.opex > 0 ? "+" : ""}{scenario.opex}M/yr
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Comparison Chart Placeholder */}
      <Card>
        <CardHeader>
          <CardTitle>Scenario Comparison</CardTitle>
          <CardDescription>
            Side-by-side analysis of emission trajectories across all scenarios
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex h-64 items-center justify-center rounded-md border border-dashed bg-muted/50">
            <p className="text-sm text-muted-foreground">
              Scenario comparison chart placeholder
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
